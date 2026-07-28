"use strict";

(function initializeWaffleBerryApi() {
const API_BASE_URL =
    "http://127.0.0.1:8000/api/v1";

const STORAGE_KEYS = Object.freeze({
    ACCESS_TOKEN: "accessToken",
    CURRENT_USER: "currentUser",
    ACTIVE_CONVERSATION_ID:
        "activeConversationId"
});


class ApiError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = "ApiError";
        this.status = options.status || 0;
        this.kind = options.kind || "unknown";
        this.details = options.details || null;
    }
}


function getStoredAccessToken() {
    return localStorage.getItem(
        STORAGE_KEYS.ACCESS_TOKEN
    );
}


function getStoredUser() {
    try {
        const storedUser =
            localStorage.getItem(
                STORAGE_KEYS.CURRENT_USER
            );

        return storedUser
            ? JSON.parse(storedUser)
            : null;
    } catch {
        return null;
    }
}


function storeSession(accessToken, currentUser) {
    localStorage.setItem(
        STORAGE_KEYS.ACCESS_TOKEN,
        accessToken
    );

    localStorage.setItem(
        STORAGE_KEYS.CURRENT_USER,
        JSON.stringify(currentUser)
    );
}


function clearStoredSession() {
    localStorage.removeItem(
        STORAGE_KEYS.ACCESS_TOKEN
    );
    localStorage.removeItem(
        STORAGE_KEYS.CURRENT_USER
    );
    localStorage.removeItem(
        STORAGE_KEYS.ACTIVE_CONVERSATION_ID
    );
}


function getValidationMessage(details) {
    if (!Array.isArray(details)) {
        return "Please check the information you entered.";
    }

    const messages = details
        .map((item) => item?.msg)
        .filter(Boolean);

    return messages.length
        ? messages.join(" ")
        : "Please check the information you entered.";
}


function getApiErrorMessage(status, data) {
    if (status === 401) {
        return "Your session has expired. Please sign in again.";
    }

    if (status === 404) {
        return data?.detail || "The requested item was not found.";
    }

    if (status === 422) {
        return getValidationMessage(data?.detail);
    }

    if (status >= 500) {
        return "The server could not complete the request. Please try again.";
    }

    if (typeof data?.detail === "string") {
        return data.detail;
    }

    return "The request could not be completed.";
}


function getErrorKind(status) {
    if (status === 401) {
        return "authentication";
    }

    if (status === 404) {
        return "not-found";
    }

    if (status === 422) {
        return "validation";
    }

    if (status >= 500) {
        return "server";
    }

    return "request";
}


async function parseResponse(response) {
    if (response.status === 204) {
        return null;
    }

    const responseText =
        await response.text();

    if (!responseText) {
        return null;
    }

    try {
        return JSON.parse(responseText);
    } catch {
        return null;
    }
}


async function apiRequest(path, options = {}) {
    const {
        method = "GET",
        body,
        authenticated = true
    } = options;

    const headers = {
        "Content-Type": "application/json"
    };

    if (authenticated) {
        const accessToken =
            getStoredAccessToken();

        if (!accessToken) {
            throw new ApiError(
                "Please sign in to continue.",
                {
                    status: 401,
                    kind: "authentication"
                }
            );
        }

        headers.Authorization =
            `Bearer ${accessToken}`;
    }

    let response;

    try {
        response = await fetch(
            `${API_BASE_URL}${path}`,
            {
                method,
                headers,
                body:
                    body === undefined
                        ? undefined
                        : JSON.stringify(body)
            }
        );
    } catch {
        throw new ApiError(
            "Unable to reach the Waffle Berry server. Please try again.",
            { kind: "network" }
        );
    }

    const data =
        await parseResponse(response);

    if (!response.ok) {
        throw new ApiError(
            getApiErrorMessage(
                response.status,
                data
            ),
            {
                status: response.status,
                kind: getErrorKind(
                    response.status
                ),
                details: data
            }
        );
    }

    return data;
}


window.WaffleBerryApi = Object.freeze({
    API_BASE_URL,
    STORAGE_KEYS,
    ApiError,
    apiRequest,
    clearStoredSession,
    getStoredAccessToken,
    getStoredUser,
    storeSession
});
})();
