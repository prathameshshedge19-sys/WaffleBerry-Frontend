"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const apiSource = fs.readFileSync(path.join(root, "js", "api.js"), "utf8");
const chatSource = fs.readFileSync(path.join(root, "js", "chat.js"), "utf8");
const html = fs.readFileSync(path.join(root, "chat.html"), "utf8");
const modalSource = fs.readFileSync(path.join(root, "js", "quota-modal.js"), "utf8");

function loadApi(fetchImplementation) {
    const window = { WAFFLEBERRY_API_BASE_URL: "https://api.test/api/v1",
        location: { hostname: "test" }, ReadableStream, TextDecoder, AbortController };
    const context = { window, fetch: fetchImplementation, Blob, FormData, AbortController,
        console, localStorage: { getItem: () => "token", setItem() {}, removeItem() {} } };
    vm.runInNewContext(apiSource, context);
    return window.WaffleBerryApi;
}

test("voice_play quota 429 keeps structured feature-specific classification", async () => {
    const api = loadApi(async () => ({ ok: false, status: 429,
        text: async () => JSON.stringify({ detail: { error: "quota_exceeded",
            feature: "voice_play", plan: "free", resets_at: "2026-08-22T00:00:00Z" } }) }));
    await assert.rejects(api.getMessageSpeech(1, 2), (error) => {
        assert.equal(error.kind, "voice_play_quota_exceeded");
        assert.equal(error.details.detail.feature, "voice_play");
        return true;
    });
});

test("voice quota modal has reset copy, plans, and Keep using Free", () => {
    assert.match(html, /id="voiceQuotaDialog"[\s\S]*aria-modal="true"/);
    assert.match(html, /id="voiceQuotaDialog"[\s\S]*href="plans\.html">View plans/);
    assert.match(html, /id="voiceQuotaKeepFree"[\s\S]*Keep using Free/);
    assert.match(chatSource, /Berry voice limit on your \$\{plan\} plan/);
    assert.match(chatSource, /dailyAvailability\(detail\?\.resets_at\)/);
});

test("voice quota blocks only playback and never mutates Chat messages", () => {
    const branch = chatSource.slice(chatSource.indexOf('error?.kind === "voice_play_quota_exceeded"'),
        chatSource.indexOf('messageSpeechState.phase = "error"',
            chatSource.indexOf('error?.kind === "voice_play_quota_exceeded"')));
    assert.match(branch, /showVoiceQuotaDialog\(error\)/);
    assert.doesNotMatch(branch, /remove\(|chatMessages|appendInlineError|AI unavailable/);
});

test("cached replay bypasses backend generation and therefore quota", () => {
    assert.match(chatSource, /const cached =[\s\S]*messageSpeechState\.cache\.get/);
    assert.match(chatSource, /if \(!entry\)[\s\S]*getMessageSpeech/);
    assert.match(chatSource, /playCachedMessageSpeech/);
});

test("Keep using Free closes the modal without a hidden counter", () => {
    assert.match(chatSource, /bindDismissal\(voiceQuotaDialog, voiceQuotaKeepFree\)/);
    assert.match(modalSource, /dialog\.close\("dismissed"\)/);
    assert.doesNotMatch(html, /voice.*(?:remaining|left)|(?:remaining|left).*voice/i);
});

test("provider speech failures retain their separate existing UI", () => {
    assert.match(chatSource, /speech_rate_limited[\s\S]*speech_provider_unavailable/);
    assert.match(chatSource, /Berry's voice is temporarily unavailable/);
});
