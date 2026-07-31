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


test("My Legacy is available from existing Legacy card navigation", () => {
    assert.match(
        dashboard,
        /"My Legacy",[\s\S]*?"legacy-details\.html"/
    );
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
