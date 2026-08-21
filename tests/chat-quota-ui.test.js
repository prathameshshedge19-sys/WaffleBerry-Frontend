"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "chat.html"), "utf8");
const chat = fs.readFileSync(path.join(root, "js", "chat.js"), "utf8");
const api = fs.readFileSync(path.join(root, "js", "api.js"), "utf8");
const plans = fs.readFileSync(path.join(root, "plans.html"), "utf8");
const modal = fs.readFileSync(path.join(root, "js", "quota-modal.js"), "utf8");

test("Chat quota error maps to the dedicated modal contract", () => {
    assert.match(api, /data\?\.detail\?\.error/);
    assert.match(api, /return "chat_quota_exceeded"/);
    assert.match(chat, /error\.kind === "chat_quota_exceeded"/);
    assert.match(chat, /showChatQuotaDialog\(error\)/);
    assert.match(modal, /Intl\.DateTimeFormat/);
    assert.match(chat, /limit for Chat on your \$\{plan\} plan/);
    assert.match(chat, /detail\?\.resets_at/);
    assert.match(html, /id="chatQuotaDialog"[\s\S]*aria-modal="true"/);
    assert.match(chat, /Your other WaffleBerry features are still available/);
});

test("quota copy is UTF-8 and contains no mojibake", () => {
    assert.match(html, /<meta charset="UTF-8">/);
    assert.match(plans, /<meta charset="UTF-8">/);
    assert.doesNotMatch(api + chat + html + plans, /Ã|â|Â|ï¿½|�/);
});

test("quota modal branch is part of Chat submission failure handling", () => {
    const sendMessage = chat.slice(chat.indexOf("async function sendMessage"));
    assert.match(sendMessage, /catch \(error\)[\s\S]*error\.kind === "chat_quota_exceeded"[\s\S]*showChatQuotaDialog\(error\)/);
});

test("Chat quota is guarded from Berry assistant bubble rendering", () => {
    const inlineError = chat.slice(
        chat.indexOf("function appendInlineError"),
        chat.indexOf("function quotaDetail")
    );
    assert.match(inlineError, /chat_quota_exceeded[\s\S]*showChatQuotaDialog\(error\)[\s\S]*return/);
    assert.ok(inlineError.indexOf("return;") < inlineError.indexOf("createBerryMessage"));
    const sendMessage = chat.slice(chat.indexOf("async function sendMessage"));
    assert.match(sendMessage, /optimisticMessage\?\.remove\(\)[\s\S]*showChatQuotaDialog\(error\)/);
});

test("quota modal offers explicit plans and dismissal actions without counters", () => {
    assert.match(html, /href="plans\.html">View plans/);
    assert.match(html, /id="chatQuotaKeepFree"/);
    assert.match(chat, /bindDismissal\(chatQuotaDialog, chatQuotaKeepFree\)/);
    assert.doesNotMatch(html + chat, /messages remaining|\d+\s*\/\s*40 used|progress bar/i);
});

test("plans destination is the read-only plan comparison page", () => {
    assert.match(plans, /Choose your WaffleBerry plan/);
    assert.match(plans, /Free[\s\S]*Plus[\s\S]*Coming Soon[\s\S]*Pro/);
    assert.doesNotMatch(plans, /checkout|credit card|payment|price|\$/i);
});
