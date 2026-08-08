"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "chat.html"), "utf8");
const script = fs.readFileSync(path.join(root, "js/chat.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

test("chat more-options control is visible but natively disabled", () => {
    const control = html.match(
        /<button(?=[^>]*id="moreOptionsButton")[^>]*>[\s\S]*?<\/button>/
    )?.[0] || "";

    assert.match(control, /class="input-icon-button"/);
    assert.match(control, /type="button"/);
    assert.match(control, /aria-label="More options coming soon"/);
    assert.match(control, /title="More options coming soon"/);
    assert.match(control, /\sdisabled(?:\s|>)/);
    assert.doesNotMatch(script, /moreOptionsButton/);
    assert.match(styles, /\.input-icon-button:disabled[\s\S]*cursor:\s*default/);
    assert.match(styles, /\.input-icon-button:disabled[\s\S]*opacity:\s*0\.58/);
});
