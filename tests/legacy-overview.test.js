"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => fs.readFileSync(
    path.join(__dirname, "..", file),
    "utf8"
);
const api = read("js/api.js");
const overview = read("js/legacy-details.js");
const html = read("legacy-details.html");
const dashboard = read("js/legacy-dashboard.js");
const css = read("css/style.css");


test("dashboard API uses the shared authenticated request utility", () => {
    assert.match(
        api,
        /function getLegacyDashboard\(legacyId\)/
    );
    assert.match(
        api,
        /`\/legacies\/\$\{encodeURIComponent\(legacyId\)\}\/dashboard`/
    );
    assert.match(
        api,
        /getLegacyDashboard,/
    );
});

test("Stored Memories are scoped, safely rendered, editable, deletable, and bounded", () => {
    assert.match(html, /id="storedMemoriesTitle"[^>]*>Stored Memories</);
    assert.match(overview, /listStoredMemories\([\s\S]*storedLegacyId/);
    assert.match(overview, /summary\.textContent = memory\.summary/);
    assert.match(overview, /window\.prompt\("Edit this memory"/);
    assert.match(overview, /window\.confirm\("Delete this memory\?"\)/);
    assert.match(overview, /No stored memories yet/);
    assert.match(api, /review_status=approved[\s\S]*offset=\$\{offset\}[\s\S]*limit=\$\{limit\}/);
    assert.doesNotMatch(overview, /innerHTML\s*=/);
});


test("explicit Legacy URL selection falls back to active session state", () => {
    assert.match(overview, /window\.location\.search/);
    assert.match(
        overview,
        /WaffleBerryLegacyState\.select\(requestedId\)/
    );
    assert.match(
        overview,
        /WaffleBerryLegacyState\.getActive\(\)/
    );
    assert.match(overview, /ensurePersisted\(legacy\.id\)/);
});


test("overview includes loading, retryable error, and content states", () => {
    assert.match(html, /id="legacyOverviewLoading"/);
    assert.match(html, /id="legacyOverviewError"/);
    assert.match(html, /id="legacyOverviewRetry"/);
    assert.match(html, /id="legacyOverviewContent"/);
    assert.match(overview, /showLoading\(\)/);
    assert.match(overview, /showError\(/);
});


test("authentication and not-found behavior remain distinct", () => {
    assert.match(overview, /error\.status === 401/);
    assert.match(
        overview,
        /window\.location\.replace\("login\.html"\)/
    );
    assert.match(overview, /error\.status === 404/);
    assert.match(overview, /"not-found"/);
});


test("overview renders factual approval state without readiness claims", () => {
    assert.match(
        overview,
        /Approved memories available/
    );
    assert.match(
        overview,
        /No approved memories yet/
    );
    assert.doesNotMatch(
        `${html}\n${overview}`,
        /companion readiness/i
    );
});


test("counts and dates are normalized before rendering", () => {
    assert.match(overview, /function safeCount/);
    assert.match(overview, /function formatDate/);
    assert.match(overview, /Date unavailable/);
    assert.doesNotMatch(overview, /innerHTML/);
});


test("Legacy Dashboard is a separate saved Legacy card action", () => {
    assert.match(
        dashboard,
        /"Legacy Dashboard",[\s\S]*?"legacy-details\.html"/
    );
    assert.match(dashboard, /decisionUrl\(legacy\.id\)/);
});


test("overview has tablet and mobile responsive layouts", () => {
    assert.match(css, /@media \(max-width: 760px\)/);
    assert.match(css, /@media \(max-width: 430px\)/);
    assert.match(
        css,
        /\.legacy-overview-detail-grid/
    );
});


test("progress percentages use valid ratios and protect zero totals", () => {
    assert.match(overview, /function percentage\(part, total\)/);
    assert.match(overview, /if \(safeTotal === 0\)/);
    assert.match(
        overview,
        /Math\.round\(\(safePart \/ safeTotal\) \* 100\)/
    );
    assert.match(overview, /calculated === null/);
});


test("story, memory, and extraction progress use backend totals", () => {
    assert.match(
        overview,
        /completed:\s*stories\.completed_sessions[\s\S]*?total:\s*stories\.total_sessions/
    );
    assert.match(
        overview,
        /completed:\s*memories\.approved[\s\S]*?total:\s*memories\.total/
    );
    assert.match(
        overview,
        /completed:\s*extraction\.completed_runs[\s\S]*?total:\s*extraction\.total_runs/
    );
});


test("progress bars expose accessible values and labels", () => {
    assert.match(html, /aria-labelledby="legacyProgressTitle"/);
    assert.match(overview, /role", "progressbar"/);
    assert.match(overview, /aria-label/);
    assert.match(overview, /aria-valuemin/);
    assert.match(overview, /aria-valuemax/);
    assert.match(overview, /aria-valuetext/);
    assert.match(overview, /aria-valuenow/);
});


test("Legacy Health descriptions are driven by factual counts", () => {
    assert.match(overview, /function storyHealth/);
    assert.match(overview, /function memoryHealth/);
    assert.match(overview, /function extractionHealth/);
    assert.match(overview, /No sessions yet/);
    assert.match(overview, /No approved memories/);
    assert.match(overview, /Extraction is in progress/);
    assert.doesNotMatch(overview, /companion readiness/i);
});


test("activity summary uses only existing dashboard fields", () => {
    assert.match(html, /id="legacyActivitySummary"/);
    assert.match(
        overview,
        /stories\.total_sessions,[\s\S]*?"story session",[\s\S]*?"story sessions"/
    );
    assert.match(
        overview,
        /memories\.approved,[\s\S]*?"approved memory",[\s\S]*?"approved memories"/
    );
    assert.match(
        overview,
        /data\?\.linked_conversations,[\s\S]*?"linked conversation",[\s\S]*?"linked conversations"/
    );
});


test("relative and absolute dates share a validated backend date", () => {
    assert.match(html, /id="legacyOverviewRelativeDate"/);
    assert.match(overview, /function validDate/);
    assert.match(overview, /function formatRelativeTime/);
    assert.match(
        overview,
        /validDate\(data\?\.updated_at, data\?\.created_at\)/
    );
});


test("progress rendering reuses the single dashboard response", () => {
    assert.equal(
        (
            overview.match(
                /getLegacyDashboard\(/g
            ) || []
        ).length,
        1
    );
    assert.doesNotMatch(overview, /setInterval|setTimeout/);
});


test("story session groups render from the existing dashboard response", () => {
    assert.match(html, /id="legacyStorySessionCategoriesGrid"/);
    assert.match(overview, /function renderStorySessionCategories/);
    assert.match(overview, /data\?\.story_session_categories/);
    assert.doesNotMatch(overview, /getStoryCategories|fetchStoryCategories/);
});


test("story session cards show percentage and session counts", () => {
    assert.match(overview, /function createStorySessionCategoryCard/);
    assert.match(overview, /category\?\.session_completion_percentage/);
    assert.match(overview, /category\?\.completed_sessions/);
    assert.match(overview, /category\?\.total_sessions/);
    assert.match(overview, /value\.textContent = `\$\{completion\}%`/);
});


test("story session cards reuse canonical Guided Story chapter titles", () => {
    assert.match(html, /js\/guided-stories-content\.js/);
    assert.match(overview, /window\.WaffleBerryStoryChapters/);
    assert.match(overview, /chapter\.id === categoryId/);
    assert.match(overview, /canonicalChapter\?\.title/);
});


test("story session percentages remain safe and accessible", () => {
    assert.match(overview, /function safePercentage/);
    assert.match(overview, /Math\.min\(100, Math\.max\(0/);
    assert.match(overview, /legacy-story-category-track/);
    assert.match(overview, /aria-valuenow/);
    assert.match(overview, /aria-valuetext/);
});


test("story session empty state is explicit", () => {
    assert.match(html, /id="legacyStorySessionCategoriesEmpty"/);
    assert.match(html, /No story sessions available\./);
    assert.match(
        overview,
        /storySessionCategoriesEmpty\.hidden = available\.length > 0/
    );
});


test("session progress wording does not claim planned-story completion", () => {
    assert.match(html, /Story Session Progress/);
    assert.match(html, /Completion of sessions already started/);
    assert.match(overview, /sessions completed/);
    assert.doesNotMatch(html, /Category Completion|Stories Completed/);
});
