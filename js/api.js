"use strict";

(function initializeWaffleBerryApi() {
const API_BASE_URL = (
    window.WAFFLEBERRY_API_BASE_URL ||
    (!window.location ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
        ? "http://127.0.0.1:8000/api/v1"
        : "")
).replace(/\/+$/, "");

if (!API_BASE_URL) {
    throw new Error(
        "WaffleBerry API URL is not configured. Set " +
        "window.WAFFLEBERRY_API_BASE_URL in js/config.js."
    );
}

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
        return typeof data?.detail === "string"
            ? data.detail
            : "The requested item was not found.";
    }

    if (status === 422) {
        return getValidationMessage(data?.detail);
    }

    if (
        typeof data?.detail?.message ===
        "string"
    ) {
        return data.detail.message;
    }

    if (typeof data?.detail === "string") {
        return data.detail;
    }

    return "The request could not be completed.";
}


function getErrorKind(status, data) {
    if (
        typeof data?.detail?.code ===
        "string"
    ) {
        return data.detail.code;
    }

    if (status === 401) {
        return "authentication";
    }

    if (status === 404) {
        return "not-found";
    }

    if (status === 429) {
        return "rate-limit";
    }

    if (status === 422) {
        return "validation";
    }

    if (status >= 500) {
        return "server";
    }

    return "request";
}


function getFriendlyChatError(error) {
    if (
        error instanceof ApiError &&
        error.status === 401
    ) {
        return "Your session has expired. Please sign in again.";
    }

    if (
        error instanceof ApiError &&
        (error.kind === "network" ||
            error.kind === "connection_error")
    ) {
        return "I couldn’t reach the server. Please check your connection and try again.";
    }

    if (
        error instanceof ApiError &&
        error.kind === "quota_exceeded"
    ) {
        return "Berry is temporarily unavailable because the AI usage balance has been exhausted.";
    }

    if (
        error instanceof ApiError &&
        (error.kind === "rate_limited" ||
            error.kind === "rate-limit")
    ) {
        return "Berry is receiving too many requests right now. Please try again shortly.";
    }

    if (
        error instanceof ApiError &&
        error.kind === "timeout"
    ) {
        return "Berry took too long to respond. Please try again.";
    }

    if (
        error instanceof ApiError &&
        error.kind === "provider_unavailable"
    ) {
        return "Berry’s AI service is temporarily unavailable. Please try again shortly.";
    }

    if (
        error instanceof ApiError &&
        (error.kind === "aborted" ||
            error.kind === "stream_interrupted" ||
            error.kind === "invalid_response" ||
            error.kind === "stream")
    ) {
        return "Berry’s response was interrupted. Please try again.";
    }

    return "I couldn’t generate a response just now. Please try again.";
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
        authenticated = true,
        signal
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
                        : JSON.stringify(body),
                signal
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
                    response.status,
                    data
                ),
                details: data
            }
        );
    }

    return data;
}


function audioFilename(blob) {
    const contentType = String(
        blob?.type || ""
    ).split(";", 1)[0].toLowerCase();
    const extensions = {
        "audio/webm": "webm",
        "audio/mp4": "mp4",
        "audio/ogg": "ogg",
        "audio/wav": "wav",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/x-m4a": "m4a",
        "audio/m4a": "m4a",
        "audio/flac": "flac"
    };
    return `voice-message.${
        extensions[contentType] || "audio"
    }`;
}


