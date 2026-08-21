"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "quota-modal.js"), "utf8"
);

function load(document) {
    const window = {};
    vm.runInNewContext(source, { window, document, WeakMap, Date, Intl });
    return window.WaffleBerryQuotaModal;
}

test("shared plan formatter displays Free, Plus, and Pro naturally", () => {
    const modal = load({});
    assert.deepEqual(
        ["free", "plus", "pro"].map(modal.planName),
        ["Free", "Plus", "Pro"]
    );
});

test("daily reset uses localized tomorrow wording and never exposes ISO text", () => {
    const modal = load({});
    const now = new Date(2026, 7, 22, 10, 0, 0);
    const reset = new Date(2026, 7, 23, 0, 0, 0);
    const copy = modal.dailyAvailability(reset.toISOString(), now);
    assert.match(copy, /^Available again tomorrow at /);
    assert.doesNotMatch(copy, /2026-08-23T|UTC|Z$/);
});

test("opening focuses an action and dismissal restores the prior control", () => {
    let actionFocused = 0;
    let triggerFocused = 0;
    const trigger = { isConnected: true, focus() { triggerFocused += 1; } };
    const listeners = {};
    const dismissListeners = {};
    const dialog = {
        open: false, dataset: {},
        addEventListener(type, handler) { listeners[type] = handler; },
        querySelector() { return { focus() { actionFocused += 1; } }; },
        showModal() { this.open = true; },
        close() { this.open = false; listeners.close?.(); }
    };
    const dismiss = {
        addEventListener(type, handler) { dismissListeners[type] = handler; }
    };
    const modal = load({ activeElement: trigger });
    modal.bindDismissal(dialog, dismiss);
    modal.open(dialog);
    assert.equal(dialog.open, true);
    assert.equal(actionFocused, 1);
    dismissListeners.click();
    assert.equal(dialog.open, false);
    assert.equal(triggerFocused, 1);
    assert.equal(listeners.cancel, undefined, "native Escape dismissal remains enabled");
});

test("all four surfaces load one shared modal utility and expose no counters", () => {
    const root = path.join(__dirname, "..");
    const pages = ["chat.html", "live-call.html", "legacy-details.html"]
        .map((file) => fs.readFileSync(path.join(root, file), "utf8"));
    pages.forEach((page) => assert.match(page, /js\/quota-modal\.js/));
    const combined = pages.flatMap((page) =>
        [...page.matchAll(/<dialog[^>]*class="quota-modal"[\s\S]*?<\/dialog>/g)]
            .map((match) => match[0])
    ).join("\n");
    assert.doesNotMatch(combined, /\b\d+\s*\/\s*\d+\b|remaining usage|% used/i);
});
