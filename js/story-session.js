"use strict";

(function initializeStorySession() {
const parameters =
    new URLSearchParams(
        window.location.search
    );
const legacyId =
    parameters.get("legacyId");
const chapterId =
    parameters.get("chapter");
const legacy = legacyId
    ? window.WaffleBerryLegacyState
        .select(legacyId)
    : null;
const chapter =
    window.WaffleBerryStoryChapters
        .find((item) =>
            item.id === chapterId
        );

if (!legacy || !chapter) {
    window.location.replace(
        "legacy-dashboard.html"
    );
    return;
}

const storyState =
    window.WaffleBerryGuidedStoriesState;
const api =
    window.WaffleBerryApi;
const title =
    document.getElementById(
        "storySessionTitle"
    );
const progress =
    document.getElementById(
        "storySessionProgress"
    );
const conversation =
    document.getElementById(
        "storyConversation"
    );
const composer =
    document.getElementById(
        "storyComposer"
    );
const reply =
    document.getElementById(
        "storyReply"
    );
const sendButton =
    document.getElementById(
        "sendStoryButton"
    );
const finishButton =
    document.getElementById("finishStoryButton");
const completionStatus =
    document.getElementById("storyCompletionStatus");
const completionMessage =
    document.getElementById("storyCompletionMessage");
const retryExtractionButton =
    document.getElementById("retryExtractionButton");
const reviewMemoriesLink =
    document.getElementById("reviewStoryMemories");

let isStreaming = false;
let requestController = null;
let persistedLegacy = null;
let storySessionId = null;
let extractionRun = null;

function clientMessageId() {
    return globalThis.crypto?.randomUUID?.() ||
        `story-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function ensurePersistedStory() {
    persistedLegacy =
        await window.WaffleBerryLegacyState
            .ensurePersisted(legacy.id);
    if (!persistedLegacy?.backendLegacyId) {
        throw new api.ApiError(
            "This legacy could not be saved.",
            { kind: "persistence" }
        );
    }
    const local =
        storyState.load(legacy.id)[chapter.id];
    if (local?.backendStorySessionId) {
        storySessionId =
            local.backendStorySessionId;
        return;
    }
    const session = await api.createStorySession(
        persistedLegacy.backendLegacyId,
        {
            chapter_key: chapter.id,
            title: chapter.title
        }
    );
    storySessionId = session.story_session_id;
    storyState.setBackendStorySession(
        legacy.id,
        chapter.id,
        storySessionId
    );
}

function appendMessage(
    role,
    content = ""
) {
    const row =
        document.createElement("div");
    const bubble =
        document.createElement("div");
    const text =
        document.createElement("p");

    row.className =
        `message-row ${
            role === "assistant"
                ? "berry-row"
                : "user-row"
        }`;
    bubble.className =
        `message ${
            role === "assistant"
                ? "berry-message"
                : "user-message"
        }`;
    text.textContent = content;

    if (role === "assistant") {
        const avatar =
            document.createElement("img");
        const speaker =
            document.createElement("span");

        avatar.className =
            "message-avatar";
        avatar.src =
            "assets/waffle-berry-mascot.png";
        avatar.alt = "";
        speaker.className =
            "story-message-speaker";
        speaker.textContent = "Berry";
        bubble.append(speaker);
        row.append(avatar);
    }

    bubble.append(text);
    row.append(bubble);
    conversation.append(row);
    conversation.scrollTop =
        conversation.scrollHeight;
    return text;
}


function currentMessages() {
    return (
        storyState.load(
            legacy.id
        )[chapter.id]?.messages || []
    );
}


function updateProgress() {
    const userMessages =
        currentMessages().filter(
            (message) =>
                message.role === "user"
        ).length;
    progress.textContent =
        userMessages
            ? `${userMessages} ${
                userMessages === 1
                    ? "memory"
                    : "memories"
            } shared`
            : "Story beginning";
}


function updateComposer() {
    const hasContent =
        Boolean(reply?.value.trim());
    reply.disabled = isStreaming;
    sendButton.disabled =
        isStreaming || !hasContent;
    composer.setAttribute(
        "aria-busy",
        String(isStreaming)
    );
}


async function requestBerryResponse(
    userContent = null
) {
    if (isStreaming) {
        return;
    }

    isStreaming = true;
    updateComposer();
    requestController =
        new AbortController();
    const streamText =
        appendMessage("assistant");
    let completeText = "";

    try {
        if (!storySessionId) {
            await ensurePersistedStory();
        }
        await api.streamPersistedStory(
            persistedLegacy.backendLegacyId,
            storySessionId,
            {
                content: userContent,
                client_message_id:
                    clientMessageId()
            },
            {
                signal:
                    requestController.signal,
                onEvent({ event, data }) {
                    if (event === "delta") {
                        completeText +=
                            data.text || "";
                        streamText.textContent =
                            completeText;
                        conversation.scrollTop =
                            conversation.scrollHeight;
                    } else if (
                        event === "complete"
                    ) {
                        completeText =
                            data.text ||
                            completeText;
                        streamText.textContent =
                            completeText;
                    } else if (
                        event === "error"
                    ) {
                        throw new api.ApiError(
                            data.message,
                            {
                                kind:
                                    data.code ||
                                    "stream"
                            }
                        );
                    }
                }
            }
        );

        if (!completeText.trim()) {
            throw new api.ApiError(
                "Berry's response was interrupted.",
                { kind: "stream_interrupted" }
            );
        }

        storyState.appendMessage(
            legacy.id,
            chapter.id,
            "assistant",
            completeText
        );
    } catch (error) {
        streamText.closest(
            ".message-row"
        )?.remove();

        if (
            error?.kind !== "aborted"
        ) {
            appendMessage(
                "assistant",
                api.getFriendlyChatError(
                    error
                )
            );
        }
    } finally {
        isStreaming = false;
        requestController = null;
        updateComposer();
        reply?.focus();
    }
}


function chaptersUrl(paused = false) {
    return `guided-stories.html?${
        new URLSearchParams({
            legacyId: legacy.id,
            view: "chapters",
            ...(paused
                ? { paused: "1" }
                : {})
        })
    }`;
}


async function initializePersistedChapter() {
    title.textContent = chapter.title;
    document.title = `${chapter.title} | Waffle Berry`;
    await window.authReady;
    persistedLegacy = await window.WaffleBerryLegacyState
        .ensurePersisted(legacy.id);
    const sessions = await api.listStorySessions(
        persistedLegacy.backendLegacyId
    );
    storyState.replaceFromPersisted(legacy.id, sessions);
    storyState.markInProgress(legacy.id, chapter.id);
    appendMessage("assistant", chapter.introduction);
    currentMessages().forEach((message) =>
        appendMessage(message.role, message.content)
    );
    updateProgress();
    updateComposer();
    await ensurePersistedStory();
    if (!currentMessages().length) {
        await requestBerryResponse();
    }
}

initializePersistedChapter().catch((error) => {
    appendMessage(
        "assistant",
        error.status === 401
            ? "Please sign in again to continue your story."
            : "Your story could not be connected to secure storage. Please try again."
    );
    updateComposer();
});

reply?.addEventListener(
    "input",
    updateComposer
);

composer?.addEventListener(
    "submit",
    (event) => {
        event.preventDefault();
        const content =
            reply.value.trim();

        if (!content || isStreaming) {
            return;
        }

        storyState.appendMessage(
            legacy.id,
            chapter.id,
            "user",
            content
        );
        appendMessage("user", content);
        reply.value = "";
        updateProgress();
        requestBerryResponse(content);
    }
);

document
    .getElementById(
        "pauseStoryButton"
    )
    ?.addEventListener(
        "click",
        () => {
            requestController?.abort();
            window.location.href =
                chaptersUrl(true);
        }
    );

async function refreshExtractionStatus() {
    if (!extractionRun) {
        return;
    }
    const run = await api.getStoryExtractionRun(
        persistedLegacy.backendLegacyId,
        storySessionId,
        extractionRun.extraction_run_id
    );
    extractionRun = run;
    if (run.status === "completed") {
        completionMessage.textContent =
            run.memories_created > 0
                ? "Memories are ready to review."
                : "This story was saved. Berry did not find any new memories requiring review.";
        reviewMemoriesLink.hidden = false;
        retryExtractionButton.hidden = true;
    } else if (run.status === "failed") {
        completionMessage.textContent =
            "The story was saved, but memory preparation could not finish. It can be retried.";
        retryExtractionButton.hidden = false;
    } else {
        completionMessage.textContent =
            "Berry is preparing memories…";
    }
}

finishButton?.addEventListener("click", async () => {
    if (isStreaming) {
        return;
    }
    finishButton.disabled = true;
    completionStatus.hidden = false;
    completionMessage.textContent =
        "Saving your story…";
    try {
        await ensurePersistedStory();
        const result =
            await api.completeStorySession(
                persistedLegacy.backendLegacyId,
                storySessionId
            );
        extractionRun = result.extraction_run;
        storyState.markCompleted(
            legacy.id,
            chapter.id
        );
        completionMessage.textContent =
            "Berry is preparing memories from this story. You can review them shortly.";
        reviewMemoriesLink.href =
            `memory-review.html?${
                new URLSearchParams({
                    legacyId: legacy.id
                })
            }`;
        window.setTimeout(
            () => refreshExtractionStatus()
                .catch(() => {}),
            1200
        );
    } catch (error) {
        completionMessage.textContent =
            error.status === 401
                ? "Please sign in again to finish this story."
                : "The story is saved, but completion could not be confirmed. Please try again.";
    } finally {
        finishButton.disabled = false;
    }
});

retryExtractionButton?.addEventListener("click", async () => {
    if (!extractionRun) {
        return;
    }
    retryExtractionButton.disabled = true;
    try {
        extractionRun =
            await api.retryStoryExtraction(
                persistedLegacy.backendLegacyId,
                storySessionId,
                extractionRun.extraction_run_id
            );
        completionMessage.textContent =
            "Berry is preparing memories…";
        retryExtractionButton.hidden = true;
    } catch {
        completionMessage.textContent =
            "Memory preparation could not be restarted safely. Please try again later.";
    } finally {
        retryExtractionButton.disabled = false;
    }
});

window.addEventListener(
    "pagehide",
    () => requestController?.abort()
);
})();
