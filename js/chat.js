"use strict";

(function initializeChatPage() {
const {
    STORAGE_KEYS,
    ApiError,
    apiRequest,
    clearStoredSession,
    streamChatMessage,
    supportsResponseStreaming
} = window.WaffleBerryApi;

const STREAM_INACTIVITY_TIMEOUT_MS = 45000;
const NON_STREAMING_TIMEOUT_MS = 60000;

const chatForm =
    document.getElementById("chatForm");
const chatInput =
    document.getElementById("chatInput");
const chatMessages =
    document.getElementById("chatMessages");
const clearChatButton =
    document.getElementById(
        "clearChatButton"
    );
const newChatButton =
    document.getElementById(
        "newChatButton"
    );
const conversationList =
    document.getElementById(
        "conversationList"
    );
const conversationTitle =
    document.getElementById(
        "conversationTitle"
    );
const chatStatus =
    document.getElementById("chatStatus");
const sendButton =
    document.getElementById("sendButton");

const state = {
    conversations: [],
    activeConversationId: null,
    createConversationPromise: null,
    historyRequestId: 0,
    renderedMessageIds: new Set(),
    typingConversationId: null,
    pendingConversationId: null,
    messageRequestController: null,
    messageRequestId: 0,
    isLoadingMessages: false,
    isSending: false,
    isDeleting: false,
    isComposing: false
};


function handleAuthenticationError(error) {
    if (
        error instanceof ApiError &&
        error.status === 401
    ) {
        clearStoredSession();
        window.location.replace(
            "login.html"
        );
        return true;
    }

    return false;
}


function setChatStatus(
    message = "",
    type = ""
) {
    if (!chatStatus) {
        return;
    }

    chatStatus.textContent = message;
    chatStatus.classList.toggle(
        "error-state",
        type === "error"
    );
    chatStatus.classList.toggle(
        "loading-state",
        type === "loading"
    );
}


function updateControls() {
    const isCreating =
        Boolean(
            state.createConversationPromise
        );

    if (newChatButton) {
        newChatButton.disabled =
            isCreating;
    }

    if (sendButton) {
        sendButton.disabled =
            state.isSending ||
            state.isLoadingMessages ||
            isCreating;
    }

    if (chatInput) {
        chatInput.disabled =
            state.isSending;
    }

    if (clearChatButton) {
        clearChatButton.disabled =
            !state.activeConversationId ||
            state.isDeleting;
    }
}


function scrollChatToBottom(behavior = "auto") {
    if (chatMessages) {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior
        });
    }
}


function createTypingIndicator() {
    const row =
        document.createElement("div");
    row.id = "typingIndicator";
    row.className =
        "message-row berry-row typing-row";
    row.setAttribute("role", "status");
    row.setAttribute("aria-live", "polite");
    row.setAttribute(
        "aria-label",
        "Berry is typing"
    );

    const avatar =
        document.createElement("img");
    avatar.src =
        "assets/waffle-berry-mascot.png";
    avatar.alt = "";
    avatar.className = "message-avatar";

    const indicator =
        document.createElement("div");
    indicator.className =
        "message berry-message typing-indicator";
    indicator.setAttribute(
        "aria-hidden",
        "true"
    );

    for (let index = 0; index < 3; index += 1) {
        indicator.appendChild(
            document.createElement("span")
        );
    }

    row.appendChild(avatar);
    row.appendChild(indicator);
    return row;
}


function showTypingIndicator(conversationId) {
    if (!chatMessages) {
        return;
    }

    hideTypingIndicator();
    state.typingConversationId =
        conversationId;
    chatMessages.appendChild(
        createTypingIndicator()
    );
    scrollChatToBottom("smooth");
}


function hideTypingIndicator(conversationId) {
    if (
        conversationId !== undefined &&
        state.typingConversationId !==
            conversationId
    ) {
        return;
    }

    document
        .getElementById("typingIndicator")
        ?.remove();
    state.typingConversationId = null;
}


function cancelActiveMessageRequest() {
    if (!state.messageRequestController) {
        return;
    }

    state.messageRequestId += 1;
    state.messageRequestController.abort();
    state.messageRequestController = null;
    state.pendingConversationId = null;
    state.isSending = false;
    hideTypingIndicator();
    updateControls();
}