async function transcribeAudio(
    blob,
    filename = audioFilename(blob),
    { signal } = {}
) {
    if (
        !(blob instanceof Blob) ||
        blob.size === 0
    ) {
        throw new ApiError(
            "The recording is empty.",
            {
                status: 422,
                kind: "audio_empty"
            }
        );
    }

    const accessToken =
        getStoredAccessToken();

    if (!accessToken) {
        throw new ApiError(
            "Your session has expired. Please sign in again.",
            {
                status: 401,
                kind: "authentication"
            }
        );
    }

    const formData = new FormData();
    formData.append(
        "file",
        blob,
        filename
    );

    let response;
    try {
        response = await fetch(
            `${API_BASE_URL}/audio/transcribe`,
            {
                method: "POST",
                headers: {
                    Authorization:
                        `Bearer ${accessToken}`
                },
                body: formData,
                signal
            }
        );
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new ApiError(
                "Transcription was cancelled.",
                { kind: "aborted" }
            );
        }
        throw new ApiError(
            "Unable to reach the Waffle Berry server. Please try again.",
            { kind: "network" }
        );
    }

    const data = await parseResponse(response);
    if (!response.ok) {
        throw new ApiError(
            getApiErrorMessage(
                response.status,
                data
            ),
            {
                status: response.status,
                kind: getErrorKind(
                    response.status,
                    data
                ),
                details: data
            }
        );
    }

    if (
        typeof data?.text !== "string" ||
        !data.text.trim()
    ) {
        throw new ApiError(
            "The recording could not be transcribed. Please try again.",
            { kind: "transcription_failed" }
        );
    }

    return { text: data.text.trim() };
}


async function getMessageSpeech(
    conversationId,
    messageId,
    {
        voice = null,
        responseFormat = "mp3",
        signal
    } = {}
) {
    const normalizedConversationId =
        Number(conversationId);
    const normalizedMessageId = Number(messageId);
    if (
        !Number.isInteger(normalizedConversationId) ||
        !Number.isInteger(normalizedMessageId)
    ) {
        throw new ApiError(
            "This message is not available for speech.",
            { kind: "message_not_found" }
        );
    }

    const accessToken = getStoredAccessToken();
    if (!accessToken) {
        throw new ApiError(
            "Your session has expired. Please sign in again.",
            { status: 401, kind: "authentication" }
        );
    }

    let response;
    try {
        response = await fetch(
            `${API_BASE_URL}/conversations/${normalizedConversationId}/messages/${normalizedMessageId}/speech`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    voice,
                    response_format: responseFormat
                }),
                signal
            }
        );
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new ApiError(
                "Speech generation was cancelled.",
                { kind: "aborted" }
            );
        }
        throw new ApiError(
            "Unable to reach the Waffle Berry server. Please try again.",
            { kind: "network" }
        );
    }

    if (!response.ok) {
        const data = await parseResponse(response);
        throw new ApiError(
            getApiErrorMessage(response.status, data),
            {
                status: response.status,
                kind: getErrorKind(response.status, data),
                details: data
            }
        );
    }

    const blob = await response.blob();
    if (!(blob instanceof Blob) || blob.size === 0) {
        throw new ApiError(
            "Berry's voice could not be generated. Please try again.",
            { kind: "speech_generation_failed" }
        );
    }
    return blob;
}


function supportsResponseStreaming() {
    return (
        typeof window.ReadableStream ===
            "function" &&
        typeof window.TextDecoder ===
            "function" &&
        typeof window.AbortController ===
            "function" &&
        typeof window.Response === "function" &&
        "body" in window.Response.prototype
    );
}


function parseSseFrame(frame) {
    let event = "message";
    const dataLines = [];

    frame.split(/\r?\n/).forEach((line) => {
        if (!line || line.startsWith(":")) {
            return;
        }

        const separator = line.indexOf(":");
        const field =
            separator === -1
                ? line
                : line.slice(0, separator);
        let value =
            separator === -1
                ? ""
                : line.slice(separator + 1);

        if (value.startsWith(" ")) {
            value = value.slice(1);
        }

        if (field === "event") {
            event = value;
        } else if (field === "data") {
            dataLines.push(value);
        }
    });

    if (!dataLines.length) {
        return null;
    }

    try {
        return {
            event,
            data: JSON.parse(
                dataLines.join("\n")
            )
        };
    } catch {
        throw new ApiError(
            "The response stream contained invalid data.",
            { kind: "stream" }
        );
    }
}


