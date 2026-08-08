"use strict";

(function initializeLegacyStudio() {
const parameters =
    new URLSearchParams(
        window.location.search
    );
const legacyId =
    parameters.get("legacyId");
const legacy = legacyId
    ? window.WaffleBerryLegacyState
        .select(legacyId)
    : window.WaffleBerryLegacyState
        .getActive();

if (!legacy) {
    window.location.replace(
        "legacy-dashboard.html"
    );
    return;
}

if (legacy.status === "archived") {
    window.location.replace(
        `legacy-details.html?id=${encodeURIComponent(legacy.id)}`
    );
    return;
}

const query =
    new URLSearchParams({
        legacyId: legacy.id
    });
const title =
    document.getElementById(
        "legacyStudioTitle"
    );
const storyAction =
    document.getElementById(
        "studioStoryAction"
    );
const voiceAction =
    document.getElementById(
        "studioVoiceAction"
    );
const dialog =
    document.getElementById(
        "legacyStudioDialog"
    );

title.textContent =
    `Continue ${legacy.displayName}'s Story`;
storyAction.href =
    `guided-stories.html?${query}`;
voiceAction.href =
    `voice-presence.html?${query}`;
document.title =
    `${legacy.displayName}'s Legacy Studio | Waffle Berry`;

document
    .querySelectorAll(
        "[data-studio-coming-soon]"
    )
    .forEach((card) => {
        card.addEventListener(
            "click",
            () => dialog?.showModal()
        );
    });
})();
