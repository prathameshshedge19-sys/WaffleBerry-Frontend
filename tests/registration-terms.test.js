"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("registration offers explicit unchecked terms consent", () => {
    const html = read("login.html");
    const checkbox = html.match(/<input\s+id="termsAgreementInput"[\s\S]*?>/);
    assert.ok(checkbox);
    assert.match(checkbox[0], /type="checkbox"/);
    assert.doesNotMatch(checkbox[0], /\bchecked\b/);
    assert.match(html, /<label for="termsAgreementInput">/);
    assert.match(html, /href="terms\.html"[\s\S]*target="_blank"/);
});

test("registration blocks missing consent and sends accepted terms", () => {
    const login = read("js/login.js");
    assert.match(login, /!termsAgreementInput\.checked/);
    assert.match(login, /Please accept the Terms & Conditions to continue\./);
    assert.match(login, /body:\s*\{[\s\S]*accepted_terms:\s*true/);
    assert.match(login, /await authenticateUser\(email, password\)/);
});

test("terms page contains the complete six-section beta notice", () => {
    const html = read("terms.html");
    assert.match(html, /<meta charset="UTF-8">/);
    assert.match(html, /WaffleBerry Beta/);
    assert.match(html, /Last updated: August 2026/);
    for (const heading of [
        "1. Beta Service",
        "2. AI-Generated Responses",
        "3. Your Memories and Content",
        "4. Voice and Likeness",
        "5. Acceptable Use",
        "6. Service Availability and Changes",
    ]) {
        assert.match(html, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.equal((html.match(/<section>/g) || []).length, 6);
    assert.match(html, /By creating a WaffleBerry account, you confirm that you have read and agree to these Terms &amp; Conditions\./);
});

test("terms controls retain visible keyboard focus treatment", () => {
    const css = read("css/style.css");
    assert.match(css, /\.terms-agreement input:focus-visible/);
    assert.match(css, /\.terms-agreement a:focus-visible/);
    assert.match(css, /\.terms-return:focus-visible/);
});
