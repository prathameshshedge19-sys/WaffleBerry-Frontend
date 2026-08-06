"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const chat = read("chat.html");
const script = read("js/voice-settings.js");
const chatScript = read("js/chat.js");
const styles = read("css/style.css");

test("chat exposes accessible personal voice settings", () => {
    assert.match(chat, /data-open-voice-settings/);
    assert.match(chat, /id="voiceSettingsDialog"[\s\S]*aria-modal="true"/);
    assert.match(chat, /Choose Berry(?:&rsquo;|’)s voice/);
    assert.match(chat, /Select the voice Berry uses when reading messages aloud\./);
    assert.match(chat, /Save voice/);
    assert.match(chat, /src="js\/voice-settings\.js"/);
});

test("settings load and persist the authenticated user preference", () => {
    assert.match(script, /apiRequest\([\s\S]*"\/user\/voice-preference"/);
    assert.match(script, /method: "PUT"/);
    assert.match(script, /body: \{ voice: selected \|\| null \}/);
    assert.match(script, /isSaving \|\| isLoading/);
    assert.match(script, /Voice updated/);
    assert.match(script, /could not be saved/);
});

test("catalogue is rendered in server-provided male and female order", () => {
    assert.match(script, /"Automatic"/);
    assert.match(script, /Berry chooses a voice based on the selected relationship\./);
    assert.match(script, /"Male voices"[\s\S]*preference\.available_voices\.male/);
    assert.match(script, /"Female voices"[\s\S]*preference\.available_voices\.female/);
    assert.match(script, /input\.type = "radio"/);
});

test("frontend contains no infrastructure metadata or playback override", () => {
    for (const forbidden of ["provider", "model ID", "API key", "Bulbul"]) {
        assert.doesNotMatch(chat + script, new RegExp(forbidden, "i"));
    }
    assert.doesNotMatch(script, /messages\/.+speech|response_format/);
    assert.match(chatScript, /waffleberry:voicepreferencechange[\s\S]*clearCache: true/);
});

test("dialog supports focus, Escape, mobile, and Night Mode", () => {
    assert.match(script, /event\.key !== "Tab"/);
    assert.match(script, /dialog\?\.addEventListener\("cancel"/);
    assert.match(script, /returnFocusTarget\?\.focus\(\)/);
    assert.match(styles, /body\.dark-mode \.voice-settings-card/);
    assert.match(styles, /@media \(max-width: 480px\)[\s\S]*\.voice-settings-actions/);
    assert.match(styles, /\.voice-settings-actions button\s*\{[\s\S]*min-height: 48px/);
});
