"use strict";

(function initializeLegacyDashboard() {
const api = window.WaffleBerryApi;
const state = window.WaffleBerryLegacyState;
const elements = {
    grid: document.getElementById("legacyGrid"),
    empty: document.getElementById("legacyEmptyState"),
    emptyTitle: document.getElementById("legacyEmptyTitle"),
    emptyMessage: document.getElementById("legacyEmptyMessage"),
    count: document.getElementById("legacyCount"),
    loading: document.getElementById("legacyManagementLoading"),
    error: document.getElementById("legacyManagementError"),
    errorMessage: document.getElementById("legacyManagementErrorMessage"),
    retry: document.getElementById("legacyManagementRetry"),
    feedback: document.getElementById("legacyManagementFeedback"),
    tabs: [...document.querySelectorAll("[data-legacy-status-tab]")]
};
let selectedStatus = "active";
let openMenu = null;
const pendingIds = new Set();

function formatCreatedAt(createdAt) {
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) {
        return "Creation date unavailable";
    }
    if (created.toDateString() === new Date().toDateString()) {
        return "Created today";
    }
    return `Created ${new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
    }).format(created)}`;
}

function legacyUrl(destination, legacyId) {
    return `${destination}?id=${encodeURIComponent(legacyId)}`;
}

function closeMenu({ restoreFocus = false } = {}) {
    if (!openMenu) return;
    const trigger = openMenu.querySelector(".legacy-menu-trigger");
    const popover = openMenu.querySelector(".legacy-menu-popover");
    trigger?.setAttribute("aria-expanded", "false");
    if (popover) popover.hidden = true;
    openMenu = null;
    if (restoreFocus) trigger?.focus();
}

function safeError(error, action) {
    if (error?.status === 404) {
        return "This Legacy was not found. Refreshing the list may help.";
    }
    if (error?.status === 409) {
        return "This Legacy changed elsewhere. Refresh and try again.";
    }
    if (error?.kind === "network") {
        return `Unable to ${action} while offline. Check your connection and try again.`;
    }
    return `Unable to ${action}. Please try again.`;
}

function handleUnauthorized(error) {
    if (error?.status !== 401) return false;
    api.clearStoredSession();
    window.location.replace("login.html");
    return true;
}

function setFeedback(message, isError = false) {
    elements.feedback.textContent = message;
    elements.feedback.classList.toggle("is-error", isError);
}

async function mutateLegacy(legacy, action, trigger) {
    if (!legacy.backendLegacyId || pendingIds.has(legacy.backendLegacyId)) return;
    pendingIds.add(legacy.backendLegacyId);
    trigger.disabled = true;
    setFeedback(`${action === "archive" ? "Archiving" : "Restoring"} ${legacy.displayName}…`);
    try {
        const updated = action === "archive"
            ? await api.archiveLegacy(legacy.backendLegacyId)
            : await api.restoreLegacy(legacy.backendLegacyId);
        state.updatePersisted(updated.legacy_id, updated);
        setFeedback(`${legacy.displayName} was ${action === "archive" ? "archived" : "restored"}.`);
        renderLegacies();
    } catch (error) {
        if (!handleUnauthorized(error)) {
            setFeedback(safeError(error, action), true);
        }
    } finally {
        pendingIds.delete(legacy.backendLegacyId);
        trigger.disabled = false;
    }
}

async function deleteLegacy(legacy, trigger) {
    const confirmed = await window.WaffleBerryLegacyDelete.confirm(legacy, trigger);
    if (!confirmed || !legacy.backendLegacyId) return;
    pendingIds.add(legacy.backendLegacyId);
    setFeedback(`Permanently deleting ${legacy.displayName}…`);
    try {
        await api.deleteLegacy(legacy.backendLegacyId, legacy.displayName);
        state.remove(legacy.id, { backendDeleted: true });
        setFeedback(`${legacy.displayName} was permanently deleted.`);
        renderLegacies();
    } catch (error) {
        if (!handleUnauthorized(error)) {
            setFeedback(safeError(error, "delete this Legacy"), true);
        }
    } finally {
        pendingIds.delete(legacy.backendLegacyId);
    }
}

async function exportLegacy(legacy, trigger) {
    if (!legacy.backendLegacyId || pendingIds.has(legacy.backendLegacyId)) return;
    pendingIds.add(legacy.backendLegacyId);
    trigger.disabled = true;
    setFeedback(`Preparing ${legacy.displayName} for download…`);
    try {
        const download = await api.exportLegacy(legacy.backendLegacyId);
        const url = URL.createObjectURL(download.blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = download.filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        setFeedback(`${legacy.displayName} was exported.`);
    } catch (error) {
        if (!handleUnauthorized(error)) {
            setFeedback(safeError(error, "export this Legacy"), true);
        }
    } finally {
        pendingIds.delete(legacy.backendLegacyId);
        trigger.disabled = false;
    }
}

function createLinkAction(label, legacy, destination) {
    const action = document.createElement("a");
    action.className = "legacy-menu-item";
    action.href = legacyUrl(destination, legacy.id);
    action.role = "menuitem";
    action.textContent = label;
    action.addEventListener("click", () => closeMenu());
    return action;
}

function createButtonAction(label, handler, destructive = false) {
    const action = document.createElement("button");
    action.className = `legacy-menu-item${destructive ? " legacy-menu-delete" : ""}`;
    action.type = "button";
    action.role = "menuitem";
    action.textContent = label;
    action.addEventListener("click", (event) => {
        event.stopPropagation();
        closeMenu();
        handler(action);
    });
    return action;
}

function createOverflowMenu(legacy) {
    const menu = document.createElement("div");
    menu.className = "legacy-card-menu";
    const trigger = document.createElement("button");
    trigger.className = "legacy-menu-trigger";
    trigger.type = "button";
    trigger.setAttribute("aria-label", `Actions for ${legacy.displayName}`);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.textContent = "⋮";
    const popover = document.createElement("div");
    popover.className = "legacy-menu-popover";
    popover.role = "menu";
    popover.hidden = true;
    popover.append(
        createLinkAction("My Legacy", legacy, "legacy-details.html"),
        ...(legacy.status === "active"
            ? [createLinkAction("Legacy Settings", legacy, "legacy-settings.html")]
            : []),
        createButtonAction(
            legacy.status === "active" ? "Archive" : "Restore",
            (button) => mutateLegacy(
                legacy,
                legacy.status === "active" ? "archive" : "restore",
                button
            )
        ),
        createButtonAction("Export", (button) => exportLegacy(legacy, button)),
        createButtonAction("Delete Legacy", (button) => deleteLegacy(legacy, button), true)
    );
    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const isCurrent = openMenu === menu;
        closeMenu();
        if (!isCurrent) {
            openMenu = menu;
            popover.hidden = false;
            trigger.setAttribute("aria-expanded", "true");
            popover.querySelector('[role="menuitem"]')?.focus();
        }
    });
    menu.addEventListener("click", (event) => event.stopPropagation());
    menu.append(trigger, popover);
    return menu;
}

