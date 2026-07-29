"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const script = fs.readFileSync(
    path.join(__dirname, "..", "js", "memory-review.js"),
    "utf8"
);
const html = fs.readFileSync(
    path.join(__dirname, "..", "memory-review.html"),
    "utf8"
);
const api = fs.readFileSync(
    path.join(__dirname, "..", "js", "api.js"),
    "utf8"
);
const css = fs.readFileSync(
    path.join(__dirname, "..", "css", "style.css"),
    "utf8"
);
const studio = fs.readFileSync(
    path.join(__dirname, "..", "legacy-studio.html"),
    "utf8"
);

test("review list uses the authenticated API helper", () => {
    assert.match(script, /listMemoryReview/);
    assert.match(api, /apiRequest\(/);
});

test("empty state is present", () => {
    assert.match(script, /All caught up/);
});

test("approval updates local cards without a page reload", () => {
    assert.match(script, /memories\.delete/);
    assert.doesNotMatch(script, /location\.reload/);
});

test("rejection uses a confirmation dialog", () => {
    assert.match(html, /id="memoryRejectDialog"/);
    assert.match(script, /openReject/);
});

test("edit form validates required fields", () => {
    assert.match(html, /id="memoryEditTitleInput" required/);
    assert.match(html, /id="memoryEditSummary" required/);
    assert.match(script, /reportValidity/);
});

test("API errors are converted to safe UI messages", () => {
    assert.match(script, /could not be loaded safely/);
    assert.doesNotMatch(script, /console\./);
});

test("unauthorized responses use existing sign-in behavior", () => {
    assert.match(script, /error\.status === 401/);
    assert.match(script, /clearStoredSession/);
});

test("provenance is rendered with textContent and never innerHTML", () => {
    assert.match(script, /textContent = text/);
    assert.doesNotMatch(script, /innerHTML/);
});

test("contradictions are identified neutrally", () => {
    assert.match(script, /Conflicting Memory/);
    assert.match(script, /Neither account is treated as false/);
});

test("related memory copy does not imply merging", () => {
    assert.match(script, /will not merge or change/);
});

test("mobile review layout is defined", () => {
    assert.match(css, /@media \(max-width: 640px\)/);
    assert.match(css, /\.memory-review-section/);
});

test("primary actions and dialogs use keyboard-native controls", () => {
    assert.match(html, /<dialog id="memoryEditDialog"/);
    assert.match(html, /<button[^>]*type="submit"/);
    assert.match(script, /\.focus\(\)/);
});

test("Legacy Studio contains the review entry", () => {
    assert.match(studio, /Review Memories/);
    assert.match(studio, /studioMemoryReviewCount/);
});
