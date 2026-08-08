"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const headerPages = [
    "begin-legacy.html",
    "chat.html",
    "companion-home.html",
    "experience.html",
    "guided-stories.html",
    "home.html",
    "legacy-dashboard.html",
    "legacy-details.html",
    "legacy-settings.html",
    "legacy-studio.html",
    "mission.html",
    "story-session.html",
    "voice-presence.html",
];

test("every authenticated header uses the shared mascot brand", () => {
    for (const page of headerPages) {
        const html = read(page);
        assert.match(html, /class="[^"]*wb-brand/, page);
        assert.match(html, /class="wb-brand__mark"/, page);
        assert.match(html, /src="assets\/waffle-berry-mascot\.png"/, page);
        assert.match(html, /class="wb-brand__mascot" width="44" height="44"/, page);
        assert.match(html, /alt=""/, page);
        assert.match(html, /class="[^"]*wb-brand__name[^>]*">\s*Waffle Berry\s*</, page);
        assert.doesNotMatch(html, /class="(?:brand-icon|auth-brand-icon)"/, page);
        assert.doesNotMatch(html, />\s*(?:WB|🧇)\s*</, page);
    }
});

test("public and login brand treatments use the same component", () => {
    const landing = read("index.html");
    const login = read("login.html");
    for (const [name, html] of [["index", landing], ["login", login]]) {
        assert.match(html, /class="[^"]*wb-brand/, name);
        assert.match(html, /class="wb-brand__mark"/, name);
        assert.match(html, /class="wb-brand__mascot" width="44" height="44"/, name);
        assert.match(html, /Waffle Berry/, name);
    }
    assert.match(landing, /class="public-brand wb-brand" href="#home"/);
    assert.match(
        landing,
        /class="public-responsible-mark wb-brand__mark"[\s\S]*class="wb-brand__mascot"/
    );
    assert.doesNotMatch(landing, />\s*WB\s*</);
});

test("brand links preserve their existing destinations", () => {
    const destinations = {
        "begin-legacy.html": "experience.html",
        "chat.html": "home.html",
        "companion-home.html": "legacy-dashboard.html",
        "experience.html": "experience.html",
        "guided-stories.html": "experience.html",
        "home.html": "home.html",
        "legacy-dashboard.html": "experience.html",
        "legacy-details.html": "legacy-dashboard.html",
        "legacy-settings.html": "legacy-details.html",
        "legacy-studio.html": "experience.html",
        "mission.html": "home.html",
        "story-session.html": "experience.html",
        "voice-presence.html": "experience.html",
    };
    for (const [page, href] of Object.entries(destinations)) {
        assert.match(
            read(page),
            new RegExp(`<a[^>]*href="${href.replace(".", "\\.")}"[^>]*class="[^"]*wb-brand|<a[^>]*class="[^"]*wb-brand[^>]*href="${href.replace(".", "\\.")}"`),
            page
        );
    }
});

test("shared styles cover light, Night Mode, focus, and mobile sizing", () => {
    const styles = read("css/style.css");
    const landingStyles = read("css/landing.css");
    assert.match(styles, /\.wb-brand__mark\s*\{[\s\S]*width: 48px;[\s\S]*border-radius: 15px/);
    assert.match(styles, /\.wb-brand__mascot\s*\{[\s\S]*object-fit: cover;[\s\S]*object-position: center 25%/);
    assert.match(styles, /body\.dark-mode \.wb-brand__mark/);
    assert.match(styles, /a\.wb-brand:focus-visible/);
    assert.match(styles, /@media \(max-width: 650px\)[\s\S]*\.wb-brand__mark[\s\S]*width: 42px/);
    assert.match(landingStyles, /\.wb-brand__mark/);
    assert.match(landingStyles, /\.wb-brand:focus-visible/);
});
