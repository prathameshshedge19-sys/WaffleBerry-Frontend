"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const styles = read("css/style.css");
const auth = read("js/auth.js");

const authenticatedPages = fs.readdirSync(root).filter((name) => {
    if (!name.endsWith(".html")) return false;
    return read(name).includes('src="js/auth.js"');
});

test("every authenticated page retains a Sign out control", () => {
    assert.ok(authenticatedPages.length > 0);
    for (const name of authenticatedPages) {
        assert.match(read(name), /class="[^"]*logout-button[^"]*"/, name);
    }
});

test("mobile shared headers keep Sign out visible and touch accessible", () => {
    const mobileRules = styles.match(
        /\/\* Mobile authentication and authenticated header controls \*\/[\s\S]*?\/\* FINAL FIX:/
    )?.[0] || "";

    assert.match(mobileRules, /\.logout-button\s*\{[\s\S]*display:\s*inline-flex/);
    assert.match(mobileRules, /\.logout-button\s*\{[\s\S]*min-height:\s*40px/);
    assert.match(mobileRules, /white-space:\s*nowrap/);
    assert.match(mobileRules, /\.companion-transition-page > \.logout-button[\s\S]*position:\s*fixed/);
    assert.doesNotMatch(mobileRules, /\.logout-button\s*\{[^}]*display:\s*none/);
});

test("320px navigation wraps without removing logo, theme, or Sign out", () => {
    const narrowRules = styles.match(
        /@media \(max-width: 350px\) \{[\s\S]*?\n\}/
    )?.[0] || "";

    assert.match(narrowRules, /navbar:has\(> \.nav-links\)[\s\S]*flex-wrap:\s*wrap/);
    assert.match(narrowRules, /> \.nav-links[\s\S]*width:\s*100%/);
    assert.doesNotMatch(narrowRules, /(?:\.brand|\.theme-toggle|\.logout-button)[^{]*\{[^}]*display:\s*none/);
});

test("chat mobile drawer keeps its existing Sign out route visible", () => {
    const chat = read("chat.html");
    assert.match(chat, /class="logout-button drawer-logout-button"[\s\S]*Sign out/);
    assert.match(
        styles,
        /\.conversation-drawer-navigation a,[\s\S]*display:\s*flex/
    );
    assert.doesNotMatch(
        styles,
        /\.chat-page \.logout-button\s*\{[^}]*display:\s*none/
    );
});

test("all Sign out controls remain connected to the shared logout helper", () => {
    assert.match(auth, /querySelectorAll\([\s\S]*"\.logout-button"/);
    assert.match(auth, /logoutButton\.addEventListener\([\s\S]*"click"[\s\S]*logout\(\)/);
    assert.match(auth, /function logout\(\)[\s\S]*clearStoredSession\(\)/);
    assert.match(auth, /window\.setTimeout\([\s\S]*redirectToLandingPage/);
});
