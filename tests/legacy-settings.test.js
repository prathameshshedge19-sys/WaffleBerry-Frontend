"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => fs.readFileSync(
    path.join(__dirname, "..", file),
    "utf8"
);
const html = read("legacy-settings.html");
const settings = read("js/legacy-settings.js");
const state = read("js/legacy-state.js");
const api = read("js/api.js");
const overview = read("legacy-details.html");
const css = read("css/style.css");

test("My Legacy exposes a natural settings entry", () => {
    assert.match(overview, /id="legacySettingsLink"/);
    assert.match(overview, />\s*Legacy Settings\s*</);
});

test("settings load authoritative values into labeled fields", () => {
    assert.match(settings, /api\.getOwnedLegacy/);
    assert.match(settings, /name\.value = backendLegacy\.display_name/);
    assert.match(settings, /relationship\.value = backendLegacy\.relationship/);
    assert.match(html, /<label for="legacySettingsName">/);
    assert.match(html, /<label for="legacySettingsRelationship">/);
});

test("valid edits use the shared authenticated API request", () => {
    assert.match(api, /function updateLegacySettings\(legacyId, changes\)/);
    assert.match(api, /method: "PATCH", body: changes/);
    assert.match(settings, /api\.updateLegacySettings/);
});

test("successful saves synchronize local state without replacing IDs", () => {
    assert.match(
        settings,
        /state\.updatePersisted\(\s*updated\.legacy_id,\s*updated\s*\)/
    );
    assert.match(settings, /if \(!synchronized\)/);
    assert.match(settings, /await state\.hydratePersisted\(\)/);
    assert.match(state, /function updatePersisted/);
    assert.match(state, /\.\.\.legacies\[index\]/);
    assert.doesNotMatch(state, /function updatePersisted[\s\S]*create\(/);
});

test("settings validate names and relationships", () => {
    assert.match(settings, /Enter a Legacy name\./);
    assert.match(settings, /Use 255 characters or fewer\./);
    assert.match(settings, /Enter a relationship\./);
    assert.match(settings, /Use 100 characters or fewer\./);
    assert.match(settings, /invalid\?\.focus\(\)/);
});

test("saving is guarded and announced", () => {
    assert.match(settings, /if \(saving \|\| !backendLegacy\)/);
    assert.match(settings, /save\.disabled = value/);
    assert.match(settings, /Saving Legacy settings/);
    assert.match(html, /aria-live="polite"/);
});

test("cancel returns without mutating settings", () => {
    assert.match(html, /id="legacySettingsCancel"/);
    assert.doesNotMatch(settings, /cancel\.addEventListener/);
});

test("authentication, neutral not-found, conflict and retry errors are handled", () => {
    assert.match(settings, /error\?\.status === 401/);
    assert.match(settings, /window\.location\.replace\("login\.html"\)/);
    assert.match(settings, /error\?\.status === 404/);
    assert.match(settings, /error\?\.status === 409/);
    assert.match(settings, /Unable to save these settings\. Please try again\./);
    assert.match(settings, /retry\.addEventListener\("click", load\)/);
    assert.match(settings, /reload\.addEventListener\("click", load\)/);
    assert.match(html, /id="legacySettingsReload"/);
    assert.match(html, /Reload latest settings/);
});

test("user-provided values are rendered safely", () => {
    assert.doesNotMatch(settings, /innerHTML/);
    assert.match(settings, /\.value = updated\.display_name/);
    assert.match(settings, /\.value = updated\.relationship/);
});

test("settings controls are keyboard-native and accessible", () => {
    assert.match(html, /<form id="legacySettingsForm"/);
    assert.match(html, /type="submit"/);
    assert.match(html, /aria-describedby="legacySettingsNameHelp legacySettingsNameError"/);
    assert.match(html, /role="status" aria-live="polite"/);
});

test("settings remain responsive and dark-mode compatible", () => {
    assert.match(css, /\.legacy-settings-actions/);
    assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.legacy-settings-section/);
    assert.match(css, /body\.dark-mode \.legacy-settings-field-error/);
    assert.match(css, /var\(--input-background\)/);
});

test("settings expose no destructive or lifecycle controls", () => {
    assert.doesNotMatch(html, /Delete Legacy|Archive Legacy|Export Legacy|Transfer ownership|Restore Legacy/i);
    assert.doesNotMatch(html, /name="status"/);
});
