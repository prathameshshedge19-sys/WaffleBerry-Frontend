"use strict";

(function initializeAuthentication() {
const {
    STORAGE_KEYS,
    ApiError,
    apiRequest,
    clearStoredSession,
    getStoredAccessToken,
    getStoredUser
} = window.WaffleBerryApi;


function redirectToLogin() {
    window.location.replace("login.html");
}


function redirectToLandingPage() {
    window.location.replace("/");
}


function clearInvalidSession() {
    clearStoredSession();
    redirectToLogin();
}


function showSessionStatus(message) {
    let statusElement =
        document.getElementById(
            "sessionStatusMessage"
        );

    if (!statusElement) {
        statusElement =
            document.createElement("div");
        statusElement.id =
            "sessionStatusMessage";
        statusElement.className =
            "app-status-message error-state";
        statusElement.setAttribute(
            "role",
            "status"
        );

        document.body.appendChild(
            statusElement
        );
    }

    statusElement.textContent = message;
}


async function verifySession() {
    if (!getStoredAccessToken()) {
        clearInvalidSession();
        return null;
    }

    try {
        await apiRequest("/conversations");
        return getStoredUser();
    } catch (error) {
        if (
            error instanceof ApiError &&
            error.status === 401
        ) {
            clearInvalidSession();
            return null;
        }

        showSessionStatus(
            error.message ||
            "Unable to verify your session. Please try again."
        );

        return null;
    }
}


window.authReady = verifySession();
window.currentUserPromise =
    window.authReady.then(() =>
        getStoredUser()
    );


function logout() {
    clearStoredSession();

    const toast =
        document.createElement("div");
    toast.className =
        "logout-success-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute(
        "aria-live",
        "polite"
    );
    toast.textContent =
        "Signed out successfully.";
    document.body.appendChild(toast);

    window.setTimeout(
        redirectToLandingPage,
        1000
    );
}


document.addEventListener(
    "DOMContentLoaded",
    () => {
        const logoutButtons =
            document.querySelectorAll(
                ".logout-button"
            );

        logoutButtons.forEach(
            (logoutButton) => {
                logoutButton.addEventListener(
                    "click",
                    (event) => {
                        event.preventDefault();
                        logout();
                    }
                );
            }
        );
    }
);
})();
