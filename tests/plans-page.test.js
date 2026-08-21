"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "plans.html"), "utf8");
const source = fs.readFileSync(path.join(root, "js", "plans.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");

test("Plans page shows all three plans and exact capacity limits", () => {
    assert.match(html, /data-plan="free"[\s\S]*40 Chat messages per day[\s\S]*3 minutes of Live Call per day[\s\S]*10 Berry voice generations per day[\s\S]*100 memories per Legacy/);
    assert.match(html, /data-plan="plus"[\s\S]*120 Chat messages per day[\s\S]*9 minutes of Live Call per day[\s\S]*30 Berry voice generations per day[\s\S]*300 memories per Legacy/);
    assert.match(html, /data-plan="pro"[\s\S]*400 Chat messages per day[\s\S]*30 minutes of Live Call per day[\s\S]*100 Berry voice generations per day[\s\S]*1000 memories per Legacy/);
});

test("Voice Cloning display copy appears only on Plus and Pro", () => {
    const free = html.slice(html.indexOf('data-plan="free"'), html.indexOf('data-plan="plus"'));
    const plus = html.slice(html.indexOf('data-plan="plus"'), html.indexOf('data-plan="pro"'));
    const pro = html.slice(html.indexOf('data-plan="pro"'));
    assert.doesNotMatch(free, /Voice Cloning/);
    assert.match(plus, /2 minutes of Voice Cloning/);
    assert.match(pro, /20 minutes of Voice Cloning/);
});

test("Plus and Pro are non-mutating Coming Soon controls", () => {
    assert.equal((html.match(/Subscribe — Coming Soon/g) || []).length, 2);
    assert.equal((html.match(/disabled aria-disabled="true"/g) || []).length, 2);
    assert.doesNotMatch(source + html, /apiRequest|fetch\(|storeSession|storeAuthenticatedSession|user\.plan\s*=|method="post"/i);
});

test("page explains intelligence parity, Legacy return navigation, and no live counters", () => {
    assert.match(html, /same thoughtful Berry intelligence, memory, and personality/);
    assert.match(html, /equally intelligent on every plan/);
    assert.match(html, /href="legacy-dashboard\.html">← Back to Legacies/);
    assert.doesNotMatch(html, /href="chat\.html"/);
    assert.doesNotMatch(html, /\d+\s*\/\s*\d+|remaining|used today|usage progress/i);
});

test("current-plan rendering follows session data for Free, Plus, and Pro", () => {
    const listeners = {};
    const cards = ["free", "plus", "pro"].map((plan) => {
        const badge = { hidden: true };
        const attrs = {};
        return { dataset: { plan }, badge, attrs,
            classList: { toggle(name, value) { this[name] = value; } },
            setAttribute(name, value) { attrs[name] = value; },
            removeAttribute(name) { delete attrs[name]; },
            querySelector() { return badge; } };
    });
    const freeAction = { textContent: "" };
    const context = { window: { currentUserPromise: Promise.resolve({ plan: "free" }) },
        document: { addEventListener(type, callback) { listeners[type] = callback; },
            querySelectorAll() { return cards; }, querySelector() { return freeAction; } }, Set };
    context.window.window = context.window;
    vm.runInNewContext(source, context);

    for (const plan of ["free", "plus", "pro"]) {
        context.window.WaffleBerryPlans.showCurrentPlan({ plan });
        cards.forEach((card) => assert.equal(card.classList["is-current"], card.dataset.plan === plan));
        assert.equal(cards.find((card) => card.dataset.plan === plan).attrs["aria-current"], "true");
        assert.equal(freeAction.textContent, plan === "free" ? "Current Plan" : "Free Plan");
    }
});

test("Plans page has accessibility labels and a mobile layout", () => {
    assert.match(html, /<meta charset="UTF-8">/);
    assert.match(html, /aria-labelledby="plansTitle"/);
    assert.match(html, /aria-label="WaffleBerry plans"/);
    assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.plans-grid \{ grid-template-columns: 1fr/);
    assert.match(css, /\.plans-hero \{[\s\S]*margin: 0 auto 80px;[\s\S]*padding-top: 132px/);
    assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.plans-hero \{ padding-top: 108px; \}/);
    assert.doesNotMatch(css, /\.plans-hero \{[\s\S]{0,160}margin-top:/);
});

test("quota plan actions and the Legacy return control stay un-underlined in every state", () => {
    assert.match(css, /\.quota-modal-actions a:visited,[\s\S]*\.quota-modal-actions a:focus-visible \{[\s\S]*text-decoration: none/);
    assert.match(css, /\.plans-back-control:visited,[\s\S]*\.plans-back-control:focus-visible \{[\s\S]*text-decoration: none/);
    assert.match(css, /\.plans-back-control:hover \{[\s\S]*text-decoration: none;[\s\S]*transform:/);
    assert.match(html, /← Back to Legacies/);
});

test("Legacy return control sits outside header actions and Sign out stays unchanged", () => {
    const actionsStart = html.indexOf('<div class="navbar-actions">');
    const actions = html.slice(actionsStart, html.indexOf("</div>", actionsStart));
    const hero = html.slice(html.indexOf('<section class="plans-hero"'));
    assert.doesNotMatch(actions, /Back to Legacies|legacy-dashboard\.html/);
    assert.match(actions, /class="logout-button" href="\/" title="Sign out">Sign out/);
    assert.match(hero, /plans-back-control[\s\S]*legacy-dashboard\.html[\s\S]*Back to Legacies[\s\S]*plans-eyebrow[\s\S]*Choose your WaffleBerry plan/);
});

test("all quota modal View plans actions still target plans.html", () => {
    const pages = ["chat.html", "live-call.html", "legacy-details.html"]
        .map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
    assert.equal((pages.match(/href="plans\.html">View plans/g) || []).length, 5);
});