async function streamSseRequest(
    path,
    body,
    options = {}
) {
    const {
        signal,
        onEvent = () => {}
    } = options;
    const accessToken = getStoredAccessToken();

    if (!accessToken) {
        throw new ApiError(
            "Please sign in to continue.",
            {
                status: 401,
                kind: "authentication"
            }
        );
    }

    let response;

    try {
        response = await fetch(
            `${API_BASE_URL}${path}`,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json",
                    Accept: "text/event-stream",
                    Authorization:
                        `Bearer ${accessToken}`
                },
                body: JSON.stringify(body),
                signal
            }
        );
    } catch (error) {
        if (
            error?.name === "AbortError" ||
            signal?.aborted
        ) {
            throw new ApiError(
                "The response stream was interrupted.",
                { kind: "aborted" }
            );
        }

        throw new ApiError(
            "Unable to reach the Waffle Berry server. Please try again.",
            { kind: "network" }
        );
    }

    if (!response.ok) {
        const data = await parseResponse(response);
        throw new ApiError(
            getApiErrorMessage(
                response.status,
                data
            ),
            {
                status: response.status,
                kind: getErrorKind(
                    response.status,
                    data
                ),
                details: data
            }
        );
    }

    if (!response.body) {
        throw new ApiError(
            "Streaming is unavailable in this browser.",
            { kind: "stream" }
        );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;

    async function emitFrames(final = false) {
        let boundary =
            buffer.match(/\r?\n\r?\n/);

        while (boundary) {
            const frame = buffer.slice(
                0,
                boundary.index
            );
            buffer = buffer.slice(
                boundary.index +
                    boundary[0].length
            );

            const parsed = parseSseFrame(
                frame
            );
            if (parsed) {
                await onEvent(parsed);
            }

            boundary =
                buffer.match(/\r?\n\r?\n/);
        }

        if (final && buffer.trim()) {
            const parsed = parseSseFrame(
                buffer
            );
            buffer = "";

            if (parsed) {
                await onEvent(parsed);
            }
        }
    }

    try {
        while (true) {
            const { value, done } =
                await reader.read();

            if (done) {
                buffer += decoder.decode();
                await emitFrames(true);
                finished = true;
                break;
            }

            buffer += decoder.decode(
                value,
                { stream: true }
            );
            await emitFrames();
        }
    } finally {
        if (!finished) {
            try {
                await reader.cancel();
            } catch {
                // The stream may already be closed or aborted.
            }
        }
        reader.releaseLock();
    }
}

function streamChatMessage(
    conversationId,
    content,
    options = {}
) {
    return streamSseRequest(
        `/conversations/${conversationId}/messages/stream`,
        { content },
        options
    );
}


function streamStoryGuide(
    context,
    options = {}
) {
    return streamSseRequest(
        "/stories/stream",
        context,
        options
    );
}

function synchronizeLegacy(legacy) {
    return apiRequest(
        "/legacies",
        { method: "POST", body: legacy }
    );
}

function listOwnedLegacies() {
    return apiRequest("/legacies");
}

function listOwnedLegaciesByStatus(status = "active") {
    return apiRequest(
        `/legacies?status=${encodeURIComponent(status)}`
    );
}

function archiveLegacy(legacyId) {
    return apiRequest(
        `/legacies/${encodeURIComponent(legacyId)}/archive`,
        { method: "POST" }
    );
}

function restoreLegacy(legacyId) {
    return apiRequest(
        `/legacies/${encodeURIComponent(legacyId)}/restore`,
        { method: "POST" }
    );
}

function deleteLegacy(legacyId, confirmationText) {
    return apiRequest(
        `/legacies/${encodeURIComponent(legacyId)}`,
        {
            method: "DELETE",
            body: {
                confirmation_text: confirmationText
            }
        }
    );
}