function createStateElement(
    message,
    type,
    retryAction
) {
    const wrapper =
        document.createElement("div");
    wrapper.className =
        `chat-state ${type || ""}`.trim();

    const text =
        document.createElement("p");
    text.textContent = message;
    wrapper.appendChild(text);

    if (retryAction) {
        const retryButton =
            document.createElement("button");
        retryButton.type = "button";
        retryButton.className =
            "state-retry-button";
        retryButton.textContent = "Retry";
        retryButton.addEventListener(
            "click",
            retryAction
        );
        wrapper.appendChild(retryButton);
    }

    return wrapper;
}


function showMessageState(
    message,
    type = "",
    retryAction
) {
    if (!chatMessages) {
        return;
    }

    hideTypingIndicator();
    state.renderedMessageIds.clear();
    chatMessages.replaceChildren(
        createStateElement(
            message,
            type,
            retryAction
        )
    );
}


function getFriendlyChatError(error) {
    if (
        error instanceof ApiError &&
        error.status === 401
    ) {
        return "Your session has expired. Please sign in again.";
    }

    if (
        error instanceof ApiError &&
        (error.kind === "network" ||
            error.kind ===
                "provider_connection")
    ) {
        return "I couldn’t reach the server. Please check your connection and try again.";
    }

    if (
        error instanceof ApiError &&
        (error.status === 429 ||
            error.status === 402 ||
            error.kind === "rate_limit" ||
            error.kind === "rate-limit")
    ) {
        return "Berry is temporarily unavailable because the AI usage limit has been reached.";
    }

    if (
        error instanceof ApiError &&
        (error.kind === "timeout" ||
            error.kind === "provider_timeout")
    ) {
        return "Berry took too long to respond. Please try again.";
    }

    if (
        error instanceof ApiError &&
        (error.kind === "aborted" ||
            error.kind ===
                "stream_interrupted" ||
            error.kind ===
                "invalid_response" ||
            error.kind === "stream")
    ) {
        return "Berry’s response was interrupted. Please try again.";
    }

    return "I couldn’t generate a response just now. Please try again.";
}


function appendInlineError(error) {
    if (!chatMessages) {
        return;
    }

    const errorElement =
        createBerryMessage(
            getFriendlyChatError(error),
            { isError: true }
        );
    chatMessages.appendChild(errorElement);
    scrollChatToBottom("smooth");
}


function createUserMessage(content) {
    const row =
        document.createElement("div");
    row.className =
        "message-row user-row";

    const message =
        document.createElement("div");
    message.className =
        "message user-message";
    message.textContent = content;

    row.appendChild(message);
    return row;
}


function renderAssistantMarkdown(
    element,
    content
) {
    const source =
        typeof content === "string"
            ? content
            : "";

    if (
        typeof window.marked?.parse !==
            "function" ||
        typeof window.DOMPurify?.sanitize !==
            "function"
    ) {
        element.textContent = source;
        return;
    }

    try {
        const rendered = window.marked.parse(
            source,
            {
                gfm: true,
                breaks: true
            }
        );
        element.innerHTML =
            window.DOMPurify.sanitize(
                rendered,
                {
                    USE_PROFILES: {
                        html: true
                    }
                }
            );

        element
            .querySelectorAll("a[href]")
            .forEach((link) => {
                link.target = "_blank";
                link.rel =
                    "noopener noreferrer";
            });
    } catch {
        element.textContent = source;
        console.error(
            "Assistant Markdown rendering failed."
        );
    }
}


function createBerryMessage(
    content,
    options = {}
) {
    const row =
        document.createElement("div");
    row.className =
        "message-row berry-row";

    if (options.isError) {
        row.classList.add("error-message-row");
        row.setAttribute("role", "alert");
    }

    const avatar =
        document.createElement("img");
    avatar.src =
        "assets/waffle-berry-mascot.png";
    avatar.alt = "";
    avatar.className =
        "message-avatar";

    const message =
        document.createElement("div");
    message.className =
        "message berry-message";
    message.classList.toggle(
        "inline-error-message",
        Boolean(options.isError)
    );

    if (options.isError) {
        message.textContent = content;
    } else {
        renderAssistantMarkdown(
            message,
            content
        );
    }

    row.appendChild(avatar);
    row.appendChild(message);
    return row;
}


function createStreamingBerryMessage() {
    const row = createBerryMessage("");
    const bubble = row.querySelector(
        ".berry-message"
    );

    row.classList.add(
        "streaming-message-row"
    );
    row.setAttribute("aria-live", "off");
    bubble?.classList.add(
        "streaming-message"
    );
    return row;
}


