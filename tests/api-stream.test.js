"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const storage = new Map([
    ["accessToken", "test-token"]
]);

global.localStorage = {
    getItem(key) {
        return storage.get(key) || null;
    },
    setItem(key, value) {
        storage.set(key, value);
    },
    removeItem(key) {
        storage.delete(key);
    }
};
global.window = {
    AbortController,
    ReadableStream,
    TextDecoder,
    Response
};

const apiSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "api.js"),
    "utf8"
);
vm.runInThisContext(apiSource, {
    filename: "js/api.js"
});

test("detects required browser streaming support", () => {
    assert.equal(
        window.WaffleBerryApi
            .supportsResponseStreaming(),
        true
    );
});

function streamingResponse(chunks) {
    const encoder = new TextEncoder();

    return new Response(
        new ReadableStream({
            start(controller) {
                chunks.forEach((chunk) => {
                    controller.enqueue(
                        encoder.encode(chunk)
                    );
                });
                controller.close();
            }
        }),
        {
            status: 200,
            headers: {
                "Content-Type":
                    "text/event-stream"
            }
        }
    );
}

test("parses an SSE event split across chunks", async () => {
    global.fetch = async () =>
        streamingResponse([
            "event: del",
            "ta\ndata: {\"text\":\"Hel",
            "lo\"}\n\n"
        ]);
    const events = [];

    await window.WaffleBerryApi
        .streamChatMessage(4, "Hi", {
            onEvent(event) {
                events.push(event);
            }
        });

    assert.deepEqual(events, [
        {
            event: "delta",
            data: { text: "Hello" }
        }
    ]);
});

test("parses several SSE events in one chunk", async () => {
    global.fetch = async () =>
        streamingResponse([
            "event: start\ndata: {\"conversation_id\":4}\n\n" +
            "event: delta\ndata: {\"text\":\"Hi\"}\n\n" +
            "event: complete\ndata: {\"message\":{\"message_id\":9}}\n\n"
        ]);
    const eventTypes = [];

    await window.WaffleBerryApi
        .streamChatMessage(4, "Hi", {
            onEvent({ event }) {
                eventTypes.push(event);
            }
        });

    assert.deepEqual(eventTypes, [
        "start",
        "delta",
        "complete"
    ]);
});

test("Story Guide reuses the shared SSE parser", async () => {
    let requestUrl = "";
    let requestBody = null;
    global.fetch = async (url, options) => {
        requestUrl = url;
        requestBody =
            JSON.parse(options.body);
        return streamingResponse([
            "event: delta\ndata: {\"text\":\"Tell me more.\"}\n\n"
        ]);
    };
    const events = [];
    const context = {
        current_chapter: "Childhood",
        relationship: "Father",
        display_name: "Dad",
        history: []
    };

    await window.WaffleBerryApi
        .streamStoryGuide(context, {
            onEvent(event) {
                events.push(event);
            }
        });

    assert.match(
        requestUrl,
        /\/stories\/stream$/
    );
    assert.deepEqual(
        requestBody,
        context
    );
    assert.equal(
        events[0].data.text,
        "Tell me more."
    );
});

test("preserves JSON-encoded newlines and special characters", async () => {
    const text = "Line one\nLine \"two\" ☺";
    global.fetch = async () =>
        streamingResponse([
            `event: delta\ndata: ${JSON.stringify({ text })}\n\n`
        ]);
    const events = [];

    await window.WaffleBerryApi
        .streamChatMessage(4, "Hi", {
            onEvent(event) {
                events.push(event);
            }
        });

    assert.equal(events[0].data.text, text);
});

test("parses the final SSE frame without a trailing blank line", async () => {
    global.fetch = async () =>
        streamingResponse([
            "event: complete\ndata: {\"message\":{\"message_id\":9}}"
        ]);
    const events = [];

    await window.WaffleBerryApi
        .streamChatMessage("4", "Hi", {
            onEvent(event) {
                events.push(event);
            }
        });

    assert.deepEqual(events, [
        {
            event: "complete",
            data: {
                message: { message_id: 9 }
            }
        }
    ]);
});

function responseWithLateReadFailure(chunksBeforeFailure, error) {
    const encoder = new TextEncoder();
    let index = 0;
    return {
        ok: true,
        status: 200,
        body: {
            getReader() {
                return {
                    async read() {
                        if (index < chunksBeforeFailure.length) {
                            return { value: encoder.encode(chunksBeforeFailure[index++]), done: false };
                        }
                        throw error;
                    },
                    async cancel() {},
                    releaseLock() {}
                };
            }
        }
    };
}

