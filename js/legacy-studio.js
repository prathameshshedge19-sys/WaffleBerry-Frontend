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
const memoryReviewAction =
    document.getElementById(
        "studioMemoryReviewAction"
    );
const memoryReviewCount =
    document.getElementById(
        "studioMemoryReviewCount"
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
memoryReviewAction.href =
    `memory-review.html?${query}`;
document.title =
    `${legacy.displayName}'s Legacy Studio | Waffle Berry`;

window.WaffleBerryLegacyState
    .ensurePersisted(legacy.id)
    .then((persistedLegacy) =>
        persistedLegacy?.backendLegacyId
            ? window.WaffleBerryApi
                .listMemoryReview(
                    persistedLegacy.backendLegacyId,
                    { limit: 1 }
                )
            : null
    )
    .then((result) => {
        if (!result) {
            return;
        }
        if (
            result.total > 0 &&
            memoryReviewCount
        ) {
            memoryReviewCount.textContent =
                `${result.total} to review`;
            memoryReviewCount.hidden = false;
        }
    })
    .catch(() => {
        // Story and review pages expose safe synchronization recovery.
    });

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
