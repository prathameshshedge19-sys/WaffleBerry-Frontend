"use strict";

(function initializeCompanionHome() {
const LEGACY_ID_PARAMETER = "legacyId";
const legacyId =
    new URLSearchParams(
        window.location.search
    ).get(LEGACY_ID_PARAMETER);
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

const relationship =
    document.getElementById(
        "companionHomeRelationship"
    );
const title =
    document.getElementById(
        "companionHomeTitle"
    );
const avatar =
    document.getElementById(
        "companionHomeAvatar"
    );
const chatAction =
    document.getElementById(
        "chatFreelyAction"
    );
const guidedStoriesAction =
    document.getElementById(
        "guidedStoriesAction"
    );
const storyProgressAction =
    document.getElementById(
        "storyProgressAction"
    );
const voicePresenceAction =
    document.getElementById(
        "voicePresenceAction"
    );
const talkTitle =
    document.getElementById(
        "talkToCompanionTitle"
    );
const companionIsHereTitle =
    document.getElementById(
        "companionIsHereTitle"
    );
const settings =
    document.querySelector(
        ".companion-home-settings"
    );
const settingsTrigger =
    document.getElementById(
        "companionSettingsTrigger"
    );
const settingsMenu =
    document.getElementById(
        "companionSettingsMenu"
    );
const deleteAction =
    document.getElementById(
        "companionDeleteLegacy"
    );
const placeholderDialog =
    document.getElementById(
        "companionPlaceholderDialog"
    );
const placeholderTitle =
    document.getElementById(
        "companionPlaceholderTitle"
    );

if (relationship) {
    relationship.textContent =
        legacy.relationship;
}

if (title) {
    title.textContent =
        legacy.displayName;
}

if (avatar) {
    avatar.textContent =
        legacy.displayName
            .charAt(0)
            .toLocaleUpperCase() || "✦";
}

if (talkTitle) {
    talkTitle.textContent =
        `Talk to ${legacy.displayName}`;
}

if (companionIsHereTitle) {
    companionIsHereTitle.textContent =
        `${legacy.displayName} is Here`;
}

document
    .querySelectorAll(
        "[data-legacy-name]"
    )
    .forEach((element) => {
        element.textContent =
            legacy.displayName;
    });

if (chatAction) {
    const parameters =
        new URLSearchParams({
            [LEGACY_ID_PARAMETER]:
                legacy.id
        });
    chatAction.href =
        `chat.html?${parameters}`;

    [
        guidedStoriesAction,
        storyProgressAction,
        voicePresenceAction
    ]
        .filter(Boolean)
        .forEach((action) => {
            action.href =
                action === guidedStoriesAction
                    ? `legacy-studio.html?${parameters}`
                    : action ===
                        voicePresenceAction
                    ? `voice-presence.html?${parameters}`
                    : `guided-stories.html?${parameters}`;
        });
}

document.title =
    `${legacy.displayName} | Waffle Berry`;

function closeSettings({
    restoreFocus = false
} = {}) {
    if (!settingsMenu) {
        return;
    }

    settingsMenu.hidden = true;
    settingsTrigger?.setAttribute(
        "aria-expanded",
        "false"
    );

    if (restoreFocus) {
        settingsTrigger?.focus();
    }
}


function showPlaceholder(message) {
    closeSettings();

    if (
        !placeholderDialog ||
        !placeholderTitle
    ) {
        return;
    }

    placeholderTitle.textContent =
        message;
    placeholderDialog.showModal();
}


settingsTrigger?.addEventListener(
    "click",
    (event) => {
        event.stopPropagation();
        const willOpen =
            settingsMenu?.hidden;

        closeSettings();

        if (
            willOpen &&
            settingsMenu
        ) {
            settingsMenu.hidden = false;
            settingsTrigger.setAttribute(
                "aria-expanded",
                "true"
            );
            settingsMenu
                .querySelector(
                    '[role="menuitem"]'
                )
                ?.focus();
        }
    }
);

settings?.addEventListener(
    "click",
    (event) =>
        event.stopPropagation()
);

document.addEventListener(
    "click",
    () => closeSettings()
);

document.addEventListener(
    "keydown",
    (event) => {
        if (
            event.key === "Escape" &&
            settingsMenu &&
            !settingsMenu.hidden
        ) {
            event.preventDefault();
            closeSettings({
                restoreFocus: true
            });
        }
    }
);

document
    .querySelectorAll(
        "[data-placeholder-message]"
    )
    .forEach((action) => {
        action.addEventListener(
            "click",
            () => {
                showPlaceholder(
                    action.dataset
                        .placeholderMessage
                );
            }
        );
    });

deleteAction?.addEventListener(
    "click",
    async () => {
        closeSettings();

        const confirmed = await window.WaffleBerryLegacyDelete.confirm(
            legacy,
            settingsTrigger
        );
        if (!confirmed) {
            return;
        }
        try {
            const persisted = await window.WaffleBerryLegacyState
                .ensurePersisted(legacy.id);
            if (!persisted?.backendLegacyId) {
                throw new Error("Legacy persistence unavailable");
            }
            await window.WaffleBerryApi.deleteLegacy(
                persisted.backendLegacyId,
                legacy.displayName
            );
            window.WaffleBerryLegacyState.remove(
                legacy.id,
                { backendDeleted: true }
            );
            window.location.replace("legacy-dashboard.html");
        } catch (error) {
            if (error?.status === 401) {
                window.WaffleBerryApi.clearStoredSession();
                window.location.replace("login.html");
                return;
            }
            showPlaceholder(
                error?.status === 404
                    ? "This Legacy was not found. Return to Your Legacies and refresh."
                    : "Unable to delete this Legacy. Please try again."
            );
        }
    }
);
})();
