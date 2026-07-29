"use strict";

(function initializeCompanionIdentity() {
const DEFAULT_NAME = "Berry";
const LEGACY_ID_PARAMETER = "legacyId";


function selectedLegacy() {
    const legacyId =
        new URLSearchParams(
            window.location.search
        ).get(LEGACY_ID_PARAMETER);

    if (legacyId) {
        return (
            window.WaffleBerryLegacyState
                ?.select(legacyId) ||
            null
        );
    }

    return (
        window.WaffleBerryLegacyState
            ?.getActive() ||
        null
    );
}


const legacy = selectedLegacy();
const displayName =
    legacy?.displayName?.trim() ||
    DEFAULT_NAME;


function getDisplayName() {
    return displayName;
}


function getLegacy() {
    return legacy;
}


function text(template) {
    return String(template).replaceAll(
        "{name}",
        displayName
    );
}


function personalize(message) {
    if (displayName === DEFAULT_NAME) {
        return message;
    }

    return String(message).replace(
        /\bBerry\b/g,
        displayName
    );
}


function welcomeMessage() {
    return [
        "Hello.",
        "",
        `I’m ${displayName}.`,
        "",
        "I’m ready whenever you are."
    ].join("\n");
}


function applyToDocument() {
    document
        .querySelectorAll(
            "[data-companion-name]"
        )
        .forEach((element) => {
            element.textContent =
                displayName;
        });

    document
        .querySelectorAll(
            "[data-companion-template]"
        )
        .forEach((element) => {
            element.textContent = text(
                element.dataset
                    .companionTemplate
            );
        });

    document
        .querySelectorAll(
            "[data-companion-placeholder]"
        )
        .forEach((element) => {
            element.placeholder = text(
                element.dataset
                    .companionPlaceholder
            );
        });

    document
        .querySelectorAll(
            "[data-companion-label]"
        )
        .forEach((element) => {
            element.setAttribute(
                "aria-label",
                text(
                    element.dataset
                        .companionLabel
                )
            );
        });

    if (legacy) {
        document.title =
            `${displayName} | Waffle Berry`;

        const description =
            document.querySelector(
                'meta[name="description"]'
            );
        description?.setAttribute(
            "content",
            `Conversation with ${displayName}.`
        );
    }
}


window.WaffleBerryCompanionIdentity =
    Object.freeze({
        applyToDocument,
        getDisplayName,
        getLegacy,
        personalize,
        text,
        welcomeMessage
    });
})();
