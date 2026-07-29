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
