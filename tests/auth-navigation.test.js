"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const auth = read("js/auth.js");
const login = read("login.html");
const landing = read("index.html");
const styles = read("css/style.css");

test("logout clears the existing session before scheduling its redirect", () => {
    const logout = auth.match(/function logout\(\) \{[\s\S]*?\n\}/)?.[0] || "";
    assert.ok(logout.indexOf("clearStoredSession();") >= 0);
    assert.ok(logout.indexOf("clearStoredSession();") < logout.indexOf("window.setTimeout"));
});

test("logout feedback redirects to the public landing page after one second", () => {
    assert.match(auth, /window\.location\.replace\("\/"\)/);
    assert.match(auth, /"Signed out successfully\."/);
    assert.match(auth, /window\.setTimeout\([\s\S]*redirectToLandingPage,[\s\S]*1000/);
    assert.match(styles, /\.logout-success-toast/);
    assert.match(styles, /pointer-events:\s*none/);
});

test("protected-page validation still redirects invalid sessions to login", () => {
    assert.match(auth, /function clearInvalidSession\(\)[\s\S]*clearStoredSession\(\);[\s\S]*redirectToLogin\(\)/);
    assert.match(auth, /window\.location\.replace\("login\.html"\)/);
});

test("primary authenticated sign-out links have a landing-page fallback", () => {
    for (const name of ["home.html", "chat.html", "mission.html"]) {
        const html = read(name);
        assert.match(html, /class="logout-button"[\s\S]*?href="\/"/, name);
    }
});

test("login provides an accessible return to the public home page", () => {
    assert.match(login, /class="auth-home-link"[\s\S]*href="\/"/);
    assert.match(login, /Back to Home/);
    assert.match(styles, /\.auth-home-link:focus-visible/);
});

test("landing-page sign-in navigation remains on login.html", () => {
    assert.match(landing, /href="login\.html">Sign In<\/a>/);
});

test("logout uses history replacement rather than adding an authenticated back entry", () => {
    assert.match(auth, /function redirectToLandingPage\(\) \{[\s\S]*window\.location\.replace\("\/"\)/);
    assert.doesNotMatch(auth, /window\.location\.(?:href|assign)\s*=?\s*"\/"/);
});
