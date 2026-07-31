"use strict";

(function initializeCompanionHome() {
const state = window.WaffleBerryLegacyState;
const api = window.WaffleBerryApi;
const elements = {
    loading: document.getElementById("companionHomeLoading"),
    error: document.getElementById("companionHomeError"),
    errorMessage: document.getElementById("companionHomeErrorMessage"),
    retry: document.getElementById("companionHomeRetry"),
    content: document.getElementById("companionHomeContent"),
    title: document.getElementById("companionHomeTitle"),
    relationship: document.getElementById("companionHomeRelationship"),
    avatar: document.getElementById("companionHomeAvatar"),
    archived: document.getElementById("companionArchivedNotice"),
    chat: document.getElementById("chatFreelyAction"),
    studio: document.getElementById("guidedStoriesAction")
};

function requestedLegacyId() {
    return new URLSearchParams(window.location.search).get("legacyId");
}

function showError(message) {
    elements.loading.hidden = true;
    elements.content.hidden = true;
    elements.error.hidden = false;
    elements.errorMessage.textContent = message;
}

function setDisabled(action, disabled) {
    action.setAttribute("aria-disabled", String(disabled));
    action.classList.toggle("is-disabled", disabled);
    if (disabled) {
        action.removeAttribute("href");
    }
}

async function load() {
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.content.hidden = true;
    try {
        await window.authReady;
        await state.hydratePersisted("active");
        await state.hydratePersisted("archived");
        const requestedId = requestedLegacyId();
        const legacy = requestedId
            ? state.select(requestedId)
            : state.getActive();
        if (!legacy) {
            showError("Return to Your Legacies and select a saved Legacy.");
            return;
        }
        const persisted = await state.ensurePersisted(legacy.id);
        if (!persisted?.backendLegacyId) {
            showError("This Legacy could not be loaded. Try again from Your Legacies.");
            return;
        }

        elements.title.textContent = persisted.displayName;
        elements.relationship.textContent = persisted.relationship;
        elements.avatar.textContent =
            persisted.displayName.charAt(0).toLocaleUpperCase() || "L";
        const query = new URLSearchParams({ legacyId: persisted.id });
        const archived = persisted.status === "archived";
        elements.archived.hidden = !archived;
        if (!archived) {
            elements.chat.href = `chat.html?${query}`;
            elements.studio.href = `legacy-studio.html?${query}`;
        }
        setDisabled(elements.chat, archived);
        setDisabled(elements.studio, archived);
        elements.loading.hidden = true;
        elements.content.hidden = false;
        document.title = `${persisted.displayName} - Selected Legacy | Waffle Berry`;
    } catch (error) {
        if (error?.status === 401) {
            api.clearStoredSession();
            window.location.replace("login.html");
            return;
        }
        showError(
            error?.status === 404
                ? "This Legacy was not found."
                : "This Legacy could not be loaded. Check your connection and try again."
        );
    }
}

elements.retry.addEventListener("click", load);
load();
})();
