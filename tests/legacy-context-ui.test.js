"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const contextScript = fs.readFileSync(path.join(root, "js", "legacy-context-ui.js"), "utf8");
const homeScript = fs.readFileSync(path.join(root, "js", "home.js"), "utf8");
const home = fs.readFileSync(path.join(root, "home.html"), "utf8");
const mission = fs.readFileSync(path.join(root, "mission.html"), "utf8");
const chatScript = fs.readFileSync(path.join(root, "js", "chat.js"), "utf8");
const login = fs.readFileSync(path.join(root, "login.html"), "utf8");

function loadContext({ search = "", selected = null, active = null } = {}) {
    const links = ["home.html", "mission.html", "chat.html"].map((href) => ({
        href, getAttribute: () => href
    }));
    const cta = { textContent: "", dataset: { genericLabel: "Start Chat" } };
    const replacements = [];
    const hydration = [];
    const state = {
        async hydratePersisted(status) { hydration.push(status); },
        select() { return selected; },
        getActive() { return active; }
    };
    const window = {
        authReady: Promise.resolve(), WaffleBerryLegacyState: state,
        location: { href: `https://waffleberry.app/home.html${search}`, search,
            replace(url) { replacements.push(url); } }
    };
    const document = {
        querySelectorAll(selector) {
            if (selector === "a[href]") return links;
            if (selector === "[data-legacy-cta]") return [cta];
            return [];
        }
    };
    vm.runInNewContext(contextScript, { window, document, URL, URLSearchParams, Set, Object });
    return { api: window.WaffleBerryLegacyContextUi, links, cta, hydration, replacements };
}

test("selected Legacy dynamically updates CTA and scopes Home, Mission and Chat", async () => {
    for (const name of ["Aaji", "Dad"]) {
        const legacy = { id: `legacy-${name}`, displayName: name, status: "active" };
        const fixture = loadContext({ search: `?legacyId=${legacy.id}&conversationId=42`, selected: legacy });
        const resolved = await fixture.api.resolveSelectedLegacy();
        fixture.api.updateLegacyAwareUI(resolved);
        assert.equal(fixture.cta.textContent, `Talk to ${name}`);
        for (const link of fixture.links) {
            assert.match(link.href, new RegExp(`legacyId=legacy-${name}`));
            assert.match(link.href, /conversationId=42/);
        }
    }
});

test("no Legacy preserves generic copy and explicit invalid context fails safely", async () => {
    const generic = loadContext();
    generic.api.updateLegacyAwareUI(await generic.api.resolveSelectedLegacy());
    assert.equal(generic.cta.textContent, "Start Chat");
    assert.deepEqual(generic.links.map(({ href }) => href), ["home.html", "mission.html", "chat.html"]);

    const invalid = loadContext({ search: "?legacyId=missing" });
    assert.equal(await invalid.api.resolveSelectedLegacy(), null);
    assert.deepEqual(invalid.replacements, ["legacy-dashboard.html"]);
});

test("archived requested Legacy is never substituted by another active Legacy", async () => {
    const archived = { id: "old", displayName: "Archived", status: "archived" };
    const fixture = loadContext({ search: "?legacyId=old", selected: archived,
        active: { id: "other", displayName: "Other", status: "active" } });
    assert.equal(await fixture.api.resolveSelectedLegacy(), null);
    assert.deepEqual(fixture.replacements, ["legacy-dashboard.html"]);
});

test("Home typewriter and CTAs use hydrated Legacy identity without hardcoding a name", () => {
    assert.match(homeScript, /await window\.WaffleBerryLegacyContextUi\.resolveSelectedLegacy\(\)/);
    assert.match(homeScript, /`Hello, \$\{firstName\}\. I'm \$\{legacy\?\.displayName \|\| "Berry"\}\.`/);
    assert.match(homeScript, /typeText\([\s\S]*headingText/);
    assert.match(homeScript, /legacyDescriptionText/);
    assert.doesNotMatch(homeScript, /Aaji|Dad|Mom|Grandpa|Meenakshi/);
    assert.match(home, /data-legacy-cta data-generic-label="Start Chat"/);
    assert.match(mission, /data-legacy-cta data-generic-label="Talk to Berry"/);
});

test("vision copy is authoritative and navigation hydration remains shared", () => {
    assert.doesNotMatch(`${home}${mission}${login}${homeScript}`, /We make people live forever\./);
    assert.match(mission, /No one is truly gone while their story can still be told\./);
    assert.match(mission, /WaffleBerry preserves the stories, memories, personality/);
    assert.match(chatScript, /WaffleBerryLegacyContextUi\?\.updateLegacyAwareUI\(selectedLegacy/);
    assert.match(chatScript, /conversationId: state\.activeConversationId/);
});
