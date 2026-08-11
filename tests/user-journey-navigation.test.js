"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const login = read("js/login.js");
const experience = read("experience.html");
const listHtml = read("legacy-dashboard.html");
const list = read("js/legacy-dashboard.js");
const begin = read("js/begin-legacy.js");
const decisionHtml = read("companion-home.html");
const decision = read("js/companion-home.js");
const studioHtml = read("legacy-studio.html");
const studio = read("js/legacy-studio.js");
const chat = read("js/chat.js");
const dashboardHtml = read("legacy-details.html");
const dashboard = read("js/legacy-details.js");
const state = read("js/legacy-state.js");
const api = read("js/api.js");
const css = read("css/style.css");

test("login and experience selection follow the required entry flow", () => {
    assert.match(login, /window\.location\.href\s*=\s*"experience\.html"/);
    assert.match(experience, /Legacy Builder/);
    assert.match(experience, /href="legacy-dashboard\.html"/);
    assert.match(experience, /Creator Studio/);
    assert.match(experience, /Coming Soon/);
});

test("Your Legacies remains the central management page", () => {
    assert.match(listHtml, /<title>Your Legacies/);
    assert.match(listHtml, /Begin New Legacy/);
    assert.match(list, /hydratePersisted\(selectedStatus\)/);
    assert.match(list, /createLinkAction\("Edit"[\s\S]*legacy-settings\.html/);
    assert.match(list, /Delete Legacy/);
    assert.match(list, /api\.deleteLegacy/);
});

test("new Legacy is persisted, selected and sent to Who's There", () => {
    assert.match(begin, /WaffleBerryLegacyState\.create/);
    assert.match(begin, /await window\.WaffleBerryLegacyState\.ensurePersisted/);
    assert.match(begin, /persisted\?\.backendLegacyId/);
    assert.match(begin, /WaffleBerryLegacyState\.select\(persisted\.id\)/);
    assert.match(begin, /companion-home\.html\?legacyId=/);
    assert.match(begin, /remove\([\s\S]*backendDeleted: true/);
    assert.match(state, /client_correlation_id/);
    assert.match(state, /backendLegacyId:\s*persisted\.legacy_id/);
    assert.match(state, /seenBackendIds/);
});

test("saved Legacy primary action opens decision page, not dashboard", () => {
    assert.match(list, /function decisionUrl/);
    assert.match(list, /primary\.href = decisionUrl\(legacy\.id\)/);
    assert.doesNotMatch(list, /card\.role = "link"/);
    assert.match(list, /"Legacy Dashboard",[\s\S]*"legacy-details\.html"/);
});

test("Who's There displays selected identity and two distinct choices", () => {
    assert.doesNotMatch(decisionHtml, /companion-home-question">Who's there\?/i);
    assert.match(decisionHtml, /class="sr-only">Selected Legacy choices/);
    assert.match(decisionHtml, /id="companionHomeTitle"/);
    assert.match(decisionHtml, /id="companionHomeRelationship"/);
    assert.match(decisionHtml, /Chat with Companion/);
    assert.match(decisionHtml, /Add Memories/);
    assert.match(decision, /elements\.title\.textContent = persisted\.displayName/);
    assert.match(decision, /elements\.relationship\.textContent = persisted\.relationship/);
});

test("Legacy card actions share one aligned responsive action row", () => {
    assert.match(list, /actions\.className = "legacy-card-actions"/);
    assert.match(list, /actions\.append\(view, dashboard\)/);
    assert.match(css, /\.legacy-card-actions > \.legacy-card-continue,[\s\S]*\.legacy-card-actions > \.legacy-card-dashboard/);
    assert.match(css, /min-height: 44px;[\s\S]*align-items: center;[\s\S]*justify-content: center/);
    assert.doesNotMatch(css, /\.legacy-card-continue[\s\S]{0,180}(?:top|left):/);
});

test("selected Legacy repaired flow contains no mojibake literals", () => {
    const affected = `${decisionHtml}\n${decision}`;
    assert.doesNotMatch(affected, /[\u00c2\u00c3\u00e2\u00f0]/i);
    assert.match(decisionHtml, /class="[^"]*wb-brand/);
    assert.match(decisionHtml, /assets\/waffle-berry-mascot\.png/);
    assert.match(decisionHtml, /<svg viewBox="0 0 24 24" focusable="false">/);
    assert.match(decisionHtml, /Chat with Companion/);
    assert.match(decisionHtml, /Add Memories/);
});

test("decision choices preserve selected persisted Legacy", () => {
    assert.match(decision, /await state\.ensurePersisted\(legacy\.id\)/);
    assert.match(decision, /chat\.html\?\$\{query\}/);
    assert.match(decision, /legacy-studio\.html\?\$\{query\}/);
    assert.match(chat, /legacy_id: selectedLegacy\.backendLegacyId/);
    assert.match(chat, /conversation\.legacy_id === selectedLegacy\.backendLegacyId/);
});

test("Legacy Studio remains the Guided Stories and Story Guide destination", () => {
    assert.match(studioHtml, /Continue Story/);
    assert.match(studioHtml, /Guided Stories/);
    assert.match(studio, /guided-stories\.html\?\$\{query\}/);
    assert.doesNotMatch(studio, /chat\.html/);
});

test("dashboard provides separate navigation actions", () => {
    assert.match(dashboardHtml, /Legacy Dashboard/);
    assert.match(dashboardHtml, /id="legacyDashboardStudioLink"/);
    assert.match(dashboardHtml, /Add More to Legacy/);
    assert.match(dashboardHtml, /id="legacyDashboardChatLink"/);
    assert.match(dashboardHtml, /Chat with Companion/);
    assert.match(dashboardHtml, /id="legacySettingsLink"/);
    assert.match(dashboardHtml, /href="legacy-dashboard\.html"/);
    assert.match(dashboard, /legacy-studio\.html\?\$\{legacyQuery\}/);
    assert.match(dashboard, /chat\.html\?\$\{legacyQuery\}/);
});

test("dashboard terminology help is complete and keyboard accessible", () => {
    assert.match(dashboardHtml, /id="legacyDashboardHelpButton"/);
    assert.match(dashboardHtml, /aria-label="Explain Legacy Dashboard terminology"/);
    for (const term of [
        "Story Sessions", "Distinct Chapters", "Story Contributions",
        "Total Memories", "Approved Memories", "Linked Conversations",
        "Story Session Progress", "Extraction"
    ]) {
        assert.match(dashboardHtml, new RegExp(term));
    }
    assert.match(dashboardHtml, /does not measure all possible future stories/);
    assert.match(dashboard, /showModal\(\)/);
    assert.match(dashboard, /event\.target === elements\.helpDialog/);
    assert.match(dashboard, /helpDialog\?\.addEventListener\("close"/);
    assert.match(dashboard, /helpButton\?\.focus\(\)/);
});

test("archived Legacies explain and enforce read-only choices", () => {
    assert.match(decisionHtml, /Restore it from Your Legacies/);
    assert.match(decision, /persisted\.status === "archived"/);
    assert.match(decision, /setDisabled\(elements\.chat, archived\)/);
    assert.match(decision, /setDisabled\(elements\.studio, archived\)/);
    assert.match(dashboard, /elements\.studio\.hidden = isArchived/);
    assert.match(dashboard, /elements\.chat\.hidden = isArchived/);
});

test("missing, malformed, authentication and retry states are explicit", () => {
    assert.match(decisionHtml, /id="companionHomeLoading"/);
    assert.match(decisionHtml, /id="companionHomeError"/);
    assert.match(decisionHtml, /id="companionHomeRetry"/);
    assert.match(decision, /Return to Your Legacies and select a saved Legacy/);
    assert.match(decision, /error\?\.status === 404/);
    assert.match(decision, /error\?\.status === 401/);
    assert.match(decision, /clearStoredSession/);
    assert.match(api, /class ApiError/);
});

test("responsive, dark-mode and native interactive controls remain present", () => {
    assert.match(css, /@media \(max-width: 680px\)[\s\S]*legacy-overview-hero-actions/);
    assert.match(css, /body\.dark-mode/);
    assert.match(dashboardHtml, /<button[\s\S]*id="legacyDashboardHelpButton"/);
    assert.doesNotMatch(decisionHtml, /onclick=/);
});

test("every authenticated page exposes safe sign out", () => {
    const auth = read("js/auth.js");
    assert.match(auth, /function logout\(\)[\s\S]*clearStoredSession\(\)[\s\S]*redirectToLandingPage/);
    assert.doesNotMatch(auth, /deleteLegacy|archiveLegacy|removeItem\([^)]*(?:legacy|chapter|memory)/i);

    for (const name of fs.readdirSync(path.join(__dirname, ".."))) {
        if (!name.endsWith(".html")) continue;
        const html = read(name);
        if (html.includes('src="js/auth.js"')) {
            assert.match(html, /class="logout-button"/, name);
        }
    }
});
