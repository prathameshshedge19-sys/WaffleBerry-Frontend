"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
    path.join(
        __dirname,
        "..",
        "js",
        "companion-identity.js"
    ),
    "utf8"
);


function identityContext({
    search = "",
    selected = null,
    active = null
} = {}) {
    const window = {
        location: { search },
        WaffleBerryLegacyState: {
            select(id) {
                return selected?.id === id
                    ? selected
                    : null;
            },
            getActive() {
                return active;
            }
        }
    };
    const context = {
        URLSearchParams,
        window
    };

    vm.runInNewContext(
        source,
        context,
        {
            filename:
                "js/companion-identity.js"
        }
    );

    return window
        .WaffleBerryCompanionIdentity;
}


test("uses the selected legacy as the companion identity", () => {
    const identity = identityContext({
        search: "?legacyId=legacy-1",
        selected: {
            id: "legacy-1",
            relationship: "Grandmother",
            displayName: "Granny"
        }
    });

    assert.equal(
        identity.getDisplayName(),
        "Granny"
    );
    assert.equal(
        identity.text(
            "{name} is thinking"
        ),
        "Granny is thinking"
    );
    assert.equal(
        identity.personalize(
            "Berry took too long."
        ),
        "Granny took too long."
    );
    assert.equal(
        identity.welcomeMessage(),
        "Hello.\n\nI’m Granny.\n\nI’m ready whenever you are."
    );
});


test("uses active session identity when the URL has no legacy ID", () => {
    const identity = identityContext({
        active: {
            id: "legacy-2",
            relationship: "Friend",
            displayName: "Sam"
        }
    });

    assert.equal(
        identity.getDisplayName(),
        "Sam"
    );
});


test("preserves Berry as the non-legacy chat fallback", () => {
    const identity = identityContext();

    assert.equal(
        identity.getDisplayName(),
        "Berry"
    );
    assert.equal(
        identity.personalize(
            "Berry is ready."
        ),
        "Berry is ready."
    );
});