function createLegacyCard(legacy) {
    const card = document.createElement("article");
    card.className = "glass-card legacy-dashboard-card";
    card.dataset.legacyId = legacy.id;
    card.tabIndex = 0;
    card.role = "link";
    card.setAttribute("aria-label", `View ${legacy.displayName}'s Legacy`);
    const initial = document.createElement("span");
    initial.className = "legacy-card-initial";
    initial.ariaHidden = "true";
    initial.textContent = legacy.displayName.charAt(0).toLocaleUpperCase() || "✦";
    const copy = document.createElement("div");
    copy.className = "legacy-dashboard-card-copy";
    const title = document.createElement("h3");
    title.textContent = legacy.displayName;
    const relationship = document.createElement("p");
    relationship.textContent = legacy.relationship;
    const badge = document.createElement("span");
    badge.className = `legacy-lifecycle-badge is-${legacy.status}`;
    badge.textContent = legacy.status === "archived" ? "Archived" : "Active";
    const date = document.createElement("time");
    date.dateTime = legacy.createdAt;
    date.textContent = formatCreatedAt(legacy.createdAt);
    copy.append(title, relationship, badge, date);
    const actions = document.createElement("div");
    actions.className = "legacy-card-actions";
    const view = createLinkAction("My Legacy", legacy, "legacy-details.html");
    view.className = "primary-button legacy-card-continue";
    actions.append(view);
    const navigate = () => {
        window.location.href = legacyUrl("legacy-details.html", legacy.id);
    };
    card.addEventListener("click", (event) => {
        if (!event.target.closest("a, button, .legacy-card-menu")) navigate();
    });
    card.addEventListener("keydown", (event) => {
        if (event.target === card && ["Enter", " "].includes(event.key)) {
            event.preventDefault();
            navigate();
        }
    });
    card.append(createOverflowMenu(legacy), initial, copy, actions);
    return card;
}

