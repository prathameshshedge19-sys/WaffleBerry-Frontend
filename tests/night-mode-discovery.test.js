"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (name) =>
    fs.readFileSync(path.join(root, name), "utf8");
const chat = read("chat.html");
const experience = read("experience.html");
const landing = read("index.html");
const loginPage = read("login.html");
const discovery = read("js/night-mode-discovery.js");
const theme = read("js/theme.js");
const auth = read("js/auth.js");
const login = read("js/login.js");
const chatScript = read("js/chat.js");
const styles = read("css/style.css");

test("approved Night Mode discovery copy is exact", () => {
    for (const copy of [
        "A quieter way to connect",
        "Conversations feel different after dark",
        "Switch to Night Mode for a calmer, softer space designed for late-night memories and meaningful conversations.",
        "Maybe later",
        "Enter Night Mode"
    ]) {
        assert.ok(chat.includes(copy));
    }
    assert.match(chat, /Don(?:&rsquo;|’)t show this again/);
    assert.doesNotMatch(chat, /Try Night Mode|Enable dark mode/);
});

test("discovery exists on the post-login experience and chat pages", () => {
    assert.match(chat, /<dialog[\s\S]*id="nightModeDiscoveryDialog"/);
    assert.match(chat, /aria-modal="true"/);
    assert.match(chat, /aria-labelledby="nightModeDiscoveryTitle"/);
    assert.match(chat, /aria-describedby="nightModeDiscoveryDescription"/);
    assert.match(chat, /src="js\/night-mode-discovery\.js"/);
    assert.match(experience, /data-night-mode-discovery-auto/);
    assert.match(experience, /<dialog[\s\S]*id="nightModeDiscoveryDialog"/);
    assert.match(experience, /src="js\/night-mode-discovery\.js"/);
    assert.doesNotMatch(landing, /night-mode-discovery/i);
    assert.doesNotMatch(loginPage, /night-mode-discovery/i);
});

test("prompt waits for authentication and primary chat loading", () => {
    assert.match(
        chatScript,
        /await window\.authReady;[\s\S]*await loadConversations\(\);[\s\S]*notifyAuthenticatedContentReady\(\)/
    );
    assert.match(discovery, /DISPLAY_DELAY_MS\s*=\s*600/);
    assert.match(discovery, /getStoredAccessToken\(\)/);
    assert.match(discovery, /hasBlockingModal\(\)/);
    assert.match(discovery, /document\.visibilityState !== "hidden"/);
});

test("the actual post-login page restores auth before scheduling discovery", () => {
    assert.match(
        discovery,
        /data-night-mode-discovery-auto[\s\S]*window\.authReady[\s\S]*getStoredAccessToken\(\)[\s\S]*notifyAuthenticatedContentReady\(\)/
    );
    assert.match(login, /window\.location\.href\s*=\s*"experience\.html"/);
    assert.ok(
        experience.indexOf('src="js/auth.js"') <
            experience.indexOf('src="js/theme.js"')
    );
    assert.ok(
        experience.indexOf('src="js/theme.js"') <
            experience.indexOf('src="js/night-mode-discovery.js"')
    );
});

test("light mode and both discovery storage layers gate display", () => {
    assert.match(discovery, /!window\.WaffleBerryTheme\?\.isDark\(\)/);
    assert.match(discovery, /localStorage\.getItem\(DISMISSED_KEY\)/);
    assert.match(discovery, /sessionStorage\.getItem\([\s\S]*SHOWN_SESSION_KEY/);
    assert.match(discovery, /sessionStorage\.setItem\([\s\S]*SHOWN_SESSION_KEY/);
    assert.match(discovery, /contentIsReady \|\| displayTimer \|\| dialog\?\.open/);
});

test("session shown state is written only after the dialog opens", () => {
    const showDiscovery = discovery.slice(
        discovery.indexOf("function showDiscovery()"),
        discovery.indexOf("function rememberSuppression()")
    );
    assert.ok(showDiscovery.indexOf("dialog.showModal();") >= 0);
    assert.ok(
        showDiscovery.indexOf("dialog.showModal();") <
            showDiscovery.indexOf("sessionStorage.setItem(")
    );
    assert.match(showDiscovery, /try \{[\s\S]*dialog\.showModal\(\);[\s\S]*\} catch \{[\s\S]*return;/);
});

test("actions reuse the existing theme setter and honor suppression", () => {
    assert.match(theme, /window\.WaffleBerryTheme = Object\.freeze/);
    assert.match(discovery, /WaffleBerryTheme\?\.applyTheme\("dark"\)/);
    assert.match(theme, /localStorage\.setItem\([\s\S]*"waffleBerryTheme"/);
    assert.match(discovery, /dismissedCheckbox\?\.checked/);
    assert.match(discovery, /localStorage\.setItem\([\s\S]*DISMISSED_KEY/);
    assert.doesNotMatch(discovery, /apiRequest|fetch\s*\(/);
});

test("later login lifecycle resets only session suppression", () => {
    const resetPattern = /sessionStorage\.removeItem\([\s\S]*"waffleberryNightModeDiscoveryShownSession"/;
    assert.match(login, resetPattern);
    assert.match(auth, resetPattern);
    assert.doesNotMatch(auth, /localStorage\.removeItem\([\s\S]*waffleberryNightModeDiscoveryDismissed/);
});

test("dialog keyboard and focus behavior is accessible", () => {
    assert.match(discovery, /enterButton\?\.focus\(\)/);
    assert.match(discovery, /event\.key !== "Tab"/);
    assert.match(discovery, /event\.shiftKey/);
    assert.match(discovery, /dialog\?\.addEventListener\("cancel"/);
    assert.match(discovery, /returnFocusTarget[\s\S]*target\?\.focus\(\)/);
    assert.match(chat, /type="checkbox"/);
    assert.match(chat, /aria-label="Close Night Mode discovery"/);
});

test("pending discovery cancels for theme changes, sign-out, and unload", () => {
    assert.match(discovery, /"waffleberry:themechange"[\s\S]*cancelPendingDisplay\(\)/);
    assert.match(discovery, /"waffleberry:signout"[\s\S]*cancelPendingDisplay\(\)/);
    assert.match(discovery, /"pagehide"[\s\S]*cancelPendingDisplay\(\)/);
});

test("mobile and reduced-motion presentation remain usable", () => {
    assert.match(styles, /@media \(max-width: 480px\)[\s\S]*\.night-mode-discovery-actions[\s\S]*grid-template-columns: 1fr/);
    assert.match(styles, /\.night-mode-discovery-actions button\s*\{[\s\S]*min-height: 48px/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.night-mode-discovery-dialog\[open\][\s\S]*animation: none/);
});
