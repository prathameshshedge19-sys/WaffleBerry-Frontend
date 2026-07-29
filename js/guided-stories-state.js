"use strict";

(function initializeGuidedStoriesState() {
const STORAGE_KEY =
    "waffleBerryGuidedStories";
const VALID_STATUSES =
    new Set([
        "in-progress",
        "completed"
    ]);


function key(legacyId) {
    const userId =
        window.WaffleBerryApi
            ?.getStoredUser?.()
            ?.user_id;
    const userSuffix =
        userId === undefined ||
        userId === null
            ? ""
            : `:${userId}`;

    return `${STORAGE_KEY}${userSuffix}:${
        legacyId
    }`;
}


function load(legacyId) {
    if (!legacyId) {
        return {};
    }

    try {
        const parsed = JSON.parse(
            sessionStorage.getItem(
                key(legacyId)
            ) || "{}"
        );

        if (
            !parsed ||
            typeof parsed !== "object" ||
            Array.isArray(parsed)
        ) {
            return {};
        }

        return Object.fromEntries(
            Object.entries(parsed)
                .filter(([, chapter]) =>
                    chapter &&
                    VALID_STATUSES.has(
                        chapter.status
                    )
                )
                .map(([chapterId, chapter]) => [
                    chapterId,
                    {
                        status:
                            chapter.status,
                        text:
                            typeof chapter.text ===
                                "string"
                                ? chapter.text
                                : "",
                        replies:
                            Array.isArray(
                                chapter.replies
                            )
                                ? chapter.replies
                                    .filter(
                                        (reply) =>
                                            typeof reply ===
                                                "string" &&
                                            reply.trim()
                                    )
                                    .map(
                                        (reply) =>
                                            reply.trim()
                                    )
                                : (
                                    typeof chapter.text ===
                                        "string" &&
                                    chapter.text.trim()
                                        ? [
                                            chapter.text.trim()
                                        ]
                                        : []
                                )
                        ,
                        messages:
                            Array.isArray(
                                chapter.messages
                            )
                                ? chapter.messages
                                    .filter(
                                        (message) =>
                                            ["user", "assistant"]
                                                .includes(
                                                    message?.role
                                                ) &&
                                            typeof message.content ===
                                                "string" &&
                                            message.content.trim()
                                    )
                                    .map((message) => ({
                                        role: message.role,
                                        content:
                                            message.content.trim()
                                    }))
                                : [],
                        ...(
                            Number.isInteger(
                                Number(chapter.backendStorySessionId)
                            ) &&
                            Number(chapter.backendStorySessionId) > 0
                                ? {
                                    backendStorySessionId:
                                        Number(chapter.backendStorySessionId)
                                }
                                : {}
                        )
                    }
                ])
        );
    } catch {
        return {};
    }
}


function store(legacyId, state) {
    sessionStorage.setItem(
        key(legacyId),
        JSON.stringify(state)
    );
}


function markInProgress(
    legacyId,
    chapterId
) {
    const state = load(legacyId);

    if (!state[chapterId]) {
        state[chapterId] = {
            status: "in-progress",
            text: "",
            replies: [],
            messages: []
        };
        store(legacyId, state);
    }

    return state[chapterId];
}


function save(
    legacyId,
    chapterId,
    text
) {
    const content =
        typeof text === "string"
            ? text.trim()
            : "";
    const state = load(legacyId);

    state[chapterId] = {
        status: content
            ? "completed"
            : "in-progress",
        text: content,
        replies: content
            ? [content]
            : [],
        messages: [],
        ...(state[chapterId]?.backendStorySessionId
            ? {
                backendStorySessionId:
                    state[chapterId].backendStorySessionId
            }
            : {})
    };
    store(legacyId, state);
    return state[chapterId];
}

function addReply(
    legacyId,
    chapterId,
    text,
    promptCount
) {
    const content =
        typeof text === "string"
            ? text.trim()
            : "";
    const state = load(legacyId);
    const replies = [
        ...(state[chapterId]?.replies || [])
    ];

    if (content) {
        replies.push(content);
    }

    state[chapterId] = {
        status:
            replies.length >= promptCount
                ? "completed"
                : "in-progress",
        text: replies.at(-1) || "",
        replies
        ,
        messages:
            state[chapterId]?.messages || [],
        ...(state[chapterId]?.backendStorySessionId
            ? {
                backendStorySessionId:
                    state[chapterId].backendStorySessionId
            }
            : {})
    };
    store(legacyId, state);
    return state[chapterId];
}

function appendMessage(
    legacyId,
    chapterId,
    role,
    content
) {
    if (
        !["user", "assistant"].includes(role) ||
        typeof content !== "string" ||
        !content.trim()
    ) {
        return null;
    }

    const state = load(legacyId);
    const current = state[chapterId] || {
        status: "in-progress",
        text: "",
        replies: [],
        messages: []
    };
    current.status =
        current.status === "completed"
            ? "completed"
            : "in-progress";
    current.messages.push({
        role,
        content: content.trim()
    });
    state[chapterId] = current;
    store(legacyId, state);
    return current;
}

function setBackendStorySession(
    legacyId,
    chapterId,
    storySessionId
) {
    const current = markInProgress(
        legacyId,
        chapterId
    );
    const state = load(legacyId);
    state[chapterId] = {
        ...current,
        backendStorySessionId:
            Number(storySessionId)
    };
    store(legacyId, state);
    return state[chapterId];
}

function markCompleted(legacyId, chapterId) {
    const state = load(legacyId);
    if (!state[chapterId]) {
        return null;
    }
    state[chapterId].status = "completed";
    store(legacyId, state);
    return state[chapterId];
}


function hasProgress(legacyId) {
    return (
        Object.keys(
            load(legacyId)
        ).length > 0
    );
}


window.WaffleBerryGuidedStoriesState =
    Object.freeze({
        hasProgress,
        load,
        markInProgress,
        markCompleted,
        setBackendStorySession,
        addReply,
        appendMessage,
        save
    });
})();