function currentLegacies() {
    return state.list().filter((legacy) => legacy.status === selectedStatus);
}

function renderLegacies() {
    closeMenu();
    const legacies = currentLegacies();
    const hasLegacies = legacies.length > 0;
    elements.grid.replaceChildren(...legacies.map(createLegacyCard));
    elements.grid.hidden = !hasLegacies;
    elements.empty.hidden = hasLegacies;
    elements.emptyTitle.textContent = selectedStatus === "active"
        ? "You haven’t begun a legacy yet."
        : "No archived Legacies.";
    elements.emptyMessage.textContent = selectedStatus === "active"
        ? "Begin your first Legacy and preserve the stories that matter most."
        : "Legacies you archive will appear here and can be restored at any time.";
    elements.count.textContent = hasLegacies
        ? `${legacies.length} ${legacies.length === 1 ? "legacy" : "legacies"}`
        : "";
}

async function load(status = selectedStatus) {
    selectedStatus = status;
    elements.tabs.forEach((tab) => {
        const selected = tab.dataset.legacyStatusTab === selectedStatus;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.grid.hidden = true;
    elements.empty.hidden = true;
    try {
        await window.authReady;
        await state.hydratePersisted(selectedStatus);
        renderLegacies();
    } catch (error) {
        if (handleUnauthorized(error)) return;
        elements.errorMessage.textContent = safeError(error, "load Legacies");
        elements.error.hidden = false;
    } finally {
        elements.loading.hidden = true;
    }
}

elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => load(tab.dataset.legacyStatusTab));
    tab.addEventListener("keydown", (event) => {
        const currentIndex = elements.tabs.indexOf(tab);
        let nextIndex = null;
        if (["ArrowRight", "ArrowDown"].includes(event.key)) {
            nextIndex = (currentIndex + 1) % elements.tabs.length;
        } else if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
            nextIndex = (currentIndex - 1 + elements.tabs.length) % elements.tabs.length;
        } else if (event.key === "Home") {
            nextIndex = 0;
        } else if (event.key === "End") {
            nextIndex = elements.tabs.length - 1;
        }
        if (nextIndex === null) return;
        event.preventDefault();
        elements.tabs[nextIndex].focus();
        elements.tabs[nextIndex].click();
    });
});
elements.retry.addEventListener("click", () => load());
document.addEventListener("click", (event) => {
    if (openMenu && !openMenu.contains(event.target)) closeMenu();
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openMenu) {
        event.preventDefault();
        closeMenu({ restoreFocus: true });
    }
});
document.querySelectorAll("[data-begin-legacy]").forEach((action) => {
    action.addEventListener("click", () => state.startDraft());
});
load();
})();
