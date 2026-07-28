"use strict";

/* ==================================================
   SESSION HELPERS
================================================== */

function clearInvalidSession() {
    try {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("currentUser");
    } finally {
        window.location.replace("login.html");
    }
}


function showSessionVerificationError() {
    window.alert(
        "Unable to verify your session.\nPlease try again."
    );
}


/* ==================================================
   BACKEND SESSION VERIFICATION
================================================== */

async function verifySession() {
    const accessToken =
        localStorage.getItem("accessToken");

    if (
        typeof accessToken !== "string" ||
        accessToken.trim() === ""
    ) {
        clearInvalidSession();
        return;
    }

    let response;

    try {
        response = await fetch(
            "http://127.0.0.1:8000/api/v1/me",
            {
                method: "GET",
                headers: {
                    Authorization:
                        `Bearer ${accessToken}`
                }
            }
        );
    } catch {
        showSessionVerificationError();
        return;
    }

    if (
        response.status === 401 ||
        response.status === 403
    ) {
        clearInvalidSession();
        return;
    }

    if (!response.ok) {
        showSessionVerificationError();
        return;
    }

    let user;

    try {
        user = await response.json();
    } catch {
        clearInvalidSession();
        return;
    }

    const hasValidUser =
        user !== null &&
        typeof user === "object" &&
        !Array.isArray(user) &&
        Number.isInteger(user.user_id) &&
        typeof user.full_name === "string" &&
        typeof user.email === "string" &&
        typeof user.created_at === "string";

    if (!hasValidUser) {
        clearInvalidSession();
        return;
    }

    try {
        localStorage.setItem(
            "currentUser",
            JSON.stringify(user)
        );
    } catch {
        showSessionVerificationError();
    }

    return user;
}


/* ==================================================
   AUTHENTICATION GUARD
================================================== */

(function guardProtectedPage() {
    let isLocallyAuthenticated = false;

    try {
        const accessToken =
            localStorage.getItem("accessToken");

        const currentUser =
            localStorage.getItem("currentUser");

        const hasAccessToken =
            typeof accessToken === "string" &&
            accessToken.trim() !== "";

        const hasCurrentUser =
            currentUser !== null;

        if (hasAccessToken && hasCurrentUser) {
            JSON.parse(currentUser);
            isLocallyAuthenticated = true;
        }
    } catch {
        isLocallyAuthenticated = false;
    }

    if (!isLocallyAuthenticated) {
        clearInvalidSession();
        return;
    }

    window.currentUserPromise =
        verifySession();
})();


/* ==================================================
   LOGOUT
================================================== */

function logout() {
    try {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("currentUser");
    } finally {
        window.location.replace("login.html");
    }
}


document.addEventListener(
    "DOMContentLoaded",
    () => {
        const logoutButtons =
            document.querySelectorAll(
                ".logout-button"
            );

        logoutButtons.forEach((logoutButton) => {
            logoutButton.addEventListener(
                "click",
                (event) => {
                    event.preventDefault();
                    logout();
                }
            );
        });
    }
);