function appendStreamDelta(row, delta) {
    const bubble = row?.querySelector(
        ".berry-message"
    );

    if (bubble) {
        bubble.textContent += delta;
    }
}


function finalizeStreamingMessage(
    row,
    message
) {
    const bubble = row?.querySelector(
        ".berry-message"
    );

    if (!row || !bubble || !message) {
        return;
    }

    row.classList.remove(
        "streaming-message-row"
    );
    bubble.classList.remove(
        "streaming-message"
    );
    renderAssistantMarkdown(
        bubble,
        message.content
    );

    if (message.message_id) {
        row.dataset.messageId = String(
            message.message_id
        );
        state.renderedMessageIds.add(
            Number(message.message_id)
        );
    }
}


function createMessageElement(message) {
    let element = null;

    if (message?.role === "user") {
        element = createUserMessage(
            message.content
        );
    } else if (message?.role === "assistant") {
        element = createBerryMessage(
            message.content
        );
    }

    if (element && message?.message_id) {
        element.dataset.messageId =
            String(message.message_id);
    }

    return element;
}


function appendMessage(message) {
    const messageId = Number(
        message?.message_id
    );

    if (
        Number.isInteger(messageId) &&
        state.renderedMessageIds.has(messageId)
    ) {
        return null;
    }

    const element =
        createMessageElement(message);

    if (!element || !chatMessages) {
        return null;
    }

    const stateElement =
        chatMessages.querySelector(
            ".chat-state"
        );

    if (stateElement) {
        chatMessages.replaceChildren();
    }

    chatMessages.appendChild(element);

    if (Number.isInteger(messageId)) {
        state.renderedMessageIds.add(
            messageId
        );
    }

    return element;
}


function normalizeConversationId(value) {
    const normalized = Number(value);
    return Number.isInteger(normalized)
        ? normalized
        : null;
}


function reconcileOptimisticMessage(
    optimisticElement,
    persistedMessage
) {
    const messageId = Number(
        persistedMessage?.message_id
    );

    if (!Number.isInteger(messageId)) {
        return optimisticElement;
    }

    const existingElement =
        chatMessages?.querySelector(
            `[data-message-id="${messageId}"]`
        );

    if (existingElement) {
        if (
            optimisticElement?.isConnected &&
            optimisticElement !== existingElement
        ) {
            optimisticElement.remove();
        }
        state.renderedMessageIds.add(messageId);
        return existingElement;
    }

    if (optimisticElement?.isConnected) {
        optimisticElement.dataset.messageId =
            String(messageId);
        state.renderedMessageIds.add(messageId);
        return optimisticElement;
    }

    return appendMessage(persistedMessage);
}


function renderMessages(messages) {
    if (!chatMessages) {
        return;
    }

    chatMessages.replaceChildren();
    state.renderedMessageIds.clear();

    const orderedMessages = [...messages].sort(
        (first, second) => {
            const firstTime =
                Date.parse(first.created_at || 0) ||
                0;
            const secondTime =
                Date.parse(second.created_at || 0) ||
                0;

            return (
                firstTime - secondTime ||
                Number(first.message_id || 0) -
                    Number(second.message_id || 0)
            );
        }
    );

    orderedMessages.forEach((message) => {
        appendMessage(message);
    });

    if (!chatMessages.children.length) {
        showMessageState(
            "No messages yet. Share a memory to begin."
        );
    }

    scrollChatToBottom();
}


function storeActiveConversationId(id) {
    if (id === null) {
        localStorage.removeItem(
            STORAGE_KEYS
                .ACTIVE_CONVERSATION_ID
        );
        return;
    }

    localStorage.setItem(
        STORAGE_KEYS.ACTIVE_CONVERSATION_ID,
        String(id)
    );
}


function getStoredActiveConversationId() {
    const storedId =
        localStorage.getItem(
            STORAGE_KEYS
                .ACTIVE_CONVERSATION_ID
        );
    const parsedId = Number(storedId);

    return Number.isInteger(parsedId) &&
        parsedId > 0
        ? parsedId
        : null;
}


function getActiveConversation() {
    return state.conversations.find(
        (conversation) =>
            conversation.conversation_id ===
            state.activeConversationId
    );
}


function updateConversationHeader() {
    if (!conversationTitle) {
        return;
    }

    conversationTitle.textContent =
        getActiveConversation()?.title ||
        "Conversation with Berry";
}


