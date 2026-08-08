"use strict";

(function initializeNightModeDiscovery() {
const DISMISSED_KEY =
    "waffleberryNightModeDiscoveryDismissed";
const SHOWN_SESSION_KEY =
    "waffleberryNightModeDiscoveryShownSession";
const DISPLAY_DELAY_MS = 600;

const dialog = document.getElementById(
    "nightModeDiscoveryDialog"
);
const closeButton = document.getElementById(
    "nightModeDiscoveryClose"
);
const laterButton = document.getElementById(
    "nightModeDiscoveryLater"
);
const enterButton = document.getElementById(
    "nightModeDiscoveryEnter"
);
const dismissedCheckbox = document.getElementById(
    "nightModeDiscoveryDismissed"
);

let displayTimer = null;
let contentIsReady = false;
let isSigningOut = false;
let isUnloading = false;
let returnFocusTarget = null;

function hasBlockingModal() {
    return Boolean(
        document.querySelector(
            "dialog[open]:not(#nightModeDiscoveryDialog), [aria-modal='true']:not(#nightModeDiscoveryDialog)"
        )
    );
}

function isEligible() {
    return Boolean(
        dialog &&
        contentIsReady &&
        window.WaffleBerryApi
            ?.getStoredAccessToken() &&
        !window.WaffleBerryTheme?.isDark() &&
        localStorage.getItem(DISMISSED_KEY) !==
            "true" &&
        sessionStorage.getItem(
            SHOWN_SESSION_KEY
        ) !== "true" &&
        !hasBlockingModal() &&
        !isSigningOut &&
        !isUnloading &&
        document.visibilityState !== "hidden" &&
        !dialog.open
    );
}

function cancelPendingDisplay() {
    window.clearTimeout(displayTimer);
    displayTimer = null;
}

function showDiscovery() {
    displayTimer = null;
    if (!isEligible()) {
        return;
    }

    returnFocusTarget =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : document.getElementById("themeToggle");
    try {
        dialog.showModal();
    } catch {
        return;
    }
    sessionStorage.setItem(
        SHOWN_SESSION_KEY,
        "true"
    );
    enterButton?.focus();
}

function rememberSuppression() {
    if (dismissedCheckbox?.checked) {
        localStorage.setItem(
            DISMISSED_KEY,
            "true"
        );
    }
}

function closeDiscovery() {
    rememberSuppression();
    if (dialog?.open) {
        dialog.close();
    }
}

function enterNightMode() {
    rememberSuppression();
    localStorage.setItem(DISMISSED_KEY, "true");
    window.WaffleBerryTheme?.applyTheme("dark");
    if (dialog?.open) {
        dialog.close();
    }
}

function restoreFocus() {
    const target =
        returnFocusTarget?.isConnected
            ? returnFocusTarget
            : document.getElementById("themeToggle");
    target?.focus();
    returnFocusTarget = null;
}

function trapFocus(event) {
    if (event.key !== "Tab" || !dialog?.open) {
        return;
    }

    const controls = Array.from(
        dialog.querySelectorAll(
            "button:not([disabled]), input:not([disabled])"
        )
    );
    const first = controls[0];
    const last = controls[controls.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
    } else if (
        !event.shiftKey &&
        document.activeElement === last
    ) {
        event.preventDefault();
        first?.focus();
    }
}

function notifyAuthenticatedContentReady() {
    if (contentIsReady || displayTimer || dialog?.open) {
        return;
    }

    contentIsReady = true;
    if (!isEligible()) {
        return;
    }

    displayTimer = window.setTimeout(
        showDiscovery,
        DISPLAY_DELAY_MS
    );
}

closeButton?.addEventListener("click", closeDiscovery);
laterButton?.addEventListener("click", closeDiscovery);
enterButton?.addEventListener("click", enterNightMode);
dialog?.addEventListener("close", restoreFocus);
dialog?.addEventListener("keydown", trapFocus);
dialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDiscovery();
});

document.addEventListener(
    "waffleberry:themechange",
    (event) => {
        if (event.detail?.theme === "dark") {
            cancelPendingDisplay();
        }
    }
);
document.addEventListener(
    "waffleberry:signout",
    () => {
        isSigningOut = true;
        cancelPendingDisplay();
        if (dialog?.open) {
            dialog.close();
        }
    }
);
window.addEventListener("pagehide", () => {
    isUnloading = true;
    cancelPendingDisplay();
});

window.WaffleBerryNightModeDiscovery =
    Object.freeze({
        notifyAuthenticatedContentReady
    });

if (
    document.body.hasAttribute(
        "data-night-mode-discovery-auto"
    )
) {
    window.authReady
        .then(() => {
            if (
                window.WaffleBerryApi
                    ?.getStoredAccessToken()
            ) {
                notifyAuthenticatedContentReady();
            }
        })
        .catch(() => {});
}
})();
