"use strict";

(function initializeLegacyDashboard() {
const CARD_REMOVAL_DURATION = 260;
const legacyGrid =
    document.getElementById("legacyGrid");
const emptyState =
    document.getElementById(
        "legacyEmptyState"
    );
const legacyCount =
    document.getElementById("legacyCount");
let openMenu = null;


function formatCreatedAt(createdAt) {
    const created = new Date(createdAt);
    const today = new Date();

    if (
        created.toDateString() ===
        today.toDateString()
    ) {
        return "Created today";
    }

    return `Created ${new Intl.DateTimeFormat(
        undefined,
        {
            month: "short",
            day: "numeric",
            year: "numeric"
        }
    ).format(created)}`;
}


function legacyUrl(destination, legacyId) {
    return `${destination}?id=${
        encodeURIComponent(legacyId)
    }`;
}


function closeMenu({ restoreFocus = false } = {}) {
    if (!openMenu) {
        return;
    }

    const trigger =
        openMenu.querySelector(
            ".legacy-menu-trigger"
        );
    const popover =
        openMenu.querySelector(
            ".legacy-menu-popover"
        );

    trigger?.setAttribute(
        "aria-expanded",
        "false"
    );

    if (popover) {
        popover.hidden = true;
    }

    openMenu = null;

    if (restoreFocus) {
        trigger?.focus();
    }
}


function openDeleteDialog(legacy, trigger) {
    window.WaffleBerryLegacyDelete
        .confirm(legacy, trigger)
        .then((confirmed) => {
            if (!confirmed) {
                return;
            }

            const card =
                legacyGrid?.querySelector(
                    `[data-legacy-id="${
                        CSS.escape(
                            legacy.id
                        )
                    }"]`
                );

            card?.classList.add(
                "legacy-dashboard-card-removing"
            );

            window.setTimeout(() => {
                window
                    .WaffleBerryLegacyState
                    .remove(legacy.id);
                renderLegacies();
            }, CARD_REMOVAL_DURATION);
        });
}


function createMenuAction(
    label,
    legacy,
    destination
) {
    const action =
        document.createElement("a");
    action.className =
        "legacy-menu-item";
    action.href =
        legacyUrl(
            destination,
            legacy.id
        );
    action.setAttribute(
        "role",
        "menuitem"
    );
    action.textContent = label;
    action.addEventListener(
        "click",
        () => closeMenu()
    );
    return action;
}


function createOverflowMenu(legacy) {
    const menu =
        document.createElement("div");
    menu.className =
        "legacy-card-menu";

    const trigger =
        document.createElement("button");
    trigger.className =
        "legacy-menu-trigger";
    trigger.type = "button";
    trigger.setAttribute(
        "aria-label",
        `Actions for ${legacy.displayName}`
    );
    trigger.setAttribute(
        "aria-haspopup",
        "menu"
    );
    trigger.setAttribute(
        "aria-expanded",
        "false"
    );
    trigger.textContent = "⋮";

    const popover =
        document.createElement("div");
    popover.className =
        "legacy-menu-popover";
    popover.setAttribute(
        "role",
        "menu"
    );
    popover.hidden = true;

    const divider =
        document.createElement("div");
    divider.className =
        "legacy-menu-divider";
    divider.setAttribute(
        "role",
        "separator"
    );

    const deleteAction =
        document.createElement("button");
    deleteAction.className =
        "legacy-menu-item legacy-menu-delete";
    deleteAction.type = "button";
    deleteAction.setAttribute(
        "role",
        "menuitem"
    );
    deleteAction.textContent =
        "Delete Legacy";
    deleteAction.addEventListener(
        "click",
        (event) => {
            event.stopPropagation();
            closeMenu();
            openDeleteDialog(
                legacy,
                trigger
            );
        }
    );

    popover.append(
        createMenuAction(
            "Continue",
            legacy,
            "legacy-transition.html"
        ),
        createMenuAction(
            "View",
            legacy,
            "legacy-details.html"
        ),
        divider,
        deleteAction
    );

    trigger.addEventListener(
        "click",
        (event) => {
            event.stopPropagation();
            const isCurrentMenu =
                openMenu === menu;

            closeMenu();

            if (!isCurrentMenu) {
                openMenu = menu;
                popover.hidden = false;
                trigger.setAttribute(
                    "aria-expanded",
                    "true"
                );
                popover
                    .querySelector(
                        '[role="menuitem"]'
                    )
                    ?.focus();
            }
        }
    );

    menu.addEventListener(
        "click",
        (event) =>
            event.stopPropagation()
    );
    menu.append(trigger, popover);
    return menu;
}


function createAction(
    label,
    legacyId,
    className,
    destination
) {
    const action =
        document.createElement("a");
    action.className = className;
    action.href =
        legacyUrl(
            destination,
            legacyId
        );
    action.textContent = label;
    return action;
}


function createLegacyCard(legacy) {
    const card =
        document.createElement("article");
    card.className =
        "glass-card legacy-dashboard-card";
    card.dataset.legacyId = legacy.id;
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.setAttribute(
        "aria-label",
        `Continue with ${legacy.displayName}`
    );

    const initial =
        document.createElement("span");
    initial.className =
        "legacy-card-initial";
    initial.setAttribute(
        "aria-hidden",
        "true"
    );
    initial.textContent =
        legacy.displayName
            .charAt(0)
            .toLocaleUpperCase() || "✦";

    const copy =
        document.createElement("div");
    copy.className =
        "legacy-dashboard-card-copy";

    const title =
        document.createElement("h3");
    title.textContent =
        legacy.displayName;

    const relationship =
        document.createElement("p");
    relationship.textContent =
        legacy.relationship;

    const date =
        document.createElement("time");
    date.dateTime = legacy.createdAt;
    date.textContent =
        formatCreatedAt(
            legacy.createdAt
        );

    copy.append(
        title,
        relationship,
        date
    );

    const actions =
        document.createElement("div");
    actions.className =
        "legacy-card-actions";
    actions.append(
        createAction(
            "Continue",
            legacy.id,
            "primary-button legacy-card-continue",
            "legacy-transition.html"
        ),
        createAction(
            "View",
            legacy.id,
            "legacy-card-view",
            "legacy-details.html"
        )
    );

    card.addEventListener(
        "click",
        (event) => {
            if (
                event.target.closest(
                    "a, button, .legacy-card-menu"
                )
            ) {
                return;
            }

            window.location.href =
                legacyUrl(
                    "legacy-transition.html",
                    legacy.id
                );
        }
    );
    card.addEventListener(
        "keydown",
        (event) => {
            if (
                event.target !== card ||
                !["Enter", " "].includes(
                    event.key
                )
            ) {
                return;
            }

            event.preventDefault();
            window.location.href =
                legacyUrl(
                    "legacy-transition.html",
                    legacy.id
                );
        }
    );

    card.append(
        createOverflowMenu(legacy),
        initial,
        copy,
        actions
    );
    return card;
}


function renderLegacies() {
    closeMenu();

    const legacies =
        window.WaffleBerryLegacyState.list();
    const hasLegacies =
        legacies.length > 0;

    if (legacyGrid) {
        legacyGrid.replaceChildren(
            ...legacies.map(
                createLegacyCard
            )
        );
        legacyGrid.hidden =
            !hasLegacies;
    }

    if (emptyState) {
        emptyState.hidden =
            hasLegacies;
    }

    if (legacyCount) {
        legacyCount.textContent =
            hasLegacies
                ? `${legacies.length} ${
                    legacies.length === 1
                        ? "legacy"
                        : "legacies"
                }`
                : "";
    }
}


document.addEventListener(
    "click",
    (event) => {
        if (
            openMenu &&
            !openMenu.contains(event.target)
        ) {
            closeMenu();
        }
    }
);

document.addEventListener(
    "keydown",
    (event) => {
        if (
            event.key === "Escape" &&
            openMenu
        ) {
            event.preventDefault();
            closeMenu({
                restoreFocus: true
            });
        }
    }
);

document
    .querySelectorAll(
        "[data-begin-legacy]"
    )
    .forEach((action) => {
        action.addEventListener(
            "click",
            () => {
                window
                    .WaffleBerryLegacyState
                    .startDraft();
            }
        );
    });


renderLegacies();
})();
