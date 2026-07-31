"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const storage = new Map();
const localStorageValues = new Map();

global.sessionStorage = {
    getItem(key) {
        return storage.get(key) || null;
    },
    setItem(key, value) {
        storage.set(key, value);
    },
    removeItem(key) {
        storage.delete(key);
    }
};
global.localStorage = {
    getItem(key) {
        return localStorageValues.get(key) || null;
    },
    setItem(key, value) {
        localStorageValues.set(key, value);
    },
    removeItem(key) {
        localStorageValues.delete(key);
    }
};
global.window = {};

const source = fs.readFileSync(
    path.join(
        __dirname,
        "..",
        "js",
        "legacy-state.js"
    ),
    "utf8"
);

vm.runInThisContext(source, {
    filename: "js/legacy-state.js"
});

test("creates and loads a session legacy", () => {
    storage.clear();
    window.WaffleBerryLegacyState
        .startDraft();

    const created =
        window.WaffleBerryLegacyState.create({
        relationship: "Grandmother",
        displayName: "Granny"
    });

    assert.equal(
        created.relationship,
        "Grandmother"
    );
    assert.equal(
        created.displayName,
        "Granny"
    );
    assert.ok(created.id);
    assert.ok(
        Date.parse(created.createdAt)
    );
    assert.deepEqual(
        window.WaffleBerryLegacyState.list(),
        [created]
    );
    assert.deepEqual(
        window.WaffleBerryLegacyState.get(
            created.id
        ),
        created
    );
});

test("same draft updates without creating a duplicate", () => {
    storage.clear();
    window.WaffleBerryLegacyState
        .startDraft();

    const first =
        window.WaffleBerryLegacyState.create({
            relationship: "Friend",
            displayName: "Sam"
        });
    const second =
        window.WaffleBerryLegacyState.create({
            relationship: "Friend",
            displayName: "Sammy"
        });

    assert.equal(second.id, first.id);
    assert.equal(
        second.createdAt,
        first.createdAt
    );
    assert.equal(
        window.WaffleBerryLegacyState
            .list().length,
        1
    );
    assert.equal(
        window.WaffleBerryLegacyState
            .list()[0].displayName,
        "Sammy"
    );
});

test("new drafts create separate legacies", () => {
    storage.clear();

    window.WaffleBerryLegacyState
        .startDraft();
    window.WaffleBerryLegacyState.create({
        relationship: "Mother",
        displayName: "Mum"
    });

    window.WaffleBerryLegacyState
        .startDraft();
    window.WaffleBerryLegacyState.create({
        relationship: "Father",
        displayName: "Dad"
    });

    assert.equal(
        window.WaffleBerryLegacyState
            .list().length,
        2
    );
});

test("selects an active legacy for the companion transition", () => {
    storage.clear();
    window.WaffleBerryLegacyState
        .startDraft();
    const created =
        window.WaffleBerryLegacyState.create({
            relationship: "Partner",
            displayName: "Alex"
        });

    assert.deepEqual(
        window.WaffleBerryLegacyState.select(
            created.id
        ),
        created
    );
    assert.deepEqual(
        window.WaffleBerryLegacyState
            .getActive(),
        created
    );
    assert.equal(
        window.WaffleBerryLegacyState.select(
            "missing"
        ),
        null
    );
});

test("rejects malformed session legacy collections", () => {
    storage.clear();
    storage.set(
        "waffleBerrySessionLegacies",
        JSON.stringify([
            {
                id: "invalid",
                relationship: 42,
                displayName: "Granny",
                createdAt:
                    new Date().toISOString()
            }
        ])
    );

    assert.deepEqual(
        window.WaffleBerryLegacyState.list(),
        []
    );
});

test("removes a legacy and clears it when active", () => {
    storage.clear();
    window.WaffleBerryLegacyState
        .startDraft();
    const created =
        window.WaffleBerryLegacyState.create({
            relationship: "Grandmother",
            displayName: "Granny"
        });

    window.WaffleBerryLegacyState.select(
        created.id
    );

    assert.equal(
        window.WaffleBerryLegacyState.remove(
            created.id
        ),
        true
    );
    assert.deepEqual(
        window.WaffleBerryLegacyState.list(),
        []
    );
    assert.equal(
        window.WaffleBerryLegacyState
            .getActive(),
        null
    );
    assert.equal(
        window.WaffleBerryLegacyState.remove(
            created.id
        ),
        false
    );
});

test("hydration replaces stale correlation-matched identity", async () => {
    storage.clear();
    localStorageValues.clear();
    storage.set(
        "waffleBerrySessionLegacies",
        JSON.stringify([
            {
                id: "browser-correlation",
                relationship: "Old relationship",
                displayName: "Old name",
                createdAt: new Date().toISOString(),
                backendLegacyId: null
            }
        ])
    );
    window.WaffleBerryApi = {
        listOwnedLegacies: async () => [
            {
                legacy_id: 42,
                client_correlation_id: "browser-correlation",
                display_name: "Authoritative name",
                relationship: "Mother",
                created_at: new Date().toISOString()
            }
        ]
    };

    const hydrated = await window.WaffleBerryLegacyState.hydratePersisted();

    assert.equal(hydrated.length, 1);
    assert.equal(hydrated[0].backendLegacyId, 42);
    assert.equal(hydrated[0].displayName, "Authoritative name");
    assert.equal(hydrated[0].relationship, "Mother");
});
