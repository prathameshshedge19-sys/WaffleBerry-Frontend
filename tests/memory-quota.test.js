"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const api = fs.readFileSync(path.join(root, "js", "api.js"), "utf8");
const page = fs.readFileSync(path.join(root, "legacy-details.html"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "js", "legacy-details.js"), "utf8");
const modal = fs.readFileSync(path.join(root, "js", "quota-modal.js"), "utf8");

test("memory quota 429 has a feature-specific API classification", () => {
    assert.match(api, /feature === "memory"[\s\S]*return "memory_quota_exceeded"/);
    assert.match(api, /function approveStoredMemory[\s\S]*\/approve/);
    assert.match(api, /waffleberry:memory-quota/);
});

test("explicit memory exhaustion uses the quota modal pattern without a reset", () => {
    assert.match(page, /id="memoryQuotaDialog"/);
    assert.match(page, /Memory space is full/);
    assert.match(page, /Your Free plan has reached its memory capacity/);
    assert.match(page, /href="plans\.html">View plans/);
    assert.match(page, /id="memoryQuotaKeepFree"[\s\S]*Keep using Free/);
    assert.doesNotMatch(page.match(/id="memoryQuotaDialog"[\s\S]*?<\/dialog>/)?.[0] || "", /reset|again at/i);
});

test("structured memory quota opens modal and Keep using Free dismisses it", () => {
    assert.match(dashboard, /kind === "memory_quota_exceeded"/);
    assert.match(dashboard, /showMemoryQuota[\s\S]*WaffleBerryQuotaModal\.open/);
    assert.match(dashboard, /bindDismissal[\s\S]*memoryQuotaKeepFree/);
    assert.match(modal, /dialog\.close\("dismissed"\)/);
    assert.match(dashboard, /addEventListener\("waffleberry:memory-quota"[\s\S]*showMemoryQuota/);
});

test("memory quota copy is UTF-8 and plans remain the existing placeholder", () => {
    const quota = page.match(/id="memoryQuotaDialog"[\s\S]*?<\/dialog>/)?.[0] || "";
    assert.doesNotMatch(quota, /â€™|â€œ|â€”|Ã¢/);
    assert.equal(fs.existsSync(path.join(root, "plans.html")), true);
});