function createConversationButton(
    conversation
) {
    const button =
        document.createElement("button");
    button.type = "button";
    button.className =
        "conversation-list-item";
    button.dataset.conversationId =
        String(
            conversation.conversation_id
        );
    button.textContent =
        conversation.title || "New Chat";
    button.title =
        conversation.title || "New Chat";
    button.classList.toggle(
        "active",
        conversation.conversation_id ===
            state.activeConversationId
    );

    button.addEventListener(
        "click",
        () => {
            selectConversation(
                conversation.conversation_id
            );
        }
    );

    return button;
}


function renderConversationList() {
    if (!conversationList) {
        return;
    }

    conversationList.replaceChildren();

    if (!state.conversations.length) {
        conversationList.appendChild(
            createStateElement(
                "No conversations yet.",
                "empty-state"
            )
        );
        return;
    }

    state.conversations.forEach(
        (conversation) => {
            conversationList.appendChild(
                createConversationButton(
                    conversation
                )
            );
        }
    );
}


function sortConversations(conversations) {
    return [...conversations].sort(
        (first, second) => {
            const firstTime =
                Date.parse(
                    first.updated_at || 0
                ) || 0;
            const secondTime =
                Date.parse(
                    second.updated_at || 0
                ) || 0;

            return secondTime - firstTime;
        }
    );
}


async function loadMessageHistory(
    conversationId
) {
    const requestId =
        ++state.historyRequestId;

    state.isLoadingMessages = true;
    updateControls();
    setChatStatus(
        "Loading messages...",
        "loading"
    );
    showMessageState(
        "Loading conversation...",
        "loading-state"
    );

    try {
        const messages =
            await apiRequest(
                `/conversations/${conversationId}/messages`
            );

        if (
            requestId !==
                state.historyRequestId ||
            conversationId !==
                state.activeConversationId
        ) {
            return;
        }

        renderMessages(messages);

        if (
            state.isSending &&
            state.pendingConversationId ===
                conversationId
        ) {
            showTypingIndicator(
                conversationId
            );
        }

        setChatStatus(
            messages.length
                ? "Your conversation is up to date."
                : "Start by sharing a memory."
        );
    } catch (error) {
        if (
            requestId !==
            state.historyRequestId
        ) {
            return;
        }

        if (handleAuthenticationError(error)) {
            return;
        }

        if (
            error instanceof ApiError &&
            error.status === 404
        ) {
            await removeMissingConversation(
                conversationId
            );
            return;
        }

        setChatStatus(
            "Messages could not be loaded. Please try again.",
            "error"
        );
        showMessageState(
            "Messages could not be loaded.",
            "error-state",
            () =>
                loadMessageHistory(
                    conversationId
                )
        );
    } finally {
        if (
            requestId ===
            state.historyRequestId
        ) {
            state.isLoadingMessages =
                false;
            updateControls();
        }
    }
}


function selectConversation(
    conversationId,
    options = {}
) {
    const conversation =
        state.conversations.find(
            (item) =>
                item.conversation_id ===
                conversationId
        );

    if (!conversation) {
        return;
    }

    if (
        state.activeConversationId !==
            conversationId &&
        state.isSending
    ) {
        cancelActiveMessageRequest();
    }

    state.activeConversationId =
        conversationId;
    hideTypingIndicator();
    storeActiveConversationId(
        conversationId
    );
    renderConversationList();
    updateConversationHeader();
    updateControls();

    if (options.loadHistory !== false) {
        loadMessageHistory(
            conversationId
        );

        if (
            state.isSending &&
            state.pendingConversationId ===
                conversationId
        ) {
            showTypingIndicator(
                conversationId
            );
        }
    }
}


async function removeMissingConversation(
    conversationId,
    options = {}
) {
    state.conversations =
        state.conversations.filter(
            (conversation) =>
                conversation
                    .conversation_id !==
                conversationId
        );

    if (
        state.activeConversationId ===
        conversationId
    ) {
        state.activeConversationId = null;
        storeActiveConversationId(null);
    }

    renderConversationList();

    if (state.conversations.length) {
        selectConversation(
            state.conversations[0]
                .conversation_id
        );
    } else {
        updateConversationHeader();
        updateControls();
        setChatStatus(
            options.wasDeleted
                ? "Conversation deleted."
                : "That conversation is no longer available.",
            options.wasDeleted
                ? ""
                : "error"
        );
        showMessageState(
            options.wasDeleted
                ? "No conversations yet. Create a new chat to begin."
                : "Create a new chat to continue.",
            "empty-state"
        );
    }
}


