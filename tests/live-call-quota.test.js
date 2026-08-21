"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const api = fs.readFileSync(path.join(root, "js", "api.js"), "utf8");
const call = fs.readFileSync(path.join(root, "js", "live-call.js"), "utf8");
const quotaModal = fs.readFileSync(path.join(root, "js", "quota-modal.js"), "utf8");
const html = fs.readFileSync(path.join(root, "live-call.html"), "utf8");
const chat = fs.readFileSync(path.join(root, "chat.html"), "utf8");

function quotaController(initialState = "listening") {
    const timers = [];
    const dialog = { open: false, dataset: {}, listeners: {},
        addEventListener(type, handler) { this.listeners[type] = handler; },
        querySelector() { return { focus() {} }; },
        showModal() { this.open = true; },
        close() { this.open = false; this.listeners.close?.(); } };
    const nodes = {
        liveCallQuotaDialog: dialog,
        liveCallQuotaDescription: { textContent: "" },
        liveCallQuotaAvailability: { textContent: "" },
        liveCallQuotaKeepFree: { textContent: "", addEventListener() {} },
        returnToChatTop: null
    };
    const document = {
        body: { dataset: {} }, visibilityState: "visible", activeElement: null,
        getElementById(id) { return nodes[id] || null; },
        addEventListener() {}, dispatchEvent() {}, querySelectorAll() { return []; }
    };
    const clock = {
        setTimeout(callback) { timers.push(callback); return timers.length; },
        clearTimeout() {}, setInterval() { return 1; }, clearInterval() {}
    };
    const window = {
        location: { hostname: "localhost", search: "", assign() {} },
        performance: { now: () => 1 }, addEventListener() {}, URL, ...clock
    };
    const sandbox = { window, document, navigator: {}, console, URLSearchParams, URL,
        Blob, Uint8Array, Float32Array, DataView, Set, Map, WeakMap, Promise, atob, btoa,
        Intl, Date,
        CustomEvent: class CustomEvent {} };
    vm.runInNewContext(quotaModal, sandbox);
    vm.runInNewContext(call, sandbox);
    const button = { disabled: false, addEventListener() {}, setAttribute() {}, lastElementChild: {} };
    const elements = { status: {}, timer: {}, microphoneStatus: {}, mute: button, speaker: button,
        end: button, controls: { hidden: false }, ended: { hidden: true, querySelector() { return null; } },
        endedTitle: {}, relationship: {}, outputAudio: null, realtimeOutput: null };
    const events = [];
    let endedCalls = 0;
    const controller = new window.WaffleBerryLiveCall.LiveCallController({
        elements, clock, legacy: {}, onEnded: () => { endedCalls += 1; },
        api: {
            reportLiveCallOperationalEvent: async (_id, event) => events.push(event),
            endLiveCallSession: async () => { events.push({ event: "delete" }); }
        }
    });
    controller.state = initialState;
    controller.session = { session_id: "quota-session", quota_plan: "free",
        quota_resets_at: "2026-08-22T00:00:00+02:00" };
    controller.stream = { getAudioTracks: () => [], getTracks: () => [] };
    controller.stopVad = controller.stopTurnMedia = controller.releaseMicrophone =
        controller.closeAudioContext = controller.stopRingback = controller.clearReconnectTimer =
        controller.stopHeartbeat = controller.stopTimer = () => {};
    controller.finishEnded = function () {
        this.state = "ended"; this.elements.controls.hidden = true;
        this.elements.ended.hidden = false; this.elements.endedTitle.textContent = "Call ended";
    };
    return { controller, dialog, nodes, timers, events, endedCalls: () => endedCalls };
}

test("Live Call quota has a feature-specific API classification", () => {
    assert.match(api, /feature === "live_call"[\s\S]*return "live_call_quota_exceeded"/);
    assert.match(api, /detail\?\.code[\s\S]*return data\.detail\.code/);
});

test("quota modal has reset copy and both required actions", () => {
    assert.match(html, /id="liveCallQuotaDialog"[\s\S]*aria-modal="true"/);
    assert.match(html, /href="plans\.html">View plans/);
    assert.match(html, /id="liveCallQuotaKeepFree"/);
    assert.match(quotaModal, /Intl\.DateTimeFormat/);
    assert.match(call, /Live Call limit on your \$\{plan\} plan/);
    assert.match(chat, /id="liveCallQuotaDialog"[\s\S]*href="plans\.html">View plans/);
});

test("connected allowance ends gracefully without a visible remaining counter", () => {
    assert.match(call, /available_seconds[\s\S]*reachQuotaLimit/);
    assert.match(call, /processing", "speaking", "greeting"[\s\S]*assistantSpeaking[\s\S]*performQuotaEnd/);
    assert.doesNotMatch(html, /remaining seconds|seconds remaining/i);
});

test("blocked startup shows quota modal and Keep using Free closes it", () => {
    assert.match(call, /error\?\.kind === "live_call_quota_exceeded"[\s\S]*showQuotaDialog/);
    assert.match(call, /bindDismissal[\s\S]*liveCallQuotaKeepFree/);
});

test("quota expiry during idle ends once and opens the modal after Call ended", async () => {
    const view = quotaController("listening");
    view.controller.reachQuotaLimit();
    await view.controller.quotaEndPromise;
    assert.equal(view.controller.state, "ended");
    assert.equal(view.dialog.open, true);
    assert.equal(view.events.filter((event) => event.event === "delete").length, 1);
    assert.match(view.nodes.liveCallQuotaAvailability.textContent, /Available again/);
});

test("quota expiry while Berry speaks waits for the current answer", async () => {
    const view = quotaController("speaking");
    view.controller.reachQuotaLimit();
    assert.equal(view.controller.state, "speaking");
    assert.equal(view.dialog.open, false);
    view.controller.state = "listening";
    view.timers.shift()();
    await view.controller.quotaEndPromise;
    assert.equal(view.controller.state, "ended");
    assert.equal(view.dialog.open, true);
});

test("repeated quota termination finalizes the call exactly once", async () => {
    const view = quotaController();
    await Promise.all([
        view.controller.performQuotaEnd(), view.controller.performQuotaEnd()
    ]);
    assert.equal(view.events.filter((event) => event.event === "call_ended").length, 1);
    assert.equal(view.events.filter((event) => event.event === "delete").length, 1);
});

test("post-call Return to Chat remains active after quota end", async () => {
    const view = quotaController();
    await view.controller.performQuotaEnd();
    await view.controller.end();
    assert.equal(view.endedCalls(), 1);
    assert.equal(view.dialog.open, false);
});

test("Keep using Free dismisses the top-layer dialog with no backdrop", () => {
    assert.match(quotaModal, /dismissButton\?\.addEventListener\("click"[\s\S]*dialog\.close/);
    assert.doesNotMatch(call, /liveCallQuotaKeepFree[\s\S]{0,300}(hidden|pointerEvents|inert)\s*=/);
});

test("View plans uses the existing plans placeholder", () => {
    assert.match(chat, /id="liveCallQuotaDialog"[\s\S]*href="plans\.html">View plans/);
    assert.equal(fs.existsSync(path.join(root, "plans.html")), true);
});

test("quota exhaustion never enters generic interruption recovery", () => {
    const branch = call.slice(call.indexOf("reachQuotaLimit()"), call.indexOf("toggleMute()"));
    assert.doesNotMatch(branch, /recoverTurn|recoverResponse|interrupted|Something interrupted/);
    assert.match(branch, /completed_normally/);
});
