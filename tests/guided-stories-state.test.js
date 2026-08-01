"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const storage = new Map();

global.sessionStorage = {
    getItem(key) {
        return storage.get(key) || null;
    },
    setItem(key, value) {
        storage.set(key, value);
    }
};
global.window = {
    WaffleBerryApi: {
        getStoredUser() {
            return {
                user_id: 42
            };
        }
    }
};

const source = fs.readFileSync(
    path.join(
        __dirname,
        "..",
        "js",
        "guided-stories-state.js"
    ),
    "utf8"
);

vm.runInThisContext(source, {
    filename:
        "js/guided-stories-state.js"
});

test("starts a chapter without completing it", () => {
    storage.clear();

    const progress =
        window.WaffleBerryGuidedStoriesState
            .markInProgress(
                "legacy-one",
                "childhood"
            );

    assert.deepEqual(progress, {
        status: "in-progress",
        text: "",
        replies: [],
        messages: []
    });
    assert.equal(
        window.WaffleBerryGuidedStoriesState
            .hasProgress("legacy-one"),
        true
    );
});

test("saves chapter text as completed", () => {
    storage.clear();

    const progress =
        window.WaffleBerryGuidedStoriesState
            .save(
                "legacy-one",
                "childhood",
                "  My childhood story.  "
            );

    assert.deepEqual(progress, {
        status: "completed",
        text: "My childhood story.",
        replies: [
            "My childhood story."
        ],
        messages: []
    });
});

test("stores temporary Story Guide conversation messages", () => {
    storage.clear();
    const stories =
        window.WaffleBerryGuidedStoriesState;

    stories.markInProgress(
        "legacy-one",
        "childhood"
    );
    stories.appendMessage(
        "legacy-one",
        "childhood",
        "user",
        "We lived near the hills."
    );
    const progress =
        stories.appendMessage(
            "legacy-one",
            "childhood",
            "assistant",
            "What do you remember most?"
        );

    assert.deepEqual(
        progress.messages,
        [
            {
                role: "user",
                content:
                    "We lived near the hills."
            },
            {
                role: "assistant",
                content:
                    "What do you remember most?"
            }
        ]
    );
});

test("completes after the final scripted prompt", () => {
    storage.clear();
    const stories =
        window.WaffleBerryGuidedStoriesState;

    stories.addReply(
        "legacy-one",
        "childhood",
        "First memory",
        2
    );
    const completed =
        stories.addReply(
            "legacy-one",
            "childhood",
            "Second memory",
            2
        );

    assert.equal(
        completed.status,
        "completed"
    );
    assert.deepEqual(
        completed.replies,
        [
            "First memory",
            "Second memory"
        ]
    );
});

test("keeps temporary progress isolated by legacy", () => {
    storage.clear();

    window.WaffleBerryGuidedStoriesState
        .save(
            "legacy-one",
            "career",
            "A first job."
        );

    assert.deepEqual(
        window.WaffleBerryGuidedStoriesState
            .load("legacy-two"),
        {}
    );
});

test("rejects malformed temporary progress", () => {
    storage.clear();
    storage.set(
        "waffleBerryGuidedStories:42:legacy-one",
        JSON.stringify({
            childhood: {
                status: "unknown",
                text: 42
            }
        })
    );

    assert.deepEqual(
        window.WaffleBerryGuidedStoriesState
            .load("legacy-one"),
        {}
    );
});

test("rehydrates persisted chapters and does not retain empty stale state", () => {
    storage.clear();
    const stories = window.WaffleBerryGuidedStoriesState;
    stories.markInProgress("legacy-one", "career");

    const state = stories.replaceFromPersisted("legacy-one", [{
        story_session_id: 73,
        chapter_key: "childhood",
        status: "completed",
        messages: [
            { role: "user", content: "  We lived near the hills.  " },
            { role: "assistant", content: "What happened next?" }
        ]
    }]);

    assert.equal(state.career, undefined);
    assert.deepEqual(state.childhood, {
        status: "completed",
        text: "We lived near the hills.",
        replies: ["We lived near the hills."],
        messages: [
            { role: "user", content: "We lived near the hills." },
            { role: "assistant", content: "What happened next?" }
        ],
        backendStorySessionId: 73
    });
});
