"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("chat.html");
const apiSource = read("js/api.js");
const chatSource = read("js/chat.js");

function loadApi(fetchImplementation) {
    const stored = new Map([["accessToken", "test-token"]]);
    class TestFormData {
        constructor() {
            this.entries = [];
        }

        append(...entry) {
            this.entries.push(entry);
        }
    }

    const window = {
        WAFFLEBERRY_API_BASE_URL: "https://api.example.test/api/v1",
        location: { hostname: "waffleberry.app" },
        ReadableStream,
        TextDecoder,
        AbortController
    };
    const context = {
        window,
        localStorage: {
            getItem: (key) => stored.get(key) || null,
            setItem: (key, value) => stored.set(key, value),
            removeItem: (key) => stored.delete(key)
        },
        FormData: TestFormData,
        Blob,
        fetch: fetchImplementation,
        AbortController,
        console
    };
    vm.runInNewContext(apiSource, context);
    return { api: window.WaffleBerryApi, TestFormData };
}

test("transcribeAudio is exposed on the browser API namespace", () => {
    const { api } = loadApi(async () => {
        throw new Error("fetch should not run");
    });

    assert.equal(typeof api.transcribeAudio, "function");
});

test("empty audio is rejected before any request is sent", async () => {
    let requestCount = 0;
    const { api } = loadApi(async () => {
        requestCount += 1;
    });

    await assert.rejects(
        api.transcribeAudio(new Blob([], { type: "audio/webm" })),
        (error) =>
            error.status === 422 &&
            error.kind === "audio_empty"
    );
    assert.equal(requestCount, 0);
});

test("ready preview exposes an accessible explicit Transcribe action", () => {
    assert.match(html, /id="voiceRecordingPreview"[\s\S]*id="voiceTranscribeButton"/);
    assert.match(html, /id="voiceTranscribeButton"[\s\S]{0,160}type="button"|type="button"[\s\S]{0,160}id="voiceTranscribeButton"/);
    assert.match(html, /id="voiceTranscriptionStatus"[\s\S]*aria-live="polite"/);
    assert.match(chatSource, /voiceTranscribeButton\.disabled\s*=[\s\S]*phase !== "ready"/);
});

test("audio client posts authenticated multipart without a manual content type", async () => {
    let captured;
    const { api, TestFormData } = loadApi(async (url, options) => {
        captured = { url, options };
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ text: "Hello world" })
        };
    });
    const blob = new Blob(["audio"], { type: "audio/webm;codecs=opus" });

    const result = await api.transcribeAudio(blob);

    assert.equal(result.text, "Hello world");
    assert.equal(captured.url, "https://api.example.test/api/v1/audio/transcribe");
    assert.equal(captured.options.method, "POST");
    assert.equal(captured.options.headers.Authorization, "Bearer test-token");
    assert.equal(captured.options.headers["Content-Type"], undefined);
    assert.ok(captured.options.body instanceof TestFormData);
    assert.deepEqual(captured.options.body.entries[0].slice(0, 2), ["file", blob]);
    assert.equal(captured.options.body.entries[0][2], "voice-message.webm");
});

test("transcript appends deterministically, stays editable, and is not auto-sent", () => {
    assert.match(chatSource, /const existingText =\s*chatInput\?\.value\.trimEnd\(\) \|\| ""/);
    assert.match(chatSource, /`\$\{existingText\}\\n\\n\$\{transcript\}`/);
    assert.match(chatSource, /chatInput\.focus\(\)/);
    const handler = chatSource.match(/async function transcribeReadyVoiceRecording\(\)[\s\S]*?\/\* End Phase 9\.1/)?.[0] || "";
    assert.doesNotMatch(handler, /sendMessage\(|chatForm\.requestSubmit|streamChatMessage/);
});

test("failed requests retain preview and expose retry", () => {
    const handler = chatSource.match(/async function transcribeReadyVoiceRecording\(\)[\s\S]*?\/\* End Phase 9\.1/)?.[0] || "";
    assert.match(handler, /transcriptionPhase =\s*"error"/);
    assert.match(chatSource, /phase === "error"[\s\S]*"Retry transcription"/);
    const failureBranch = handler.match(/\} catch \(error\) \{[\s\S]*?\} finally \{/)?.[0] || "";
    assert.doesNotMatch(failureBranch, /revokeVoiceObjectUrl|deleteVoiceRecording/);
});

test("duplicate and stale transcription results are guarded and cancelled", () => {
    assert.match(chatSource, /\["processing", "completed"\]\.includes/);
    assert.match(chatSource, /transcriptionRequestId/);
    assert.match(chatSource, /new AbortController\(\)/);
    assert.match(chatSource, /blob !== voiceRecorderState\.blob/);
    assert.match(chatSource, /contextId !==\s*state\.activeConversationId/);
    assert.match(chatSource, /function selectConversation[\s\S]*discardVoiceRecording\(\)/);
    assert.match(chatSource, /function createNewConversationFromControl[\s\S]*discardVoiceRecording\(\)/);
    assert.match(chatSource, /\.logout-button[\s\S]*discardVoiceRecording\(\)/);
    assert.match(chatSource, /"pagehide"[\s\S]*discardVoiceRecording\(\)/);
});

test("text streaming, runtime API configuration, and mobile drawer remain intact", () => {
    assert.match(chatSource, /await streamChatMessage\(/);
    assert.match(apiSource, /window\.WAFFLEBERRY_API_BASE_URL/);
    assert.match(chatSource, /openConversationDrawer/);
    assert.match(chatSource, /conversationDrawerBackdrop\?\.addEventListener/);
});
