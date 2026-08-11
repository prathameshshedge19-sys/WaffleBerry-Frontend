"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

test("runtime config preserves local backend development", () => {
    const context = {
        window: {
            location: { hostname: "localhost" }
        }
    };
    vm.runInNewContext(
        fs.readFileSync(path.join(root, "js", "config.js"), "utf8"),
        context
    );

    assert.equal(
        context.window.WAFFLEBERRY_API_BASE_URL,
        "http://127.0.0.1:8000/api/v1"
    );
});

for (const hostname of ["waffleberry.app", "www.waffleberry.app"]) {
    test(`runtime config uses the production backend on ${hostname}`, () => {
        const context = {
            window: {
                location: { hostname }
            }
        };
        vm.runInNewContext(
            fs.readFileSync(path.join(root, "js", "config.js"), "utf8"),
            context
        );

        assert.equal(
            context.window.WAFFLEBERRY_API_BASE_URL,
            "https://89-167-14-211.sslip.io/api/v1"
        );
    });
}

test("every API-backed page loads runtime config before api.js", () => {
    const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith(".html"));

    for (const name of htmlFiles) {
        const source = fs.readFileSync(path.join(root, name), "utf8");
        const apiIndex = source.search(/src="js\/api\.js(?:\?[^\"]*)?"/);
        if (apiIndex === -1) {
            continue;
        }
        const configIndex = source.search(/src="js\/config\.js(?:\?[^\"]*)?"/);
        assert.ok(configIndex !== -1 && configIndex < apiIndex, name);
    }
});
