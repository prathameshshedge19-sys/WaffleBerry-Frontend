"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const chat = read("chat.html");
const call = read("live-call.html");
const script = read("js/voice-settings.js");
const liveCallScript = read("js/live-call.js");
const chatScript = read("js/chat.js");
const styles = read("css/style.css");

test("Chat is the sole accessible conversation settings surface", () => {
    assert.match(chat, /data-open-voice-settings/);
    assert.match(chat, /id="voiceSettingsDialog"[\s\S]*aria-modal="true"/);
    assert.match(chat, /Conversation settings/);
    assert.match(chat, /These preferences apply to Chat and future Live Calls\./);
    assert.match(chat, /Style[\s\S]*Natural[\s\S]*Gentle[\s\S]*Expressive/);
    assert.match(chat, /Response length[\s\S]*Short[\s\S]*Balanced[\s\S]*Detailed/);
    assert.match(chat, /Save settings/);
    assert.doesNotMatch(call + chat, /liveCallSettingsButton|liveCallSettingsDialog|Live Call Settings/);
});

test("settings load and save all authoritative preferences once", () => {
    assert.match(script, /"\/user\/conversation-preferences"/);
    assert.match(script, /method: "PUT"/);
    assert.match(script, /voice: selected \|\| null[\s\S]*conversation_style:[\s\S]*response_length:/);
    assert.match(script, /preference\.conversation_style \|\| "natural"/);
    assert.match(script, /preference\.response_length \|\| "balanced"/);
    assert.match(script, /Conversation settings updated\./);
    assert.doesNotMatch(liveCallScript, /sendEvent\("session\.settings"|session\.settings\.updated/);
});

test("catalogue remains in server-provided male and female order", () => {
    assert.match(script, /"Automatic"/);
    assert.match(script, /Berry chooses a voice based on the selected relationship\./);
    assert.match(script, /"Male voices"[\s\S]*preference\.available_voices\.male/);
    assert.match(script, /"Female voices"[\s\S]*preference\.available_voices\.female/);
});

test("frontend contains no infrastructure metadata or playback override", () => {
    for (const forbidden of ["provider", "model ID", "API key", "Bulbul"]) {
        assert.doesNotMatch(chat + script, new RegExp(forbidden, "i"));
    }
    assert.doesNotMatch(script, /messages\/.+speech|response_format/);
    assert.match(chatScript, /waffleberry:voicepreferencechange[\s\S]*clearCache: true/);
});

test("dialog supports focus, mobile, Night Mode, and touch targets", () => {
    assert.match(script, /event\.key !== "Tab"/);
    assert.match(script, /dialog\?\.addEventListener\("cancel"/);
    assert.match(script, /returnFocusTarget\?\.focus\(\)/);
    assert.match(styles, /body\.dark-mode \.voice-settings-card/);
    assert.match(styles, /\.conversation-preference-group label[\s\S]*min-height: 44px/);
    assert.match(styles, /@media \(max-width: 480px\)[\s\S]*\.voice-settings-actions/);
});