function getNewChatRequest() {
    const url =
        new URL(window.location.href);
    const shouldCreate =
        url.searchParams.get("new") === "1";

    if (shouldCreate) {
        url.searchParams.delete("new");
        window.history.replaceState(
            {},
            "",
            `${url.pathname}${url.search}${url.hash}`
        );
    }

    return shouldCreate;
}


async function createConversation() {
    if (state.createConversationPromise) {
        return state.createConversationPromise;
    }

    cancelActiveMessageRequest();

    state.createConversationPromise =
        (async () => {
            updateControls();
            setChatStatus(
                "Creating a new chat...",
                "loading"
            );

            try {
                const conversation =
                    await apiRequest(
                        "/conversations",
                        {
                            method: "POST",
                            body: {}
                        }
                    );

                state.conversations =
                    state.conversations.filter(
                        (item) =>
                            item
                                .conversation_id !==
                            conversation
                                .conversation_id
                    );
                state.conversations.unshift(
                    conversation
                );

                selectConversation(
                    conversation
                        .conversation_id,
                    {
                        loadHistory: false
                    }
                );

                state.historyRequestId += 1;
                showMessageState(
                    "No messages yet. Share a memory to begin.",
                    "empty-state"
                );
                setChatStatus(
                    "New chat ready."
                );
                chatInput?.focus();

                return conversation;
            } catch (error) {
                if (
                    handleAuthenticationError(
                        error
                    )
                ) {
                    return null;
                }

                setChatStatus(
                    "A new chat could not be created. Please try again.",
                    "error"
                );
                return null;
            } finally {
                state.createConversationPromise =
                    null;
                updateControls();
            }
        })();

    updateControls();
    return state.createConversationPromise;
}


async function loadConversations() {
    if (conversationList) {
        conversationList.replaceChildren(
            createStateElement(
                "Loading conversations...",
                "loading-state"
            )
        );
    }

    try {
        const conversations =
            await apiRequest(
                "/conversations"
            );

        state.conversations =
            sortConversations(
                conversations
            );
        renderConversationList();

        if (getNewChatRequest()) {
            await createConversation();
            return;
        }

        const storedId =
            getStoredActiveConversationId();
        const storedConversation =
            state.conversations.find(
                (conversation) =>
                    conversation
                        .conversation_id ===
                    storedId
            );

        if (storedConversation) {
            selectConversation(
                storedConversation
                    .conversation_id
            );
            return;
        }

        if (state.conversations.length) {
            selectConversation(
                state.conversations[0]
                    .conversation_id
            );
            return;
        }

        state.activeConversationId = null;
        storeActiveConversationId(null);
        updateConversationHeader();
        updateControls();
        setChatStatus(
            "Create a new chat when you're ready."
        );
        showMessageState(
            "No conversations yet. Create a new chat to begin.",
            "empty-state"
        );
    } catch (error) {
        if (handleAuthenticationError(error)) {
            return;
        }

        if (conversationList) {
            conversationList.replaceChildren(
                createStateElement(
                    "Conversations could not be loaded.",
                    "error-state",
                    loadConversations
                )
            );
        }

        setChatStatus(
            "Conversations could not be loaded. Please try again.",
            "error"
        );
        showMessageState(
            "The server is temporarily unavailable.",
            "error-state",
            loadConversations
        );
    }
}


function moveActiveConversationToTop(
    updatedConversation
) {
    const conversation =
        state.conversations.find(
            (item) =>
                item.conversation_id ===
                updatedConversation
                    ?.conversation_id
        );

    if (!conversation) {
        return;
    }

    Object.assign(
        conversation,
        updatedConversation
    );

    state.conversations =
        sortConversations(
            state.conversations
    );
    renderConversationList();

    if (
        conversation.conversation_id ===
        state.activeConversationId
    ) {
        updateConversationHeader();
    }
}


