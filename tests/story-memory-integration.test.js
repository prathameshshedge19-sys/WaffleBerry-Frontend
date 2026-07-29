"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => fs.readFileSync(
    path.join(__dirname, "..", file), "utf8"
);
const legacyState = read("js/legacy-state.js");
const storyState = read("js/guided-stories-state.js");
const story = read("js/story-session.js");
const api = read("js/api.js");
const html = read("story-session.html");
const css = read("css/style.css");

test("temporary Legacy synchronization uses a correlation ID", () => {
    assert.match(legacyState, /client_correlation_id/);
    assert.match(legacyState, /synchronizeLegacy/);
});
test("returned backend Legacy ID is retained", () =>
    assert.match(legacyState, /backendLegacyId:\s*persisted\.legacy_id/));
test("persisted owned Legacies can hydrate a new browser session", () => {
    assert.match(legacyState, /hydratePersisted/);
    assert.match(api, /listOwnedLegacies/);
});
test("frontend-only removal retains a persisted Legacy tombstone", () =>
    assert.match(legacyState, /HIDDEN_LEGACIES_KEY/));
test("repeated synchronization reuses a retained backend ID", () =>
    assert.match(legacyState, /if \(legacy\.backendLegacyId\)/));
test("Guided Story creates or resumes a persisted session", () =>
    assert.match(story, /createStorySession/));
test("persisted Story Session ID is retained", () =>
    assert.match(storyState, /setBackendStorySession/));
test("user messages use the persisted Story Session", () =>
    assert.match(story, /streamPersistedStory/));
test("streaming event behavior remains present", () => {
    assert.match(story, /event === "delta"/);
    assert.match(story, /event === "complete"/);
});
test("explicit Finish Story action exists", () =>
    assert.match(html, /id="finishStoryButton"/));
test("completion copy preserves human review", () =>
    assert.match(story, /review them shortly/));
test("navigation is not blocked by extraction", () =>
    assert.match(story, /window\.setTimeout/));
test("completed extraction links to Memory Review", () =>
    assert.match(story, /memory-review\.html/));
test("failed extraction exposes a safe retry", () => {
    assert.match(html, /retryExtractionButton/);
    assert.match(story, /retryStoryExtraction/);
});
test("authentication continues through shared API requests", () =>
    assert.match(api, /getStoredAccessToken/));
test("browser ID is sent only as a correlation value", () => {
    assert.match(legacyState, /client_correlation_id:\s*legacy\.id/);
    assert.match(story, /backendLegacyId/);
});
test("no sensitive content is logged", () =>
    assert.doesNotMatch(story, /console\./));
test("status text uses textContent", () => {
    assert.match(story, /completionMessage\.textContent/);
    assert.doesNotMatch(story, /innerHTML/);
});
test("completion controls remain mobile responsive", () =>
    assert.match(css, /\.story-completion-actions/));
test("completion and retry use keyboard-native buttons", () => {
    assert.match(html, /id="finishStoryButton"[^>]*type="button"/);
    assert.match(html, /id="retryExtractionButton"[^>]*type="button"/);
});
