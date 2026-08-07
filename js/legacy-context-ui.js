"use strict";

(function initializeLegacyContextUi() {
const PAGE_DESTINATIONS = new Set(["home.html", "chat.html", "mission.html"]);

function parametersFor(legacy, conversationId) {
    const parameters = new URLSearchParams();
    if (legacy?.id) parameters.set("legacyId", legacy.id);
    if (conversationId) parameters.set("conversationId", String(conversationId));
    return parameters;
}

function scopeNavigation(legacy, conversationId) {
    if (!legacy?.id) return;
    const query = parametersFor(legacy, conversationId).toString();
    document.querySelectorAll("a[href]").forEach((link) => {
        const url = new URL(link.getAttribute("href"), window.location.href);
        const destination = url.pathname.split("/").pop();
        if (!PAGE_DESTINATIONS.has(destination)) return;
        link.href = `${destination}?${query}`;
    });
}

function updateLegacyAwareUI(legacy, options = {}) {
    const name = legacy?.displayName?.trim();
    document.querySelectorAll("[data-legacy-cta]").forEach((element) => {
        element.textContent = name ? `Talk to ${name}` : element.dataset.genericLabel;
    });
    const conversationId = options.conversationId
        || new URLSearchParams(window.location.search).get("conversationId");
    if (name) scopeNavigation(legacy, conversationId);
}

async function resolveSelectedLegacy() {
    await window.authReady;
    const state = window.WaffleBerryLegacyState;
    const requestedId = new URLSearchParams(window.location.search).get("legacyId");
    await state.hydratePersisted("active");
    if (requestedId) {
        let requested = state.select(requestedId);
        if (!requested) {
            await state.hydratePersisted("archived");
            requested = state.select(requestedId);
        }
        if (!requested || requested.status === "archived") {
            window.location.replace("legacy-dashboard.html");
            return null;
        }
        return requested;
    }
    const active = state.getActive();
    return active?.status === "archived" ? null : active;
}

window.WaffleBerryLegacyContextUi = Object.freeze({
    parametersFor,
    resolveSelectedLegacy,
    scopeNavigation,
    updateLegacyAwareUI
});
})();