async function sendMessage(event) {
    event.preventDefault();

    if (
        state.isSending ||
        state.isLoadingMessages
    ) {
        return;
    }

    const content =
        chatInput?.value.trim() || "";

    if (!content) {
        return;
    }

    state.isSending = true;
    updateControls();

    if (!state.activeConversationId) {
        const conversation =
            await createConversation();

        if (!conversation) {
            state.isSending = false;
            updateControls();
            chatInput?.focus();
            return;
        }
    }

    const conversationId =
        normalizeConversationId(
            state.activeConversationId
        );
    const requestId =
        ++state.messageRequestId;
    state.pendingConversationId =
        conversationId;
    const optimisticMessage =
        appendMessage({
            role: "user",
            content
        });

    showTypingIndicator(conversationId);
    setChatStatus(
        "Berry is responding...",
        "loading"
    );

    if (chatInput) {
        chatInput.value = "";
        chatInput.style.height = "";
    }

    const requestController =
        new AbortController();
    state.messageRequestController =
        requestController;
    let inactivityTimer = null;
    let didTimeout = false;
    let streamMessage = null;
    let streamCompleted = false;

    function resetInactivityTimer(
        timeoutMs =
            STREAM_INACTIVITY_TIMEOUT_MS
    ) {
        window.clearTimeout(
            inactivityTimer
        );
        inactivityTimer = window.setTimeout(
            () => {
                didTimeout = true;
                requestController.abort();
            },
            timeoutMs
        );
    }

    function isCurrentRequest() {
        return (
            requestId ===
                state.messageRequestId &&
            conversationId ===
                normalizeConversationId(
                    state.activeConversationId
                )
        );
    }

    try {
        if (supportsResponseStreaming()) {
            resetInactivityTimer();

            await streamChatMessage(
                conversationId,
                content,
                {
                    signal:
                        requestController.signal,
                    onEvent: async ({
                        event: eventType,
                        data
                    }) => {
                        resetInactivityTimer();

                        if (!isCurrentRequest()) {
                            requestController.abort();
                            return;
                        }

                        if (eventType === "start") {
                            if (
                                normalizeConversationId(
                                    data.conversation_id
                                ) !== conversationId
                            ) {
                                requestController.abort();
                                return;
                            }

                            if (
                                data.user_message
                            ) {
                                reconcileOptimisticMessage(
                                    optimisticMessage,
                                    data.user_message
                                );
                            }

                            if (data.conversation) {
                                moveActiveConversationToTop(
                                    data.conversation
                                );
                            }
                        } else if (
                            eventType === "delta"
                        ) {
                            hideTypingIndicator(
                                conversationId
                            );

                            if (
                                !streamMessage ||
                                !streamMessage
                                    .isConnected
                            ) {
                                streamMessage =
                                    createStreamingBerryMessage();
                                chatMessages?.appendChild(
                                    streamMessage
                                );
                            }

                            appendStreamDelta(
                                streamMessage,
                                data.text || ""
                            );
                            scrollChatToBottom(
                                "auto"
                            );
                        } else if (
                            eventType === "complete"
                        ) {
                            hideTypingIndicator(
                                conversationId
                            );

                            if (
                                !streamMessage ||
                                !streamMessage
                                    .isConnected
                            ) {
                                streamMessage =
                                    createStreamingBerryMessage();
                                chatMessages?.appendChild(
                                    streamMessage
                                );
                            }

                            finalizeStreamingMessage(
                                streamMessage,
                                data.message
                            );
                            streamCompleted = true;

                            if (data.conversation) {
                                moveActiveConversationToTop(
                                    data.conversation
                                );
                            }

                            setChatStatus(
                                "Berry’s response is complete."
                            );
                            scrollChatToBottom();
                        } else if (
                            eventType === "error"
                        ) {
                            throw new ApiError(
                                data.message ||
                                    "Berry’s response failed.",
                                {
                                    kind:
                                        data.code ||
                                        "stream"
                                }
                            );
                        } else {
                            throw new ApiError(
                                "The response stream contained an unexpected event.",
                                { kind: "stream" }
                            );
                        }
                    }
                }
            );

            if (!streamCompleted) {
                throw new ApiError(
                    "The response stream ended unexpectedly.",
                    { kind: "stream" }
                );
            }
        } else {
            resetInactivityTimer(
                NON_STREAMING_TIMEOUT_MS
            );

            const response =
                await apiRequest(
                `/conversations/${conversationId}/messages`,
                {
                    method: "POST",
                    body: { content },
                    signal:
                        requestController.signal
                }
            );

            resetInactivityTimer(
                NON_STREAMING_TIMEOUT_MS
            );

            if (!isCurrentRequest()) {
                return;
            }

            if (response.user_message) {
                reconcileOptimisticMessage(
                    optimisticMessage,
                    response.user_message
                );
            }

            hideTypingIndicator(
                conversationId
            );
            appendMessage(
                response.assistant_message
            );
            scrollChatToBottom();
            setChatStatus(
                "Message saved."
            );

            moveActiveConversationToTop(
                response.conversation
            );
        }
    } catch (error) {
        hideTypingIndicator(conversationId);

        if (!isCurrentRequest()) {
            return;
        }

        streamMessage?.remove();

        if (didTimeout) {
            error = new ApiError(
                "Berry took too long to respond.",
                { kind: "timeout" }
            );
        }

        if (
            error instanceof ApiError &&
            error.status === 404
        ) {
            await removeMissingConversation(
                conversationId
            );
        } else if (
            normalizeConversationId(
                state.activeConversationId
            ) === conversationId
        ) {
            if (!optimisticMessage?.isConnected) {
                appendMessage({
                    role: "user",
                    content
                });
            }
            appendInlineError(error);
            setChatStatus(
                getFriendlyChatError(error),
                "error"
            );
        }

        if (
            error instanceof ApiError &&
            error.status === 401
        ) {
            clearStoredSession();
            window.setTimeout(() => {
                window.location.replace(
                    "login.html"
                );
            }, 1200);
        } else {
            console.error(
                "Chat response request failed.",
                {
                    status:
                        error instanceof ApiError
                            ? error.status
                            : 0,
                    kind:
                        error instanceof ApiError
                            ? error.kind
                            : "unexpected"
                }
            );
        }
    } finally {
        window.clearTimeout(
            inactivityTimer
        );
        if (
            requestId ===
                state.messageRequestId &&
            state.messageRequestController ===
                requestController
        ) {
            state.messageRequestController =
                null;
            state.isSending = false;
            state.pendingConversationId =
                null;
            hideTypingIndicator(
                conversationId
            );
            updateControls();
            chatInput?.focus();
        }
    }
}


