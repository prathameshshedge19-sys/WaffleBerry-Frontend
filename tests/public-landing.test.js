"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const index = read("index.html");
const login = read("login.html");

test("public homepage is indexable and has the production canonical", () => {
    assert.doesNotMatch(index, /http-equiv=["']refresh["']/i);
    assert.match(index, /<meta name="robots" content="index, follow">/);
    assert.match(index, /<link rel="canonical" href="https:\/\/www\.waffleberry\.app\/">/);
});

test("public homepage consistently uses the WaffleBerry brand", () => {
    assert.match(index, />WaffleBerry</);
    assert.doesNotMatch(index, /Waffle Berry/i);
});

test("public product calls to action require login", () => {
    for (const label of ["Explore Legacy Builder", "Explore Creative Studio"]) {
        const escaped = label.replace(/ /g, "\\s+");
        assert.match(index, new RegExp(`href="login\\.html"[^>]*>${escaped}`));
    }
});

test("public navigation links to home, mission, contact and sign in", () => {
    const navigation = index.match(
        /<nav class="public-nav-links"[\s\S]*?<\/nav>/
    )?.[0] || "";

    assert.match(navigation, /href="#home">Home<\/a>/);
    assert.match(navigation, /href="#mission">Mission<\/a>/);
    assert.match(navigation, /href="#contact">Contact<\/a>/);
    assert.match(navigation, /href="login\.html">Sign In<\/a>/);
    assert.doesNotMatch(navigation, />Products<\/a>/);
    assert.match(index, /class="public-section public-contact" id="contact"/);
});

test("landing navigation preserves smooth scrolling and mobile menu behavior", () => {
    const styles = read("css/landing.css");
    const script = read("js/landing.js");

    assert.equal(
        (styles.match(/scroll-behavior\s*:\s*smooth/g) || []).length,
        1
    );
    assert.match(styles, /html\s*\{\s*scroll-behavior\s*:\s*smooth/);
    assert.match(index, /aria-controls="public-navigation"/);
    assert.match(script, /navigation\.classList\.remove\("is-open"\)/);
});

test("public homepage does not load authentication code", () => {
    assert.doesNotMatch(index, /(?:auth|api|config)\.js/);
    assert.match(index, /src="js\/landing\.js"/);
});

test("login page is noindex without changing its functional markup", () => {
    assert.match(login, /<meta name="robots" content="noindex, follow">/);
    for (const marker of ['id="loginForm"', 'id="emailInput"', 'id="passwordInput"', 'id="createAccountButton"', 'src="js\/login.js"']) {
        assert.match(login, new RegExp(marker));
    }
});

test("sitemap and robots advertise the production homepage", () => {
    assert.match(read("sitemap.xml"), /<loc>https:\/\/www\.waffleberry\.app\/<\/loc>/);
    assert.match(read("robots.txt"), /Allow: \/[\s\S]*Sitemap: https:\/\/www\.waffleberry\.app\/sitemap\.xml/);
});

test("all local homepage assets exist", () => {
    const references = [...index.matchAll(/(?:src|href)="((?:assets|css|js)\/[^"]+)"/g)].map((match) => match[1]);
    assert.ok(references.length > 0);
    for (const reference of references) {
        assert.ok(fs.existsSync(path.join(root, reference)), reference);
    }
});
