"use strict";

(() => {
  const { apiRequest } = window.LegaryaAuthApi;
  const openButton = document.querySelector("#openMemories");
  const dashboard = document.querySelector("#memoryDashboard");
  const closeButton = document.querySelector("#closeMemories");
  const backdrop = document.querySelector("#memoryDashboardBackdrop");
  const content = document.querySelector("#memoryDashboardContent");
  const status = document.querySelector("#memoryDashboardStatus");
  if (!openButton || !dashboard) return;

  const groups = [
    ["Identity", ["personal_detail"]],
    ["Family & Relationships", ["relationship"]],
    ["Childhood", ["childhood"]],
    ["Education", ["education"]],
    ["Career", ["career"]],
    ["Preferences", ["preference", "dislike", "opinion"]],
    ["Habits", ["habit", "routine"]],
    ["Values & Beliefs", ["value", "belief", "personality", "aspiration"]],
    ["Stories & Experiences", ["story", "family_story", "life_event", "tradition", "achievement", "challenge"]],
    ["Other", ["place", "possession", "other"]],
  ];
  let legacyId = null;
  let memories = [];
  let accessRole = "owner";
  let journey = null;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const setStatus = (message = "", error = false) => {
    status.textContent = message;
    status.classList.toggle("is-error", error);
  };

  const close = () => {
    dashboard.hidden = true;
    document.body.classList.remove("memory-dashboard-open");
    openButton.focus();
  };

  const metadata = (memory) => {
    const learned = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(memory.created_at));
    const contributor = memory.last_contributor_name || memory.contributor_name;
    return `${memory.last_contributor_user_id !== memory.contributor_user_id ? "Last updated" : "Added"}${contributor ? ` by ${contributor}` : ""} · ${learned}`;
  };

  const startEdit = (card, memory) => {
    const form = document.createElement("form");
    form.className = "memory-edit-form";
    const textarea = document.createElement("textarea");
    textarea.maxLength = 1200;
    textarea.required = true;
    textarea.value = memory.canonical_text;
    textarea.setAttribute("aria-label", "Edit memory");
    const actions = document.createElement("div");
    actions.className = "memory-edit-actions";
    const cancel = document.createElement("button");
    cancel.type = "button"; cancel.className = "memory-edit-cancel"; cancel.textContent = "Cancel";
    const save = document.createElement("button");
    save.type = "submit"; save.className = "memory-edit-save"; save.textContent = "Save memory";
    actions.append(cancel, save); form.append(textarea, actions);
    card.replaceChildren(form); textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    cancel.addEventListener("click", render);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const canonical_text = textarea.value.trim();
      if (canonical_text.length < 3) return;
      save.disabled = cancel.disabled = true; setStatus("Updating memory…");
      try {
        await apiRequest(`/memories/${memory.id}?legacy_id=${legacyId}&timezone=${encodeURIComponent(timezone)}`, { method: "PATCH", authenticated: true, body: { canonical_text } });
        await load(); setStatus("Memory updated. Rya will use the new version immediately.");
      } catch (error) {
        save.disabled = cancel.disabled = false; setStatus(error.message || "Memory could not be updated.", true);
      }
    });
  };

  const confirmDelete = (actions, memory) => {
    actions.replaceChildren();
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Keep";
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "memory-confirm-delete"; remove.textContent = "Delete";
    actions.append(cancel, remove); cancel.addEventListener("click", render);
    remove.addEventListener("click", async () => {
      remove.disabled = cancel.disabled = true; setStatus("Deleting memory…");
      try {
        await apiRequest(`/memories/${memory.id}?legacy_id=${legacyId}&timezone=${encodeURIComponent(timezone)}`, { method: "DELETE", authenticated: true });
        await load(); setStatus("Memory removed from Rya’s active knowledge.");
      } catch (error) {
        remove.disabled = cancel.disabled = false; setStatus(error.message || "Memory could not be deleted.", true);
      }
    });
  };

  const memoryCard = (memory) => {
    const card = document.createElement("article"); card.className = "memory-card";
    const copy = document.createElement("div"); copy.className = "memory-card-copy";
    const text = document.createElement("p"); text.textContent = memory.canonical_text;
    const meta = document.createElement("small"); meta.textContent = metadata(memory); copy.append(text, meta);
    const actions = document.createElement("div"); actions.className = "memory-card-actions";
    const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit";
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "memory-delete"; remove.textContent = "Delete";
    edit.addEventListener("click", () => startEdit(card, memory)); remove.addEventListener("click", () => confirmDelete(actions, memory));
    actions.append(edit);
    if (accessRole === "owner") actions.append(remove);
    card.append(copy, actions); return card;
  };

  function render() {
    content.replaceChildren();
    if (journey) {
      const overview = document.createElement("section"); overview.className = "progress-overview";
      const header = document.createElement("div"); header.className = "progress-overview-header";
      const title = document.createElement("strong"); title.textContent = "Legacy progress";
      const percent = document.createElement("span"); percent.textContent = `${journey.progress.percentage}% explored`; header.append(title, percent);
      const track = document.createElement("div"); track.className = "progress-track"; const fill = document.createElement("i"); fill.style.width = `${journey.progress.percentage}%`; track.append(fill);
      overview.append(header, track);
      const streakSummary=document.createElement("div"); streakSummary.className="dashboard-streak-summary";
      [["Preservation streak",`${journey.streak.current_streak_days} days`],["Longest streak",`${journey.streak.longest_streak_days} days`],["Today",journey.streak.today_completed?"Complete":"Not yet"]].forEach(([label,value])=>{const item=document.createElement("span");const small=document.createElement("small");small.textContent=label;const strong=document.createElement("strong");strong.textContent=value;item.append(small,strong);streakSummary.append(item)});
      overview.append(streakSummary);
      journey.progress.domains.forEach((domain) => { const row=document.createElement("div"); row.className="progress-domain"; const label=document.createElement("b"); label.textContent=domain.label; const value=document.createElement("span"); value.textContent=`${domain.coverage}%`; const line=document.createElement("div"); line.className="progress-domain-line"; const lineFill=document.createElement("i"); lineFill.style.width=`${domain.coverage}%`; line.append(lineFill); row.append(label,value,line); overview.append(row); });
      if (journey.progress.next_area) { const next=document.createElement("p"); next.className="progress-next"; next.textContent=`Next area to explore · ${journey.progress.next_area.label}. An invitation, never a requirement.`; overview.append(next); }
      content.append(overview);
    }
    if (!memories.length) {
      const empty = document.createElement("p"); empty.className = "memory-empty"; empty.textContent = "No memories yet. A meaningful Legacy begins in conversation."; content.append(empty); return;
    }
    const used = new Set();
    groups.forEach(([title, categories]) => {
      const items = memories.filter((memory) => categories.includes(memory.category) && !used.has(memory.id));
      if (!items.length) return;
      items.forEach((item) => used.add(item.id));
      const section = document.createElement("section"); section.className = "memory-group";
      const heading = document.createElement("h3"); heading.textContent = title;
      const list = document.createElement("div"); list.className = "memory-group-list";
      items.forEach((item) => list.append(memoryCard(item))); section.append(heading, list); content.append(section);
    });
  }

  async function load() {
    const context = await apiRequest("/legacies", { authenticated: true });
    legacyId = context.active_legacy_id;
    accessRole = context.legacies.find((legacy) => legacy.id === legacyId)?.access_role || "owner";
    if (!legacyId) { memories = []; journey = null; render(); return; }
    [memories, journey] = await Promise.all([
      apiRequest(`/memories?legacy_id=${legacyId}`, { authenticated: true }),
      apiRequest(`/progress/${legacyId}?timezone=${encodeURIComponent(timezone)}`, { authenticated: true }),
    ]);
    render();
  }

  openButton.addEventListener("click", async () => {
    dashboard.hidden = false; document.body.classList.add("memory-dashboard-open"); closeButton.focus(); setStatus("Loading memories…");
    try { await load(); setStatus(); } catch (error) { setStatus(error.message || "Memories could not be loaded.", true); }
  });
  closeButton.addEventListener("click", close); backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !dashboard.hidden) close(); });
})();