async function exportLegacy(legacyId) {
    const accessToken = getStoredAccessToken();
    if (!accessToken) {
        throw new ApiError(
            "Please sign in to continue.",
            { status: 401, kind: "authentication" }
        );
    }
    let response;
    try {
        response = await fetch(
            `${API_BASE_URL}/legacies/${encodeURIComponent(legacyId)}/export`,
            {
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );
    } catch {
        throw new ApiError(
            "Unable to reach the Waffle Berry server. Please try again.",
            { kind: "network" }
        );
    }
    if (!response.ok) {
        const data = await parseResponse(response);
        throw new ApiError(
            getApiErrorMessage(response.status, data),
            {
                status: response.status,
                kind: getErrorKind(response.status, data),
                details: data
            }
        );
    }
    const disposition = response.headers.get("Content-Disposition") || "";
    const filenameMatch = disposition.match(/filename="([^"\\/]+)"/i);
    return {
        blob: await response.blob(),
        filename: filenameMatch?.[1] || "waffleberry-legacy-export.json"
    };
}

function getOwnedLegacy(legacyId) {
    return apiRequest(
        `/legacies/${encodeURIComponent(legacyId)}`
    );
}

function updateLegacySettings(legacyId, changes) {
    return apiRequest(
        `/legacies/${encodeURIComponent(legacyId)}`,
        { method: "PATCH", body: changes }
    );
}

function getLegacyDashboard(legacyId) {
    return apiRequest(
        `/legacies/${encodeURIComponent(legacyId)}/dashboard`
    );
}

function createStorySession(legacyId, chapter) {
    return apiRequest(
        `/legacies/${encodeURIComponent(legacyId)}/story-sessions`,
        { method: "POST", body: chapter }
    );
}

function listStorySessions(legacyId) {
    return apiRequest(
        `/legacies/${encodeURIComponent(legacyId)}/story-sessions`
    );
}

function streamPersistedStory(
    legacyId,
    storySessionId,
    payload,
    options = {}
) {
    return streamSseRequest(
        `/legacies/${encodeURIComponent(legacyId)}/story-sessions/${encodeURIComponent(storySessionId)}/messages/stream`,
        payload,
        options
    );
}

function completeStorySession(
    legacyId,
    storySessionId
) {
    return apiRequest(
        `/legacies/${encodeURIComponent(legacyId)}/story-sessions/${encodeURIComponent(storySessionId)}/complete`,
        { method: "POST" }
    );
}

function getStoryExtractionRun(
    legacyId,
    storySessionId,
    runId
) {
    return apiRequest(
        `/legacies/${encodeURIComponent(legacyId)}/story-sessions/${encodeURIComponent(storySessionId)}/extraction-runs/${encodeURIComponent(runId)}`
    );
}

function retryStoryExtraction(
    legacyId,
    storySessionId,
    runId
) {
    return apiRequest(
        `/legacies/${encodeURIComponent(legacyId)}/story-sessions/${encodeURIComponent(storySessionId)}/extraction-runs/${encodeURIComponent(runId)}/retry`,
        { method: "POST" }
    );
}


window.WaffleBerryApi = Object.freeze({
    API_BASE_URL,
    STORAGE_KEYS,
    ApiError,
    apiRequest,
    getFriendlyChatError,
    streamChatMessage,
    streamStoryGuide,
    synchronizeLegacy,
    listOwnedLegacies,
    listOwnedLegaciesByStatus,
    archiveLegacy,
    restoreLegacy,
    deleteLegacy,
    exportLegacy,
    getOwnedLegacy,
    updateLegacySettings,
    getLegacyDashboard,
    createStorySession,
    listStorySessions,
    streamPersistedStory,
    completeStorySession,
    getStoryExtractionRun,
    retryStoryExtraction,
    transcribeAudio,
    getMessageSpeech,
    supportsResponseStreaming,
    clearStoredSession,
    getStoredAccessToken,
    getStoredUser,
    storeSession
});
})();
