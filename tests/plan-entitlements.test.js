"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("authenticated user storage preserves the backend-owned plan", () => {
    const api = read("js/api.js");
    assert.match(api, /function storeAuthenticatedSession\(response\)[\s\S]*response\.user/);
    assert.doesNotMatch(api, /user\.plan\s*=|plan:\s*["'](?:free|plus|pro)["']/);
});

test("all quota modals render the actual backend plan dynamically", () => {
    const chat = read("js/chat.js");
    const live = read("js/live-call.js");
    const memory = read("js/legacy-details.js");
    assert.match(chat, /detail\?\.plan[\s\S]*Berry voice limit on your \$\{plan\} plan/);
    assert.match(chat, /detail\?\.plan[\s\S]*Chat on your \$\{plan\} plan/);
    assert.match(live, /quota\.plan[\s\S]*Live Call limit on your \$\{plan\} plan/);
    assert.match(memory, /detail\?\.plan[\s\S]*Your \$\{label\} plan has reached/);
});