async function deleteActiveConversation() {
    if (
        !state.activeConversationId ||
        state.isDeleting
    ) {
        return;
    }

    const confirmed = window.confirm(
        "Delete this conversation and its messages?"
    );

    if (!confirmed) {
        return;
    }

    cancelActiveMessageRequest();

    const conversationId =
        state.activeConversationId;
    state.isDeleting = true;
    updateControls();
    setChatStatus(
        "Deleting conversation...",
        "loading"
    );

    try {
        await apiRequest(
            `/conversations/${conversationId}`,
            { method: "DELETE" }
        );

        await removeMissingConversation(
            conversationId,
            { wasDeleted: true }
        );

        if (state.conversations.length) {
            setChatStatus(
                "Conversation deleted."
            );
        }
    } catch (error) {
        if (handleAuthenticationError(error)) {
            return;
        }

        if (
            error instanceof ApiError &&
            error.status === 404
        ) {
            await removeMissingConversation(
                conversationId
            );
        } else {
            setChatStatus(
                "The conversation could not be deleted. Please try again.",
                "error"
            );
        }
    } finally {
        state.isDeleting = false;
        updateControls();
    }
}


chatForm?.addEventListener(
    "submit",
    sendMessage
);

chatInput?.addEventListener(
    "compositionstart",
    () => {
        state.isComposing = true;
    }
);

chatInput?.addEventListener(
    "compositionend",
    () => {
        state.isComposing = false;
    }
);

chatInput?.addEventListener(
    "keydown",
    (event) => {
        if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.isComposing &&
            !state.isComposing
        ) {
            event.preventDefault();
            chatForm?.requestSubmit();
        }
    }
);

chatInput?.addEventListener(
    "input",
    () => {
        chatInput.style.height = "auto";
        chatInput.style.height =
            `${Math.min(
                chatInput.scrollHeight,
                120
            )}px`;
    }
);

newChatButton?.addEventListener(
    "click",
    createConversation
);

clearChatButton?.addEventListener(
    "click",
    deleteActiveConversation
);

window.addEventListener(
    "pagehide",
    () => {
        state.messageRequestController?.abort();
        hideTypingIndicator();
    }
);


async function initializeChat() {
    await window.authReady;

    if (
        !window.WaffleBerryApi
            .getStoredAccessToken()
    ) {
        return;
    }

    updateControls();
    await loadConversations();
}


initializeChat();
})();