test("late stream cleanup cannot revoke terminal Chat success", async () => {
    const lateAbort = Object.assign(new Error("late cleanup"), { name: "AbortError" });
    global.fetch = async () => responseWithLateReadFailure([
        "event: complete\ndata: {\"message\":{\"message_id\":9}}\n\n"
    ], lateAbort);
    const events = [];
    await window.WaffleBerryApi.streamChatMessage(4, "Hi", {
        onEvent(value) { events.push(value); }
    });
    assert.equal(events.at(-1).event, "complete");
    assert.equal(events.at(-1).data.message.message_id, 9);
});

test("premature stream failure remains an interruption", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    global.fetch = async () => responseWithLateReadFailure([
        "event: delta\ndata: {\"text\":\"Partial\"}\n\n"
    ], abort);
    await assert.rejects(
        window.WaffleBerryApi.streamChatMessage(4, "Hi"),
        (error) => error.kind === "aborted"
    );
});

test("intentional cancellation before terminal success remains interrupted", async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    global.fetch = async () => responseWithLateReadFailure([], abort);
    await assert.rejects(
        window.WaffleBerryApi.streamChatMessage(4, "Hi", { signal: controller.signal }),
        (error) => error.kind === "aborted"
    );
});

test("Chat owns terminal success before late UI cleanup", () => {
    const chat = fs.readFileSync(path.join(__dirname, "..", "js", "chat.js"), "utf8");
    assert.match(chat, /eventType === "complete"[\s\S]*?streamCompleted = true;[\s\S]*?finalizeStreamingMessage/);
    assert.match(chat, /catch \(error\)[\s\S]*?if \(streamCompleted\) \{[\s\S]*?return;/);
});

test("maps structured non-streaming AI errors to safe categories", async () => {
    global.fetch = async () =>
        new Response(
            JSON.stringify({
                detail: {
                    code: "quota_exceeded",
                    message: "Safe quota message."
                }
            }),
            {
                status: 429,
                headers: {
                    "Content-Type":
                        "application/json"
                }
            }
        );

    await assert.rejects(
        window.WaffleBerryApi.apiRequest(
            "/conversations/4/messages",
            {
                method: "POST",
                body: { content: "Hi" }
            }
        ),
        (error) => {
            assert.equal(
                error.kind,
                "quota_exceeded"
            );
            assert.equal(
                window.WaffleBerryApi
                    .getFriendlyChatError(
                        error
                    ),
                "WaffleBerry is temporarily unavailable. Please try again later."
            );
            return true;
        }
    );
});

test("maps WaffleBerry Chat quota 429 ahead of provider 429 handling", async () => {
    global.fetch = async () =>
        new Response(JSON.stringify({
            detail: {
                error: "quota_exceeded",
                feature: "chat",
                plan: "free",
                resets_at: "2026-08-22T00:00:00+02:00",
                upgrade_available: false
            }
        }), {
            status: 429,
            headers: { "Content-Type": "application/json" }
        });

    await assert.rejects(
        window.WaffleBerryApi.apiRequest(
            "/conversations/4/messages",
            { method: "POST", body: { content: "Hi" } }
        ),
        (error) => {
            assert.equal(error.kind, "chat_quota_exceeded");
            assert.equal(error.details.detail.feature, "chat");
            assert.equal(error.details.detail.plan, "free");
            return true;
        }
    );
});

test("successful quota-exempt Chat response remains unchanged", async () => {
    const payload = {
        user_message: { message_id: 1, content: "Hi" },
        assistant_message: { message_id: 2, content: "Hello" },
        conversation: { conversation_id: 4 }
    };
    global.fetch = async () => new Response(JSON.stringify(payload), {
        status: 201,
        headers: { "Content-Type": "application/json" }
    });

    assert.deepEqual(
        await window.WaffleBerryApi.apiRequest(
            "/conversations/4/messages",
            { method: "POST", body: { content: "Hi" } }
        ),
        payload
    );
});

test("maps streaming reliability codes consistently", () => {
    const cases = [
        [
            "rate_limited",
            "WaffleBerry is temporarily unavailable. Please try again later."
        ],
        [
            "timeout",
            "Berry took too long to respond. Please try again."
        ],
        [
            "provider_unavailable",
            "WaffleBerry is temporarily unavailable. Please try again later."
        ],
        [
            "stream_interrupted",
            "Berry’s response was interrupted. Please try again."
        ]
    ];

    cases.forEach(([kind, expected]) => {
        const error =
            new window.WaffleBerryApi.ApiError(
                "Ignored backend text",
                { kind }
            );
        assert.equal(
            window.WaffleBerryApi
                .getFriendlyChatError(error),
            expected
        );
    });
});
