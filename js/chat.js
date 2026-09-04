"use strict";

(() => {
  const { ApiError, STORAGE_KEYS, apiRequest, streamRequest, ensureAuthenticated, logout } = window.LegaryaAuthApi;
  const chatSession = window.LegaryaChatSession.createChatSession();
  const sidebar = document.querySelector("#conversationSidebar");
  const sidebarBackdrop = document.querySelector("#sidebarBackdrop");
  const openSidebarButton = document.querySelector("#openSidebar");
  const closeSidebarButton = document.querySelector("#closeSidebar");
  const conversationList = document.querySelector("#conversationList");
  const recentChats = document.querySelector(".conversation-list-scroll");
  const conversationListStatus = document.querySelector("#conversationListStatus");
  const messages = document.querySelector("#messages");
  const emptyState = document.querySelector("#emptyState");
  const composer = document.querySelector("#composer");
  const input = document.querySelector("#messageInput");
  const sendButton = document.querySelector("#sendButton");
  const newConversationButton = document.querySelector("#newConversation");
  const legacyButton = document.querySelector("#legacyButton");
  const legacyMenu = document.querySelector("#legacyMenu");
  const legacyList = document.querySelector("#legacyList");
  const createLegacyButton = document.querySelector("#createLegacy");
  const activeLegacyName = document.querySelector("#activeLegacyName");
  const emptyStateTitle = document.querySelector("#emptyStateTitle");
  const emptyStatePrompt = document.querySelector("#emptyStatePrompt");
  const legacyQuickReplies = document.querySelector("#legacyQuickReplies");
  const accountButton = document.querySelector("#accountButton");
  const accountMenu = document.querySelector("#accountMenu");
  const logoutButton = document.querySelector("#logoutButton");
  const userName = document.querySelector("#userName");
  const userEmail = document.querySelector("#userEmail");
  const accountInitial = document.querySelector("#accountInitial");
  const chatStatus = document.querySelector("#chatStatus");
  const openCollaboratorsButton = document.querySelector("#openCollaborators");
  const openLegacyAccessButton = document.querySelector("#openLegacyAccess");
  const collaborationContext = document.querySelector("#collaborationContext");
  const collaborationEntryGreeting = document.querySelector("#collaborationEntryGreeting");
  const { COLLABORATION_GREETING_KEY, policyFor } = window.LegaryaWorkspaceRole;
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  let conversations = [];
  let sending = false;
  let preparingSend = false;
  let openConversationMenu = null;
  let renamingConversationId = null;
  let renameInFlight = false;
  let activeStream = null;
  let streamSequence = 0;
  let legacies = [];
  let emptyTransitionTimer = null;
  let ryaVisualActive = true;
  let greetedCollaborationId = null;
  let collaborationGreetingTimer = null;

  const reportLocalChatState = (event) => {
    if (!new Set(["localhost", "127.0.0.1"]).has(location.hostname)) return;
    void fetch("/client-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phase: "legarya-new-chat",
        version: "4.5",
        event,
        selectedLegacyId: chatSession.selectedLegacyId,
        activeConversationId: chatSession.activeConversationId,
        isNewChat: chatSession.isNewChat,
        navigationVersion: chatSession.navigationVersion,
      }),
      keepalive: true,
    }).catch(() => {});
  };

  const syncRyaVisual = () => {
    try {
      window.RyaEnergyControl?.setActive(ryaVisualActive);
    } catch (error) {
      console.warn("[LegaRya Chat] Rya visual state could not be synchronized.", error);
    }
  };

  const setRyaGenerating = (active) => {
    document.body.classList.toggle("rya-generating", active);
    try {
      window.RyaEnergyControl?.setSpeechEnergy(active
        ? { active: true, scale: 0.2, glow: 0.42, particles: 0.46 }
        : { active: false });
    } catch (error) {
      console.warn("[LegaRya Chat] Rya speech animation could not be updated.", error);
    }
  };

  window.addEventListener("rya-ready", () => {
    syncRyaVisual();
    setRyaGenerating(sending);
  });

  const setChatStatus = (text = "", error = false) => {
    chatStatus.textContent = text;
    chatStatus.classList.toggle("error-state", error);
  };

  const logChatFailure = (stage, error, context = {}) => {
    if (!new Set(["localhost", "127.0.0.1"]).has(location.hostname)) return;
    console.warn("[LegaRya Chat] Request failed", {
      stage,
      status: error instanceof ApiError ? error.status : 0,
      kind: error instanceof ApiError ? error.kind : "unexpected",
      ...context,
    });
  };

  const chatFailure = (error, fallback = "The chat request could not be completed.") => {
    const kind = error instanceof ApiError ? error.kind : "stream_failed";
    if (kind === "legacy_mismatch" || kind === "conversation_scope_mismatch" || kind === "stream_legacy_mismatch") {
      return { category: "legacy_mismatch", message: "This chat no longer matches the selected Legacy. Reload the workspace and try again." };
    }
    if (kind === "conversation_not_found") {
      return { category: "conversation_not_found", message: "This conversation is no longer available in the selected Legacy." };
    }
    if (kind === "authentication" || error?.status === 401) {
      return { category: "auth_failed", message: "Your session has expired. Please sign in again." };
    }
    if (error?.status === 404) {
      window.setTimeout(() => location.replace("gateway.html"), 1400);
      return { category: "access_changed", message: "Your access to this Legacy has changed." };
    }
    if (kind.startsWith("rya_provider_")) {
      return { category: "provider_failed", message: "Rya could not connect to the response service. Try again." };
    }
    if (kind === "network") {
      return { category: "network_failed", message: "The LegaRya service could not be reached. Try again." };
    }
    return { category: "stream_failed", message: fallback };
  };

  const redirectToAuth = () => location.replace("auth.html?mode=login");

  const activeLegacy = () => legacies.find((legacy) => legacy.id === chatSession.selectedLegacyId) || null;

  const legacyDisplayName = (legacy) => {
    if (!legacy) return "Set up a Legacy";
    if (legacy.subject_name) return `${legacy.subject_name}'s Legacy`;
    if (legacy.relationship_to_owner) return `Your ${legacy.relationship_to_owner}`;
    return "New Legacy setup";
  };

  const updateEmptyStateCopy = () => {
    const legacy = activeLegacy();
    const missing = new Set(legacy?.missing_fields || ["target_type"]);
    legacyQuickReplies.hidden = !missing.has("target_type");
    if (!legacy || missing.has("target_type")) {
      emptyStateTitle.textContent = "Who are we building this Legacy for?";
      emptyStatePrompt.textContent = "Tell Rya: yourself, or someone you care about.";
    } else if (missing.has("subject_name")) {
      const relation = legacy.relationship_to_owner && legacy.relationship_to_owner !== "self"
        ? `your ${legacy.relationship_to_owner}`
        : "you";
      emptyStateTitle.textContent = `What should Rya call ${relation}?`;
      emptyStatePrompt.textContent = "Continue naturally in any language.";
    } else if (missing.has("relationship")) {
      emptyStateTitle.textContent = "How are they connected to you?";
      emptyStatePrompt.textContent = "Tell Rya in your own words.";
    } else {
      emptyStateTitle.replaceChildren(document.createTextNode("Speak with "));
      const name = document.createElement("span");
      name.className = "rya-glow";
      name.textContent = "Rya";
      emptyStateTitle.append(name);
      emptyStatePrompt.textContent = legacy.subject_name
        ? `Building ${legacy.subject_name}'s Legacy, one conversation at a time.`
        : "What's on your mind?";
    }
  };

  const closeLegacyMenu = () => {
    legacyMenu.hidden = true;
    legacyButton.setAttribute("aria-expanded", "false");
  };

  const renderLegacyContext = () => {
    const selected = activeLegacy();
    const policy = policyFor(selected);
    activeLegacyName.textContent = legacyDisplayName(selected);
    openCollaboratorsButton.hidden = !policy.canManageCollaborators;
    openLegacyAccessButton.hidden = !policy.canShareLegacy;
    openLegacyAccessButton.hidden = true;
    createLegacyButton.hidden = !policy.canCreateLegacy;
    legacyButton.disabled = policy.selectorLockedToCurrentLegacy;
    collaborationContext.hidden = !policy.isCollaborator;
    collaborationContext.textContent = policy.isCollaborator
      ? `Collaborating on ${selected.subject_name || "this"} Legacy · Owner ${selected.owner_name || "Legacy owner"}`
      : "";
    const pendingGreetingId = Number(sessionStorage.getItem(COLLABORATION_GREETING_KEY));
    if (policy.isCollaborator && pendingGreetingId === selected.id) {
      greetedCollaborationId = selected.id;
      sessionStorage.removeItem(COLLABORATION_GREETING_KEY);
      if (collaborationGreetingTimer !== null) clearTimeout(collaborationGreetingTimer);
      collaborationGreetingTimer = window.setTimeout(() => {
        collaborationEntryGreeting.hidden = true;
        greetedCollaborationId = null;
        collaborationGreetingTimer = null;
      }, 10000);
    }
    collaborationEntryGreeting.hidden = !policy.isCollaborator || greetedCollaborationId !== selected?.id;
    collaborationEntryGreeting.textContent = policy.isCollaborator && greetedCollaborationId === selected?.id
      ? `Hi — you're collaborating on ${selected.subject_name || "this"}'s Legacy. You can share stories, memories, corrections, or anything you think should be preserved. I'll help organize it.`
      : "";
    legacyList.replaceChildren();
    const visibleLegacies = policy.selectorLockedToCurrentLegacy && selected ? [selected] : legacies;
    [["Your Legacies", "owner"], ["Collaborations", "collaborator"]].forEach(([groupTitle, role]) => {
      const group = visibleLegacies.filter((legacy) => legacy.access_role === role);
      if (!group.length) return;
      const heading = document.createElement("span");
      heading.className = "legacy-group-title";
      heading.textContent = groupTitle;
      legacyList.append(heading);
      group.forEach((legacy) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "legacy-option";
      button.classList.toggle("is-active", legacy.id === chatSession.selectedLegacyId);
      button.dataset.legacyId = String(legacy.id);
      const name = document.createElement("strong");
      name.textContent = legacyDisplayName(legacy);
      const detail = document.createElement("small");
      detail.textContent = role === "collaborator" ? "Collaborator" : (legacy.setup_status === "active" ? "Owner" : "Owner · Identity setup in progress");
      button.append(name, detail);
      legacyList.append(button);
      });
    });
    updateEmptyStateCopy();
    window.dispatchEvent(new CustomEvent("legarya-legacy-change", { detail: { legacy: selected } }));
  };

  const fetchLegacyContext = async ({ preserveSelection = false } = {}) => {
    const context = await apiRequest("/legacies", { authenticated: true });
    legacies = context.legacies;
    if (!preserveSelection || !legacies.some((legacy) => legacy.id === chatSession.selectedLegacyId)) {
      const requestedId = Number(new URLSearchParams(location.search).get("legacy"));
      const selectedId = legacies.some((legacy) => legacy.id === requestedId) ? requestedId : context.active_legacy_id;
      chatSession.selectLegacy(selectedId);
      if (selectedId && selectedId !== context.active_legacy_id) {
        await apiRequest(`/legacies/${selectedId}/select`, { method: "POST", authenticated: true });
      }
    }
    renderLegacyContext();
    updateSendState();
    return context;
  };

  const setDrawer = (open) => {
    document.body.classList.toggle("drawer-open", open);
    openSidebarButton.setAttribute("aria-expanded", String(open));
    if (open) closeSidebarButton.focus();
  };

  const showEmptyState = () => {
    if (emptyTransitionTimer !== null) clearTimeout(emptyTransitionTimer);
    emptyTransitionTimer = null;
    messages.replaceChildren();
    messages.hidden = true;
    emptyState.classList.remove("is-leaving");
    emptyState.hidden = false;
    ryaVisualActive = true;
    syncRyaVisual();
    setChatStatus();
  };

  const hideEmptyState = (immediate = false) => {
    if (emptyState.hidden) return;
    if (emptyTransitionTimer !== null) clearTimeout(emptyTransitionTimer);
    if (immediate || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      emptyState.hidden = true;
      emptyState.classList.remove("is-leaving");
      ryaVisualActive = false;
      syncRyaVisual();
      return;
    }
    emptyState.classList.add("is-leaving");
    emptyTransitionTimer = window.setTimeout(() => {
      emptyState.hidden = true;
      emptyState.classList.remove("is-leaving");
      emptyTransitionTimer = null;
      ryaVisualActive = false;
      syncRyaVisual();
    }, 380);
  };

  const addMessage = (role, content, pending = false) => {
    messages.hidden = false;
    const row = document.createElement("article");
    row.className = `message message-${role}${pending ? " message-pending" : ""}`;
    const inner = document.createElement("div");
    inner.className = "message-inner";
    const label = document.createElement("span");
    label.className = "message-label";
    if (role === "assistant") {
      label.classList.add("message-label-assistant");
      const core = document.createElement("img");
      core.className = "rya-core-icon rya-core-icon--message";
      core.src = "favicon.svg?v=1";
      core.alt = "";
      core.setAttribute("aria-hidden", "true");
      label.append(core, document.createTextNode("Rya"));
    } else {
      label.textContent = "You";
    }
    const body = document.createElement(role === "assistant" ? "div" : "p");
    body.className = "message-content";
    if (role === "assistant" && !pending) window.LegaryaMarkdown.render(body, content);
    else body.textContent = content;
    inner.append(label, body);
    row.append(inner);
    messages.append(row);
    messages.scrollTop = messages.scrollHeight;
    return row;
  };

  const updateSendState = () => {
    const available = sending || (!preparingSend && chatSession.canSend(input.value, sending));
    sendButton.disabled = false;
    sendButton.setAttribute("aria-disabled", String(!available));
  };

  const setSending = (active) => {
    sending = active;
    setRyaGenerating(active);
    input.disabled = active;
    sendButton.classList.toggle("is-stopping", active);
    sendButton.setAttribute("aria-label", active ? "Stop generating" : "Send message");
    sendButton.title = active ? "Stop generating" : "Send message";
    sendButton.querySelector("span").textContent = active ? "\u25a0" : "\u2191";
    updateSendState();
  };

  const resizeInput = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
    updateSendState();
  };

  const isNearMessageBottom = () => messages.scrollHeight - messages.scrollTop - messages.clientHeight < 110;

  const detachActiveStream = () => {
    if (activeStream) {
      activeStream.abortReason = "navigation";
      activeStream.controller.abort();
    }
    activeStream = null;
    setSending(false);
  };

  const stopActiveStream = () => {
    if (!activeStream) return;
    activeStream.abortReason = "stop";
    activeStream.controller.abort();
    setChatStatus("Stopping response...");
  };

  const consumeEventStream = async (response, onEvent) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;

    const consumeBlock = (block) => {
      if (!block.trim()) return;
      let eventName = "message";
      const dataLines = [];
      block.split("\n").forEach((line) => {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      });
      if (!dataLines.length) return;
      onEvent(eventName, JSON.parse(dataLines.join("\n")));
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        buffer = buffer.replaceAll("\r\n", "\n");
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          consumeBlock(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");
        }
        if (done) break;
      }
      if (buffer.trim()) consumeBlock(buffer);
      completed = true;
    } finally {
      if (!completed) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };

  const createStreamRenderer = (row, requestId) => {
    const body = row.querySelector(".message-content");
    body.classList.add("stream-content");
    let queued = "";
    let rendered = "";
    let flushTimer = null;

    const flush = () => {
      if (!queued) return;
      rendered += queued;
      queued = "";
      if (!row.isConnected || activeStream?.requestId !== requestId) return;
      body.textContent = rendered;
      if (activeStream.follow) messages.scrollTop = messages.scrollHeight;
    };

    return {
      queue(delta) {
        queued += delta;
        if (flushTimer !== null) return;
        flushTimer = window.setTimeout(() => {
          flushTimer = null;
          requestAnimationFrame(flush);
        }, 28);
      },
      finish() {
        if (flushTimer !== null) clearTimeout(flushTimer);
        flushTimer = null;
        flush();
        row.classList.remove("message-pending");
      },
      complete() {
        this.finish();
        body.classList.remove("stream-content");
        window.LegaryaMarkdown.render(body, rendered);
      },
      interrupt(message) {
        this.finish();
        row.classList.add("message-interrupted");
        if (!rendered) body.textContent = message;
      },
      hasText() {
        return Boolean(rendered || queued);
      },
    };
  };

  const closeConversationMenu = (restoreFocus = false) => {
    if (!openConversationMenu) return;
    const { trigger, popover } = openConversationMenu;
    popover.remove();
    trigger.setAttribute("aria-expanded", "false");
    openConversationMenu = null;
    if (restoreFocus && trigger.isConnected) trigger.focus();
  };

  const positionConversationMenu = () => {
    if (!openConversationMenu) return;
    const { trigger, popover } = openConversationMenu;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = popover.getBoundingClientRect();
    const edge = 10;
    const left = Math.min(window.innerWidth - menuRect.width - edge, Math.max(edge, triggerRect.right - menuRect.width));
    let top = triggerRect.bottom + 5;
    if (top + menuRect.height > window.innerHeight - edge) {
      top = Math.max(edge, triggerRect.top - menuRect.height - 5);
    }
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  };

  const makeMenuAction = (label, className, handler) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("role", "menuitem");
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  };

  const showDeleteConfirmation = (conversation) => {
    if (!openConversationMenu) return;
    const { popover } = openConversationMenu;
    popover.classList.add("is-confirming");
    popover.setAttribute("role", "alertdialog");
    popover.setAttribute("aria-label", `Delete ${conversation.title || "conversation"}?`);
    popover.replaceChildren();
    const prompt = document.createElement("p");
    prompt.textContent = "Delete this conversation?";
    const actions = document.createElement("div");
    actions.className = "conversation-confirm-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "conversation-confirm-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => closeConversationMenu(true));
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "conversation-confirm-delete";
    confirm.textContent = "Delete";
    confirm.addEventListener("click", () => deleteConversation(conversation));
    actions.append(cancel, confirm);
    popover.append(prompt, actions);
    positionConversationMenu();
    confirm.focus();
  };

  const openMenuForConversation = (conversation, trigger) => {
    if (openConversationMenu?.trigger === trigger) {
      closeConversationMenu(true);
      return;
    }
    closeConversationMenu();
    const popover = document.createElement("div");
    popover.className = "conversation-popover";
    popover.setAttribute("role", "menu");
    popover.setAttribute("aria-label", "Conversation actions");
    popover.addEventListener("click", (event) => event.stopPropagation());
    popover.append(
      makeMenuAction("Rename", "conversation-action", () => startRename(conversation)),
      makeMenuAction("Delete", "conversation-action conversation-action-delete", () => showDeleteConfirmation(conversation)),
    );
    popover.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const buttons = [...popover.querySelectorAll("button:not(:disabled)")];
      if (!buttons.length) return;
      event.preventDefault();
      const current = Math.max(0, buttons.indexOf(document.activeElement));
      const target = event.key === "Home" ? 0
        : event.key === "End" ? buttons.length - 1
        : event.key === "ArrowDown" ? (current + 1) % buttons.length
        : (current - 1 + buttons.length) % buttons.length;
      buttons[target].focus();
    });
    document.body.append(popover);
    trigger.setAttribute("aria-expanded", "true");
    openConversationMenu = { trigger, popover };
    positionConversationMenu();
    popover.querySelector("button").focus();
  };

  const cancelRename = () => {
    if (renamingConversationId === null) return;
    renamingConversationId = null;
    renderConversationList();
  };

  const saveRename = async (conversation, renameInput) => {
    if (renameInFlight || renamingConversationId !== conversation.id) return;
    const title = renameInput.value.trim();
    if (!title) {
      renameInput.setCustomValidity("Enter a conversation title.");
      renameInput.reportValidity();
      renameInput.focus();
      return;
    }
    renameInput.setCustomValidity("");
    if (title === conversation.title) {
      cancelRename();
      return;
    }
    renameInFlight = true;
    renameInput.disabled = true;
    setChatStatus("Renaming conversation...");
    try {
      const updated = await apiRequest(`/conversations/${conversation.id}?legacy_id=${chatSession.selectedLegacyId}`, {
        method: "PATCH",
        body: { title },
        authenticated: true,
      });
      conversations = conversations.map((item) => item.id === updated.id ? updated : item);
      renamingConversationId = null;
      renderConversationList();
      setChatStatus();
    } catch (error) {
      renameInput.disabled = false;
      setChatStatus(error.message || "Unable to rename the conversation.", true);
      renameInput.focus();
    } finally {
      renameInFlight = false;
    }
  };

  const startRename = (conversation) => {
    closeConversationMenu();
    renamingConversationId = conversation.id;
    renderConversationList();
    requestAnimationFrame(() => {
      const renameInput = conversationList.querySelector(`[data-rename-id="${conversation.id}"]`);
      renameInput?.focus();
      renameInput?.select();
    });
  };

  const renderConversationList = () => {
    closeConversationMenu();
    conversationList.replaceChildren();
    conversationListStatus.hidden = conversations.length > 0;
    conversationListStatus.textContent = conversations.length ? "" : "No conversations yet";
    conversations.forEach((conversation) => {
      const item = document.createElement("div");
      item.className = "conversation-item";
      item.classList.toggle("is-active", conversation.id === chatSession.activeConversationId);

      if (conversation.id === renamingConversationId) {
        item.classList.add("is-renaming");
        const renameForm = document.createElement("form");
        renameForm.className = "conversation-rename-form";
        const renameInput = document.createElement("input");
        renameInput.className = "conversation-rename-input";
        renameInput.type = "text";
        renameInput.value = conversation.title || "New chat";
        renameInput.maxLength = 80;
        renameInput.setAttribute("aria-label", "Conversation title");
        renameInput.dataset.renameId = String(conversation.id);
        renameForm.addEventListener("submit", (event) => {
          event.preventDefault();
          saveRename(conversation, renameInput);
        });
        renameInput.addEventListener("input", () => renameInput.setCustomValidity(""));
        renameInput.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancelRename();
          }
        });
        renameInput.addEventListener("blur", () => {
          setTimeout(() => {
            if (renamingConversationId === conversation.id) saveRename(conversation, renameInput);
          }, 0);
        });
        renameForm.append(renameInput);
        item.append(renameForm);
        conversationList.append(item);
        return;
      }

      const selectButton = document.createElement("button");
      selectButton.className = "conversation-select";
      selectButton.type = "button";
      selectButton.textContent = conversation.title || "New chat";
      selectButton.title = conversation.title || "New chat";
      selectButton.addEventListener("click", () => loadConversation(conversation.id));

      const menuButton = document.createElement("button");
      menuButton.className = "conversation-menu";
      menuButton.type = "button";
      menuButton.setAttribute("aria-label", `Open menu for ${conversation.title || "conversation"}`);
      menuButton.setAttribute("aria-haspopup", "menu");
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.title = "Conversation actions";
      menuButton.innerHTML = "&#8230;";
      menuButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openMenuForConversation(conversation, menuButton);
      });

      item.append(selectButton, menuButton);
      conversationList.append(item);
    });
  };

  const fetchConversations = async () => {
    if (!chatSession.selectedLegacyId) {
      conversations = [];
      renderConversationList();
      return conversations;
    }
    const requestedLegacyId = chatSession.selectedLegacyId;
    const result = await apiRequest(`/conversations?legacy_id=${requestedLegacyId}`, { authenticated: true });
    if (requestedLegacyId !== chatSession.selectedLegacyId) return conversations;
    conversations = result;
    renderConversationList();
    return conversations;
  };

  const loadConversation = async (id) => {
    if (sending) detachActiveStream();
    if (id === chatSession.activeConversationId && !messages.hidden) {
      setDrawer(false);
      return;
    }
    setChatStatus("Loading conversation...");
    let load = null;
    try {
      const selectedConversation = conversations.find((item) => item.id === id);
      if (!selectedConversation || selectedConversation.legacy_id !== chatSession.selectedLegacyId) {
        logChatFailure("conversation-scope-mismatch", new ApiError("Conversation is outside the selected Legacy.", {
          kind: "conversation_scope_mismatch",
        }), { conversationId: id, selectedLegacyId: chatSession.selectedLegacyId });
        await fetchConversations();
        setChatStatus("That chat does not belong to the selected Legacy.", true);
        return;
      }
      load = chatSession.beginConversationLoad();
      const history = await apiRequest(`/conversations/${id}/messages?legacy_id=${load.legacyId}`, { authenticated: true });
      if (!chatSession.applyConversationLoad(load, id)) return;
      localStorage.setItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID, String(id));
      messages.replaceChildren();
      if (history.length) {
        hideEmptyState(true);
        history.forEach((message) => addMessage(message.role, message.content));
      }
      else showEmptyState();
      renderConversationList();
      setChatStatus();
      setDrawer(false);
      input.focus();
    } catch (error) {
      if (load && load.version !== chatSession.navigationVersion) return;
      if (error instanceof ApiError && error.status === 401) return redirectToAuth();
      const failure = chatFailure(error, "Unable to load this conversation.");
      logChatFailure(failure.category, error, { conversationId: id, selectedLegacyId: chatSession.selectedLegacyId });
      if (failure.category === "legacy_mismatch" || failure.category === "conversation_not_found") {
        chatSession.beginNewChat();
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID);
        await fetchConversations();
        showEmptyState();
      }
      setChatStatus(failure.message, true);
    }
  };

  const beginNewConversation = () => {
    reportLocalChatState("new-chat-click-before");
    detachActiveStream();
    chatSession.beginNewChat();
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID);
    renderConversationList();
    showEmptyState();
    setDrawer(false);
    updateSendState();
    input.focus();
    reportLocalChatState("new-chat-click-after");
  };

  const createConversation = async (signal) => {
    const result = await chatSession.ensureConversation(async (selectedLegacyId) => {
      const created = await apiRequest("/conversations", {
        method: "POST",
        body: { title: "New chat", legacy_id: selectedLegacyId },
        authenticated: true,
        signal,
      });
      if (signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");
      return created;
    });
    const created = result.conversation;
    if (!result.created) return result;
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID, String(created.id));
    conversations = [created, ...conversations.filter((item) => item.id !== created.id)];
    renderConversationList();
    recentChats.scrollTop = 0;
    return result;
  };

  const deleteConversation = async (conversation) => {
    if (sending) return;
    closeConversationMenu();
    setChatStatus("Deleting conversation...");
    try {
      if (conversation.legacy_id !== chatSession.selectedLegacyId) {
        throw new ApiError("Conversation is outside the selected Legacy.", { kind: "conversation_scope_mismatch" });
      }
      await apiRequest(`/conversations/${conversation.id}?legacy_id=${chatSession.selectedLegacyId}`, { method: "DELETE", authenticated: true });
      conversations = conversations.filter((item) => item.id !== conversation.id);
      if (conversation.id === chatSession.activeConversationId) {
        chatSession.beginNewChat();
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID);
        const next = conversations[0];
        if (next) await loadConversation(next.id);
        else showEmptyState();
      } else {
        renderConversationList();
      }
      setChatStatus();
    } catch (error) {
      logChatFailure("delete-conversation", error, { conversationId: conversation.id });
      setChatStatus(error.message || "Unable to delete the conversation.", true);
    }
  };

  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    reportLocalChatState("composer-submit");
    if (preparingSend) return;
    if (sending) {
      stopActiveStream();
      return;
    }
    const content = input.value.trim();
    if (!content) return;
    if (!chatSession.selectedLegacyId) {
      preparingSend = true;
      updateSendState();
      setChatStatus("Restoring your Legacy workspace...");
      try {
        await fetchLegacyContext();
      } catch (error) {
        logChatFailure("composer-legacy-recovery", error);
      } finally {
        preparingSend = false;
        updateSendState();
      }
    }
    if (!chatSession.canSend(content, sending)) {
      setChatStatus("Choose a Legacy before sending a message.", true);
      return;
    }
    setChatStatus();
    hideEmptyState(false);
    const optimisticUserMessage = addMessage("user", content);
    input.value = "";
    resizeInput();
    setSending(true);
    const requestId = ++streamSequence;
    const controller = new AbortController();
    const pending = addMessage("assistant", "", true);
    const renderer = createStreamRenderer(pending, requestId);
    let createdForMessage = false;
    let streamStarted = false;
    let doneReceived = false;
    let preservationAcknowledgement = "";
    let failureStage = "stream-start";
    activeStream = {
      requestId,
      controller,
      conversationId: null,
      abortReason: null,
      follow: true,
    };
    try {
      if (!chatSession.activeConversationId) {
        failureStage = "create-conversation";
        await createConversation(controller.signal);
        createdForMessage = true;
      }
      const requestConversationId = chatSession.activeConversationId;
      activeStream.conversationId = requestConversationId;
      failureStage = "stream-start";
      const response = await streamRequest(`/conversations/${requestConversationId}/messages/stream?legacy_id=${chatSession.selectedLegacyId}&timezone=${encodeURIComponent(localTimezone)}`, {
        method: "POST",
        body: { content },
        authenticated: true,
        signal: controller.signal,
      });
      failureStage = "stream-interrupted";
      await consumeEventStream(response, (eventName, data) => {
        if (activeStream?.requestId !== requestId) return;
        if (eventName === "start") {
          if (data.conversation_id !== requestConversationId) {
            throw new ApiError("The stream returned the wrong conversation.", { kind: "stream_conversation_mismatch" });
          }
          streamStarted = true;
          if (data.legacy_id !== chatSession.selectedLegacyId) {
            throw new ApiError("The stream returned the wrong Legacy.", { kind: "stream_legacy_mismatch" });
          }
        } else if (eventName === "delta" && typeof data.delta === "string") {
          renderer.queue(data.delta);
        } else if (eventName === "done") {
          doneReceived = true;
          window.dispatchEvent(new CustomEvent("legarya-progress-update", { detail: data }));
          if (data.today_just_completed) {
            const days = data.streak?.current_streak_days || 1;
            preservationAcknowledgement = [3, 7, 14, 30, 50, 100, 365].includes(days)
              ? `${days} days of preserving ${activeLegacy()?.subject_name || "this Legacy"}’s story.`
              : `Today’s preservation is complete for ${activeLegacy()?.subject_name || "this Legacy"}.`;
          }
        } else if (eventName === "error") {
          throw new ApiError(data.message || "Rya couldn't finish that response.", {
            kind: data.code || "provider_failed",
          });
        }
      });
      if (!doneReceived) {
        throw new ApiError("Rya's response ended before completion.", { kind: "stream_interrupted" });
      }
      renderer.complete();
      await fetchLegacyContext({ preserveSelection: true });
      await fetchConversations();
      setChatStatus(preservationAcknowledgement);
    } catch (error) {
      const isCurrentStream = activeStream?.requestId === requestId;
      if (error?.name === "AbortError") {
        if (isCurrentStream && activeStream.abortReason === "stop") {
          renderer.interrupt("Generation stopped.");
          setChatStatus("Response stopped.");
        }
        return;
      }
      if (!isCurrentStream) return;
      const failure = chatFailure(error, "Rya couldn't finish that response. Try again.");
      logChatFailure(failure.category, error, {
        stage: failureStage,
        conversationId: chatSession.activeConversationId,
        createdForMessage,
        streamStarted,
        partialOutput: renderer.hasText(),
      });
      if (error instanceof ApiError && error.status === 401) return redirectToAuth();
      if (failureStage === "create-conversation") {
        pending.remove();
        optimisticUserMessage.remove();
        showEmptyState();
        input.value = content;
        resizeInput();
        setChatStatus("Couldn\u2019t start a new conversation. Try again.", true);
      } else {
        renderer.interrupt(failure.message);
        setChatStatus(
          renderer.hasText() && failure.category === "stream_failed"
            ? "Rya's response was interrupted. Try again."
            : failure.message,
          true,
        );
        if (streamStarted) {
          try {
            await fetchConversations();
          } catch (refreshError) {
            logChatFailure("stream-history-refresh", refreshError, { conversationId: chatSession.activeConversationId });
          }
        }
      }
    } finally {
      if (activeStream?.requestId === requestId) {
        activeStream = null;
        setSending(false);
        input.focus();
      }
    }
  });

  input.addEventListener("input", resizeInput);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      composer.requestSubmit();
    }
  });
  messages.addEventListener("scroll", () => {
    if (activeStream) activeStream.follow = isNearMessageBottom();
  }, { passive: true });
  newConversationButton.addEventListener("click", beginNewConversation);
  legacyButton.addEventListener("click", () => {
    if (legacyButton.disabled) return;
    const open = legacyMenu.hidden;
    legacyMenu.hidden = !open;
    legacyButton.setAttribute("aria-expanded", String(open));
  });
  const switchLegacy = async (legacyId) => {
    if (legacyId === chatSession.selectedLegacyId) {
      closeLegacyMenu();
      return;
    }
    if (sending) detachActiveStream();
    setChatStatus("Switching Legacy...");
    try {
      await apiRequest(`/legacies/${legacyId}/select`, { method: "POST", authenticated: true });
      chatSession.selectLegacy(legacyId);
      chatSession.beginNewChat();
      conversations = [];
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID);
      messages.replaceChildren();
      renderLegacyContext();
      renderConversationList();
      updateSendState();
      closeLegacyMenu();
      showEmptyState();
      await fetchConversations();
      const mostRecent = conversations[0];
      if (mostRecent) await loadConversation(mostRecent.id);
      else setChatStatus();
    } catch (error) {
      logChatFailure("switch-legacy", error, { selectedLegacyId: legacyId });
      setChatStatus(error.message || "Unable to switch Legacy.", true);
    }
  };

  legacyList.addEventListener("click", async (event) => {
    const option = event.target.closest("[data-legacy-id]");
    if (!option) return;
    await switchLegacy(Number(option.dataset.legacyId));
  });
  createLegacyButton.addEventListener("click", async () => {
    if (sending) return;
    createLegacyButton.disabled = true;
    setChatStatus("Starting a new Legacy...");
    try {
      const result = await apiRequest("/legacies/setup", { method: "POST", authenticated: true });
      legacies = [result.legacy, ...legacies];
      chatSession.selectLegacy(result.legacy.id);
      conversations = [];
      renderLegacyContext();
      closeLegacyMenu();
      beginNewConversation();
    } catch (error) {
      setChatStatus(error.message || "Unable to start another Legacy.", true);
    } finally {
      createLegacyButton.disabled = false;
    }
  });
  legacyQuickReplies.addEventListener("click", (event) => {
    const reply = event.target.closest("[data-reply]");
    if (!reply) return;
    input.value = reply.dataset.reply;
    resizeInput();
    composer.requestSubmit();
  });
  openSidebarButton.addEventListener("click", () => setDrawer(true));
  closeSidebarButton.addEventListener("click", () => setDrawer(false));
  sidebarBackdrop.addEventListener("click", () => setDrawer(false));

  accountButton.addEventListener("click", () => {
    const open = accountMenu.hidden;
    accountMenu.hidden = !open;
    accountButton.setAttribute("aria-expanded", String(open));
  });
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    await logout();
    redirectToAuth();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (openConversationMenu) {
        closeConversationMenu(true);
        return;
      }
      closeLegacyMenu();
      setDrawer(false);
      accountMenu.hidden = true;
      accountButton.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("click", (event) => {
    if (openConversationMenu && !openConversationMenu.popover.contains(event.target) && !openConversationMenu.trigger.contains(event.target)) {
      closeConversationMenu();
    }
    if (!accountMenu.hidden && !accountMenu.contains(event.target) && !accountButton.contains(event.target)) {
      accountMenu.hidden = true;
      accountButton.setAttribute("aria-expanded", "false");
    }
    if (!legacyMenu.hidden && !legacyMenu.contains(event.target) && !legacyButton.contains(event.target)) closeLegacyMenu();
  });
  recentChats.addEventListener("scroll", () => closeConversationMenu(), { passive: true });
  window.addEventListener("resize", () => closeConversationMenu());

  const initialize = async () => {
    const initializationVersion = chatSession.navigationVersion;
    try {
      const user = await ensureAuthenticated();
      userName.textContent = user.full_name || "LegaRya user";
      userEmail.textContent = user.email;
      accountInitial.textContent = (user.full_name || user.email || "L").trim().charAt(0).toUpperCase();
      conversationListStatus.textContent = "Loading conversations...";
      await fetchLegacyContext();
      await fetchConversations();
      reportLocalChatState("initialized");
      if (chatSession.navigationVersion !== initializationVersion) {
        updateSendState();
        input.focus();
        return;
      }
      const storedValue = localStorage.getItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID);
      const storedId = storedValue ? Number(storedValue) : null;
      const storedConversation = storedId ? conversations.find((item) => item.id === storedId) : null;
      const active = storedConversation || conversations[0];
      if (active) await loadConversation(active.id);
      else showEmptyState();
      updateSendState();
      input.focus();
    } catch {
      redirectToAuth();
    }
  };

  updateSendState();
  initialize();
  window.LegaryaWorkspace = Object.freeze({ getActiveLegacy: activeLegacy });
})();
