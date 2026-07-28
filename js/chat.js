"use strict";

(function initializeChatPage() {
const {
    STORAGE_KEYS,
    ApiError,
    apiRequest,
    clearStoredSession
} = window.WaffleBerryApi;

const chatForm =
    document.getElementById("chatForm");
const chatInput =
    document.getElementById("chatInput");
const chatMessages =
    document.getElementById("chatMessages");
const typingIndicator =
    document.getElementById(
        "typingIndicator"
    );
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
    isLoadingMessages: false,
    isSending: false,
    isDeleting: false
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


function scrollChatToBottom() {
    if (chatMessages) {
        chatMessages.scrollTop =
            chatMessages.scrollHeight;
    }
}


function showTypingIndicator() {
    typingIndicator?.classList.add(
        "visible"
    );
}


function hideTypingIndicator() {
    typingIndicator?.classList.remove(
        "visible"
    );
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

    chatMessages.replaceChildren(
        createStateElement(
            message,
            type,
            retryAction
        )
    );
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


function createBerryMessage(content) {
    const row =
        document.createElement("div");
    row.className =
        "message-row berry-row";

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
    message.textContent = content;

    row.appendChild(avatar);
    row.appendChild(message);
    return row;
}


function createMessageElement(message) {
    if (message?.role === "user") {
        return createUserMessage(
            message.content
        );
    }

    if (message?.role === "assistant") {
        return createBerryMessage(
            message.content
        );
    }

    return null;
}


function appendMessage(message) {
    const element =
        createMessageElement(message);

    if (!element || !chatMessages) {
        return;
    }

    const stateElement =
        chatMessages.querySelector(
            ".chat-state"
        );

    if (stateElement) {
        chatMessages.replaceChildren();
    }

    chatMessages.appendChild(element);
}


function renderMessages(messages) {
    if (!chatMessages) {
        return;
    }

    chatMessages.replaceChildren();

    messages.forEach((message) => {
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
            error.message,
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

    state.activeConversationId =
        conversationId;
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
                    error.message,
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
            error.message,
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
        getActiveConversation();

    if (!conversation) {
        return;
    }

    if (
        updatedConversation &&
        updatedConversation
            .conversation_id ===
            conversation
                .conversation_id
    ) {
        Object.assign(
            conversation,
            updatedConversation
        );
    } else {
        conversation.updated_at =
            new Date().toISOString();
    }

    state.conversations =
        sortConversations(
            state.conversations
        );
    renderConversationList();
    updateConversationHeader();
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

    if (!state.activeConversationId) {
        const conversation =
            await createConversation();

        if (!conversation) {
            return;
        }
    }

    const conversationId =
        state.activeConversationId;

    state.isSending = true;
    updateControls();
    showTypingIndicator();
    setChatStatus(
        "Berry is responding...",
        "loading"
    );

    try {
        const response =
            await apiRequest(
                `/conversations/${conversationId}/messages`,
                {
                    method: "POST",
                    body: { content }
                }
            );

        if (
            state.activeConversationId ===
            conversationId
        ) {
            appendMessage(
                response.user_message
            );
            appendMessage(
                response.assistant_message
            );
            scrollChatToBottom();
        }

        if (chatInput) {
            chatInput.value = "";
            chatInput.style.height = "";
        }

        moveActiveConversationToTop(
            response.conversation
        );
        setChatStatus(
            "Message saved."
        );
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
                error.message,
                "error"
            );
        }
    } finally {
        state.isSending = false;
        hideTypingIndicator();
        updateControls();
        chatInput?.focus();
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
                error.message,
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

newChatButton?.addEventListener(
    "click",
    createConversation
);

clearChatButton?.addEventListener(
    "click",
    deleteActiveConversation
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
