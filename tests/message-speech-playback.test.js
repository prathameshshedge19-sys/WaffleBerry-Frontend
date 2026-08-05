"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("chat.html");
const css = read("css/style.css");
const apiSource = read("js/api.js");
const chatSource = read("js/chat.js");

function loadApi(fetchImplementation) {
    const stored = new Map([["accessToken", "test-token"]]);
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
        FormData,
        Blob,
        fetch: fetchImplementation,
        AbortController,
        console
    };
    vm.runInNewContext(apiSource, context);
    return window.WaffleBerryApi;
}

test("persisted message speech is exposed on the browser API namespace", () => {
    const api = loadApi(async () => {
        throw new Error("fetch should not run");
    });

    assert.equal(typeof api.getMessageSpeech, "function");
});

test("message speech posts only IDs and synthesis preferences", async () => {
    let captured;
    const speechBlob = new Blob(["mp3-data"], { type: "audio/mpeg" });
    const api = loadApi(async (url, options) => {
        captured = { url, options };
        return {
            ok: true,
            status: 200,
            blob: async () => speechBlob
        };
    });

    const result = await api.getMessageSpeech(7, 19);

    assert.equal(result, speechBlob);
    assert.equal(
        captured.url,
        "https://api.example.test/api/v1/conversations/7/messages/19/speech"
    );
    assert.equal(captured.options.method, "POST");
    assert.equal(captured.options.headers.Authorization, "Bearer test-token");
    assert.equal(captured.options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(captured.options.body), {
        response_format: "mp3"
    });
    assert.equal("text" in JSON.parse(captured.options.body), false);
    assert.equal("voice" in JSON.parse(captured.options.body), false);
});

test("speaker controls are restricted to persisted Berry messages", () => {
    const createMessage = chatSource.match(
        /function createMessageElement\(message\)[\s\S]*?return element;/
    )?.[0] || "";
    assert.match(createMessage, /message\?\.role === "assistant"/);
    assert.match(createMessage, /attachMessageSpeechControl/);
    assert.match(chatSource, /function attachMessageSpeechControl[\s\S]*Number\.isInteger\(normalizedId\)/);
    assert.match(chatSource, /function finalizeStreamingMessage[\s\S]*attachMessageSpeechControl/);
    assert.doesNotMatch(apiSource, /body:\s*JSON\.stringify\(\{\s*text/);
});

test("playback has accessible state and non-blocking status", () => {
    assert.doesNotMatch(html, /AI-generated|ai-voice-disclosure|voice-playback-meta/);
    assert.doesNotMatch(chatSource, /AI-generated/);
    assert.match(html, /id="messageSpeechStatus"[\s\S]{0,160}aria-live="polite"/);
    assert.match(chatSource, /aria-label/);
    assert.match(chatSource, /aria-pressed/);
    assert.match(chatSource, /"Pause Berry voice"/);
    assert.match(chatSource, /"Resume Berry voice"/);
    assert.match(chatSource, /"Replay Berry voice"/);
    assert.match(css, /\.message-speech-button:focus-visible/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*message-speech-button/);
});

test("playback reuses audio and cleans up requests and object URLs", () => {
    assert.match(chatSource, /messageSpeechState\.cache\.get/);
    assert.match(chatSource, /URL\.createObjectURL/);
    assert.match(chatSource, /URL\.revokeObjectURL/);
    assert.match(chatSource, /phase === "playing"[\s\S]*\.pause\(\)/);
    assert.match(chatSource, /phase === "paused"[\s\S]*\.play\(\)/);
    assert.match(chatSource, /requestController\?\.abort\(\)/);
    assert.match(chatSource, /function selectConversation[\s\S]*stopMessageSpeech/);
    assert.match(chatSource, /function createNewConversationFromControl[\s\S]*stopMessageSpeech/);
    assert.match(chatSource, /"pagehide"[\s\S]*stopMessageSpeech/);
});

test("mobile playback control keeps a touch-sized target without changing streaming", () => {
    assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.chat-page \.message-speech-button[\s\S]*width: 44px;[\s\S]*height: 44px;/);
    assert.match(chatSource, /await streamChatMessage\(/);
    assert.match(chatSource, /transcribeReadyVoiceRecording/);
});

test("frontend contains no voice selection or Legacy relationship inference", () => {
    assert.doesNotMatch(apiSource, /standard_male|standard_female|cedar|marin/);
    assert.doesNotMatch(chatSource, /standard_male|standard_female|cedar|marin/);
    assert.doesNotMatch(chatSource, /relationship.*voice|voice.*relationship/i);
    assert.doesNotMatch(html, /voice-selector|cedar|marin/i);
    assert.doesNotMatch(html, /<(select|input)[^>]*(name|id)="[^"]*voice/i);
});

test("active playback exposes read-only progress and stable premium states", () => {
    assert.match(chatSource, /progress\.className = "message-speech-progress"/);
    assert.match(chatSource, /<progress value="0" max="1" aria-label="Berry voice playback progress">/);
    assert.match(chatSource, /"loadedmetadata"/);
    assert.match(chatSource, /"durationchange"/);
    assert.match(chatSource, /"timeupdate"/);
    assert.match(chatSource, /formatPlaybackTime/);
    assert.match(chatSource, /phase = "finished"/);
    assert.match(css, /\.message-row\.is-speech-active/);
});

test("voice player stays inside its Berry message without visible action text", () => {
    const attachment = chatSource.match(
        /function attachMessageSpeechControl[\s\S]*?updateMessageSpeechControls\(\);\n}/
    )?.[0] || "";
    assert.match(attachment, /row\.querySelector\(\s*"\.berry-message"/);
    assert.match(attachment, /bubble\.appendChild\(actions\)/);
    assert.doesNotMatch(attachment, /row\.appendChild\(actions\)/);
    assert.match(css, /\.message-speech-button-label\s*\{[\s\S]*position:\s*absolute;[\s\S]*clip:/);
    assert.doesNotMatch(css, /has-speech-control \.message\s*\{/);
    assert.match(css, /\.message-speech-actions\s*\{[\s\S]*width:\s*min\(100%, 240px\)/);
});

test("audio event listeners are explicitly removed during cleanup", () => {
    assert.match(chatSource, /audioCleanup/);
    for (const event of ["loadedmetadata", "durationchange", "timeupdate", "ended", "error"]) {
        assert.match(chatSource, new RegExp(`removeEventListener\\("${event}"`));
    }
});
