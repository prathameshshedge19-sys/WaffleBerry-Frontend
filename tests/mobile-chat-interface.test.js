"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const chat = fs.readFileSync(path.join(root, "chat.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");
const chatScript = fs.readFileSync(path.join(root, "js", "chat.js"), "utf8");

test("mobile conversation drawer markup exists", () => {
    assert.match(chat, /id="conversationDrawer"/);
    assert.match(chat, /id="conversationDrawerBackdrop"/);
    assert.match(chat, /id="mobileDrawerCloseButton"/);
});

test("mobile chat top bar exists", () => {
    assert.match(chat, /class="mobile-chat-topbar"/);
    assert.match(chat, /id="mobileConversationTitle"/);
    assert.match(chat, /id="mobileNewChatButton"/);
});

test("the single conversation list is reused inside the drawer", () => {
    assert.equal((chat.match(/id="conversationList"/g) || []).length, 1);
    assert.match(
        chat,
        /id="conversationDrawer"[\s\S]*id="conversationList"/
    );
    assert.match(styles, /\.conversation-drawer\s*\{[\s\S]*translateX\(-105%\)/);
});

test("drawer controls expose accessible state and labels", () => {
    assert.match(chat, /aria-expanded="false"/);
    assert.match(chat, /aria-controls="conversationDrawer"/);
    assert.match(chat, /aria-label="Open conversations"/);
    assert.match(chat, /aria-label="Close conversations"/);
    assert.match(chatScript, /event\.key === "Escape"/);
});

test("existing chat and API scripts remain loaded", () => {
    assert.match(chat, /src="js\/config\.js"/);
    assert.match(chat, /src="js\/api\.js"/);
    assert.match(chat, /src="js\/auth\.js"/);
    assert.match(chat, /src="js\/chat\.js"/);
});

test("existing message form identifiers remain unchanged", () => {
    assert.match(chat, /id="chatForm"/);
    assert.match(chat, /id="chatMessages"/);
    assert.match(chat, /id="chatInput"/);
    assert.match(chat, /id="sendButton"/);
});

test("existing conversation creation and deletion controls remain present", () => {
    assert.match(chat, /id="newChatButton"/);
    assert.match(chat, /id="clearChatButton"/);
    assert.match(chatScript, /newChatButton\?\.addEventListener\(/);
    assert.match(chatScript, /clearChatButton\?\.addEventListener\(/);
});

test("mobile chat layout includes safe-area support", () => {
    for (const inset of ["top", "bottom", "left", "right"]) {
        assert.match(styles, new RegExp(`env\\(safe-area-inset-${inset}\\)`));
    }
    assert.match(
        styles,
        /padding:\s*6px\s*7px\s*calc\(12px \+ env\(safe-area-inset-bottom\)\)/
    );
});

test("mobile chat uses the dynamic viewport height", () => {
    assert.match(styles, /height:\s*100dvh/);
    assert.match(styles, /height:\s*100vh/);
    assert.match(styles, /body\.chat-page[\s\S]*overflow:\s*hidden/);
});

test("desktop chat structure remains outside the mobile override", () => {
    const mobileOverride = styles.indexOf("Mobile chat application shell");
    assert.ok(mobileOverride > 0);
    assert.ok(styles.indexOf("grid-template-columns: 280px minmax(0, 1fr)") < mobileOverride);
    assert.ok(styles.indexOf("height: 680px") < mobileOverride);
    assert.match(styles.slice(mobileOverride), /@media \(max-width: 768px\)/);
});
