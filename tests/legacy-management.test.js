"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const api = read("js/api.js");
const state = read("js/legacy-state.js");
const dashboard = read("js/legacy-dashboard.js");
const dashboardHtml = read("legacy-dashboard.html");
const deleteDialog = read("js/legacy-delete-dialog.js");
const details = read("js/legacy-details.js");
const detailsHtml = read("legacy-details.html");
const settings = read("js/legacy-settings.js");
const transition = read("js/legacy-transition.js");
const companion = read("js/companion-home.js");
const css = read("css/style.css");

test("Legacy dashboard header exposes an accessible secondary Plans control", () => {
    const start = dashboardHtml.indexOf('<header class="navbar">');
    const header = dashboardHtml.slice(start, dashboardHtml.indexOf("</header>", start));
    assert.match(header, /class="dashboard-plans-button"[\s\S]*href="plans\.html"[\s\S]*Plans/);
    assert.ok(header.indexOf("dashboard-plans-button") < header.indexOf("logout-button"));
    assert.match(header, /class="logout-button"[\s\S]*Sign out/);
    assert.match(header, /id="themeToggle"[\s\S]*class="theme-toggle"/);
    assert.match(css, /\.dashboard-plans-button:visited,[\s\S]*\.dashboard-plans-button:focus-visible \{[\s\S]*text-decoration: none/);
    assert.match(css, /\.dashboard-plans-button:hover \{[\s\S]*text-decoration: none/);
    assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.dashboard-plans-button \{[\s\S]*font-size: 0\.78rem/);
});

test("management uses active and archived backend listings", () => {
    assert.match(api, /function listOwnedLegaciesByStatus/);
    assert.match(api, /\?status=\$\{encodeURIComponent\(status\)\}/);
    assert.match(dashboardHtml, /data-legacy-status-tab="active"/);
    assert.match(dashboardHtml, /data-legacy-status-tab="archived"/);
    assert.match(dashboard, /state\.hydratePersisted\(selectedStatus\)/);
});

test("archive and restore synchronize cards without navigation reload", () => {
    assert.match(api, /function archiveLegacy/);
    assert.match(api, /function restoreLegacy/);
    assert.match(dashboard, /await api\.archiveLegacy/);
    assert.match(dashboard, /await api\.restoreLegacy/);
    assert.match(dashboard, /state\.updatePersisted\(updated\.legacy_id, updated\)/);
    assert.doesNotMatch(dashboard, /location\.reload/);
    assert.match(state, /seenBackendIds/);
});

test("permanent deletion requires exact typed confirmation", () => {
    assert.match(deleteDialog, /Type the Legacy name to confirm/);
    assert.match(deleteDialog, /confirmationInput\.value !== dialog\.dataset\.legacyName/);
    assert.match(deleteDialog, /confirmButton\.disabled = true/);
    assert.match(deleteDialog, /This action cannot be undone/);
    assert.match(api, /confirmation_text: confirmationText/);
    assert.match(dashboard, /await api\.deleteLegacy/);
    assert.match(dashboard, /backendDeleted: true/);
    assert.doesNotMatch(companion, /WaffleBerryApi\.deleteLegacy/);
});

test("export uses authenticated blob download and server filename", () => {
    assert.match(api, /async function exportLegacy/);
    assert.match(api, /Authorization: `Bearer \$\{accessToken\}`/);
    assert.match(api, /await response\.blob\(\)/);
    assert.match(dashboard, /URL\.createObjectURL/);
    assert.match(dashboard, /anchor\.download = download\.filename/);
    assert.doesNotMatch(dashboard, /export preview/i);
});

test("archived Legacy pages are visibly read only", () => {
    assert.match(detailsHtml, /id="legacyArchivedBanner"/);
    assert.match(detailsHtml, /This Legacy is archived\./);
    assert.match(details, /elements\.settings\.hidden = isArchived/);
    assert.match(settings, /backendLegacy\.status === "archived"/);
    assert.match(transition, /legacy\.status === "archived"/);
    assert.match(companion, /persisted\.status === "archived"/);
});

test("management exposes retry, lifecycle errors, and accessible status", () => {
    assert.match(dashboardHtml, /id="legacyManagementRetry"/);
    assert.match(dashboardHtml, /role="tablist"/);
    assert.match(dashboard, /"ArrowRight", "ArrowDown"/);
    assert.match(dashboard, /event\.key === "Home"/);
    assert.match(dashboardHtml, /aria-live="polite"/);
    assert.match(dashboard, /error\?\.status === 404/);
    assert.match(dashboard, /error\?\.status === 409/);
    assert.match(dashboard, /error\?\.kind === "network"/);
    assert.match(dashboard, /error\?\.status !== 401/);
});

test("management remains responsive and dark-mode compatible", () => {
    assert.match(css, /\.legacy-management-tabs/);
    assert.match(css, /body\.dark-mode \.legacy-management-tabs/);
    assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.legacy-card-grid/);
    assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.legacy-card-grid/);
    assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.legacy-delete-dialog-actions/);
});
