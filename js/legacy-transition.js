"use strict";

(function initializeLegacyTransition() {
const PROGRESS_STEPS = Object.freeze([
    "Preparing companion",
    "Loading personality",
    "Loading conversations",
    "Almost ready"
]);
const FIRST_STEP_DELAY_MS = 350;
const STEP_INTERVAL_MS = 550;
const NAVIGATION_DELAY_MS = 2800;

const message =
    document.getElementById(
        "companionTransitionMessage"
    );
const progress =
    document.getElementById(
        "companionProgress"
    );
const legacyId =
    new URLSearchParams(
        window.location.search
    ).get("id");
const legacy =
    legacyId
        ? window.WaffleBerryLegacyState
            .select(legacyId)
        : null;


function returnToDashboard() {
    window.location.replace(
        "legacy-dashboard.html"
    );
}


function createProgressItems() {
    if (!progress) {
        return [];
    }

    const items =
        PROGRESS_STEPS.map((label) => {
            const item =
                document.createElement("li");
            const check =
                document.createElement("span");
            const text =
                document.createElement("span");

            item.className =
                "companion-progress-item";
            check.className =
                "companion-progress-check";
            check.textContent = "✓";
            check.setAttribute(
                "aria-hidden",
                "true"
            );
            text.textContent = label;

            item.append(check, text);
            return item;
        });

    progress.replaceChildren(...items);
    return items;
}


function chatDestination(selectedLegacy) {
    const parameters =
        new URLSearchParams({
            legacyId:
                selectedLegacy.id
        });

    return `chat.html?${parameters}`;
}


if (!legacy) {
    returnToDashboard();
    return;
}

if (message) {
    message.textContent =
        `Getting ${legacy.displayName} ready for your conversation...`;
}

const progressItems =
    createProgressItems();

progressItems.forEach(
    (item, index) => {
        window.setTimeout(
            () => {
                item.classList.add(
                    "companion-progress-item-visible"
                );
            },
            FIRST_STEP_DELAY_MS +
                index *
                    STEP_INTERVAL_MS
        );
    }
);

window.setTimeout(
    () => {
        window.location.replace(
            chatDestination(legacy)
        );
    },
    NAVIGATION_DELAY_MS
);
})();
