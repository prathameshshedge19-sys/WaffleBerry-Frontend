"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const chatHtml = read("chat.html");
const liveHtml = read("live-call.html");
const chat = read("js/chat.js");
const live = read("js/live-call.js");
const realtime = read("js/live-call-realtime.js");
const utility = read("js/service-unavailable.js");

test("generic service UI contains safe application copy and no provider billing language", () => {
    for (const page of [chatHtml, liveHtml]) {
        assert.match(page, /WaffleBerry is temporarily unavailable/);
        assert.match(page, /Sorry, our AI service is temporarily unavailable right now\. Please try again later\./);
        const start = page.indexOf('id="serviceUnavailableDialog"');
        const dialog = page.slice(start, page.indexOf("</dialog>", start) + 9);
        assert.doesNotMatch(dialog, /OpenAI|API key|billing|credits|balance|insufficient quota|quota exhausted|payment required/);
        assert.match(dialog, /data-service-close>Close/);
        assert.doesNotMatch(dialog, /View plans/);
    }
});

test("Chat provider failure removes optimistic turn and opens app UI without Berry bubble", () => {
    const branch = chat.slice(chat.indexOf("streamMessage?.remove()"));
    assert.match(branch, /isServiceFailure\(error\)[\s\S]*optimisticMessage\?\.remove\(\)[\s\S]*showServiceUnavailable\(\)/);
    const inline = chat.slice(chat.indexOf("function appendInlineError"), chat.indexOf("function quotaDetail"));
    assert.match(inline, /isServiceFailure\(error\)[\s\S]*showServiceUnavailable\(\)[\s\S]*return/);
    assert.ok(inline.indexOf("showServiceUnavailable") < inline.indexOf("createBerryMessage"));
});

test("voice provider failure uses service UI and remains separate from voice quota", () => {
    assert.match(chat, /voice_play_quota_exceeded[\s\S]*showVoiceQuotaDialog/);
    assert.match(chat, /isServiceFailure\(error\)[\s\S]*messageSpeechState\.phase = "idle"[\s\S]*showServiceUnavailable/);
});

test("Live provider failures terminate once, restore ended UI, and avoid quota modal", () => {
    assert.match(live, /providerFailureEnding[\s\S]*endLiveCallSession[\s\S]*finishEnded\(\)[\s\S]*serviceUnavailableDialog/);
    assert.match(realtime, /provider_quota_exhausted[\s\S]*provider_rate_limited[\s\S]*handleProviderServiceFailure/);
    assert.doesNotMatch(realtime.slice(realtime.indexOf('if (["provider_quota_exhausted"'), realtime.indexOf("this.recoverResponse", realtime.indexOf('if (["provider_quota_exhausted"'))), /showQuotaDialog|Something interrupted/);
});

test("service classification is distinct from WaffleBerry quota classification", () => {
    assert.match(utility, /ai_service_unavailable/);
    assert.doesNotMatch(utility, /chat_quota_exceeded|live_call_quota_exceeded|voice_play_quota_exceeded|memory_quota_exceeded/);
    assert.match(chat, /chat_quota_exceeded[\s\S]*showChatQuotaDialog/);
});
