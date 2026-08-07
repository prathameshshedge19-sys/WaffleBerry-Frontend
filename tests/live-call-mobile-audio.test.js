"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js", "live-call.js"), "utf8");
const markup = fs.readFileSync(path.join(root, "live-call.html"), "utf8");
const chat = fs.readFileSync(path.join(root, "chat.html"), "utf8");
const chatScript = fs.readFileSync(path.join(root, "js", "chat.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");

function loadController() {
    const document = {
        body: { dataset: {} },
        visibilityState: "visible",
        addEventListener() {},
        dispatchEvent() {},
        getElementById() { return null; },
        querySelectorAll() { return []; }
    };
    const window = {
        location: { hostname: "example.com", search: "", assign() {} },
        performance: { now: () => 1 },
        addEventListener() {},
        URL,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval
    };
    const sandbox = {
        window, document, navigator: {}, console, URLSearchParams, URL, Blob,
        Uint8Array, Float32Array, DataView, Set, Map, Promise,
        atob, btoa, CustomEvent: class CustomEvent {}
    };
    vm.runInNewContext(source, sandbox);
    return { Controller: window.WaffleBerryLiveCall.LiveCallController, document };
}

function elements() {
    const button = () => ({
        disabled: false, hidden: false, lastElementChild: { textContent: "" },
        setAttribute() {}, focus() {}
    });
    return {
        status: { textContent: "" }, timer: { textContent: "" },
        microphoneStatus: { textContent: "" }, mute: button(), speaker: button(),
        end: button(), controls: { hidden: false },
        ended: { hidden: true, querySelector() { return null; } },
        relationship: { textContent: "" }, endedTitle: { textContent: "" },
        settingsButton: button(), settingsDialog: { open: false },
        settingsForm: {}, settingsClose: button(), settingsStatus: { textContent: "" },
        currentVoice: { textContent: "" }, voiceOptions: {},
        audioUnlock: { hidden: true, focus() {} }
    };
}

function audioContext(initialState = "running") {
    let allowResume = initialState === "running";
    let sourceStarts = 0;
    const context = {
        state: initialState, currentTime: 0, sampleRate: 48000, destination: {},
        resumeCalls: 0, closeCalls: 0,
        allowResume() { allowResume = true; },
        async resume() {
            this.resumeCalls += 1;
            if (allowResume) this.state = "running";
        },
        async close() { this.closeCalls += 1; this.state = "closed"; },
        addEventListener() {},
        createGain() {
            return { gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} };
        },
        createOscillator() {
            return { type: "", frequency: { value: 0 }, connect() {}, disconnect() {}, start() { sourceStarts += 1; }, stop() {} };
        },
        createAnalyser() { return { fftSize: 0, smoothingTimeConstant: 0, getFloatTimeDomainData() {} }; },
        createMediaStreamSource() { return { connect() {}, disconnect() {} }; },
        createBuffer(_channels, length, rate) { return { duration: length / rate, copyToChannel() {} }; },
        createBufferSource() {
            return { buffer: null, connect() {}, disconnect() {}, addEventListener() {}, start() { sourceStarts += 1; }, stop() {} };
        },
        starts() { return sourceStarts; }
    };
    return context;
}

function makeController(context, AudioClass = class {
    play() { return Promise.resolve(); }
    pause() {}
}) {
    const { Controller, document } = loadController();
    let contexts = 0;
    const controller = new Controller({
        legacy: { backendLegacyId: 1, relationship: "Grandmother" },
        mediaDevices: {}, WebSocketClass: class {}, MediaRecorderClass: class {},
        AudioContextClass: class { constructor() { contexts += 1; return context; } },
        AudioClass, elements: elements(), debugAudio: true,
        clock: {
            setTimeout() { return 1; }, clearTimeout() {},
            setInterval() { return 1; }, clearInterval() {}
        },
        performance: { now: () => 10 }, URLClass: { createObjectURL: () => "blob:test", revokeObjectURL() {} }
    });
    return { controller, document, contexts: () => contexts };
}

test("automatic desktop audio remains seamless and uses one authoritative context", async () => {
    const context = audioContext("running");
    const fixture = makeController(context);
    assert.equal(await fixture.controller.ensureAudioReady(), true);
    fixture.controller.startRingback();
    fixture.controller.stream = {};
    await fixture.controller.initializeVad();
    assert.equal(fixture.contexts(), 1);
    assert.equal(fixture.controller.elements.audioUnlock.hidden, true);
    assert.equal(context.starts(), 2);
});

test("suspended mobile audio shows one accessible activation and starts after one tap", async () => {
    const context = audioContext("suspended");
    const fixture = makeController(context);
    const ready = fixture.controller.ensureAudioReady();
    await new Promise(setImmediate);
    assert.equal(fixture.controller.elements.audioUnlock.hidden, false);
    assert.equal(fixture.controller.elements.status.textContent, "Ready when you are");
    context.allowResume();
    assert.equal(await fixture.controller.activateAudio(), true);
    assert.equal(await ready, true);
    assert.equal(context.state, "running");
    assert.equal(fixture.controller.elements.audioUnlock.hidden, true);
    fixture.controller.startRingback();
    assert.equal(context.starts(), 2);
});

test("call startup initializes microphone, session, and transport before sound unlock", async () => {
    const context = audioContext("suspended");
    const fixture = makeController(context);
    let microphoneRequests = 0;
    let sessions = 0;
    let transports = 0;
    fixture.controller.mediaDevices = {
        async getUserMedia() {
            microphoneRequests += 1;
            return { getTracks: () => [], getAudioTracks: () => [] };
        }
    };
    fixture.controller.api = {
        async createLiveCallSession() { sessions += 1; return { session_id: 1 }; },
        async endLiveCallSession() {}
    };
    fixture.controller.initializeVad = async () => {};
    fixture.controller.connectTransport = () => { transports += 1; };
    const starting = fixture.controller.start();
    await starting;
    await new Promise(setImmediate);
    assert.equal(microphoneRequests, 1);
    assert.equal(sessions, 1);
    assert.equal(transports, 1);
    assert.equal(context.starts(), 0);
    assert.equal(fixture.controller.state, "connecting");
    assert.equal(fixture.controller.elements.audioUnlock.hidden, false);
    context.allowResume();
    await fixture.controller.activateAudio();
    assert.equal(microphoneRequests, 1);
    assert.equal(sessions, 1);
    assert.equal(transports, 1);
    assert.equal(context.starts(), 2);
});

test("HTMLAudio activation rejection is retained and retried exactly once", async () => {
    const context = audioContext("running");
    const fixture = makeController(context);
    let plays = 0;
    const media = { play() { plays += 1; return Promise.resolve(); } };
    fixture.controller.handleBlockedMediaPlayback(
        { name: "NotAllowedError" }, media, () => assert.fail("response was discarded")
    );
    assert.equal(fixture.controller.elements.audioUnlock.hidden, false);
    assert.equal(await fixture.controller.activateAudio(), true);
    assert.equal(plays, 1);
    assert.equal(fixture.controller.pendingBlockedPlayback, null);
});

test("streaming PCM waits for a running context and preserves queued playback", async () => {
    const context = audioContext("suspended");
    const fixture = makeController(context);
    fixture.controller.activeTurnId = 7;
    const queued = fixture.controller.queuePcmChunk({
        turn_id: 7, data: btoa("\u0000\u0000"), sample_rate: 24000
    });
    await new Promise(setImmediate);
    assert.equal(context.starts(), 0);
    assert.equal(fixture.controller.elements.audioUnlock.hidden, false);
    context.allowResume();
    await fixture.controller.activateAudio();
    await queued;
    assert.equal(context.starts(), 1);
    assert.equal(fixture.controller.pcmPlaybackTurn, 7);
});

test("speaker defaults on, suppresses PCM when off, and restores output on gesture", async () => {
    const context = audioContext("running");
    const fixture = makeController(context);
    assert.equal(fixture.controller.speakerEnabled, true);
    await fixture.controller.toggleSpeaker();
    assert.equal(fixture.controller.speakerEnabled, false);
    fixture.controller.activeTurnId = 9;
    await fixture.controller.playPcmChunk({ turn_id: 9, data: btoa("\u0000\u0000") });
    assert.equal(context.starts(), 0);
    context.state = "interrupted";
    context.allowResume();
    await fixture.controller.toggleSpeaker();
    assert.equal(fixture.controller.speakerEnabled, true);
    assert.equal(context.state, "running");
});

test("visibility recovery is bounded and navigation cleanup closes the shared context", async () => {
    const context = audioContext("interrupted");
    const fixture = makeController(context);
    fixture.controller.getAudioContext();
    context.allowResume();
    await fixture.controller.recoverAudioAfterVisibility();
    assert.equal(context.state, "running");
    fixture.controller.cleanupForNavigation();
    await Promise.resolve();
    assert.equal(context.closeCalls, 1);
    assert.equal(fixture.controller.audioContext, null);
});

test("audio unlock UI remains mobile-safe, keyboard visible, and motion safe", () => {
    assert.match(markup, /id="liveCallAudioUnlock"[\s\S]*type="button"[\s\S]*aria-label="Enable Live Call sound"[\s\S]*Tap for sound/);
    assert.doesNotMatch(markup, /Tap to start call/);
    assert.match(markup, /aria-describedby="liveCallStatus"/);
    assert.match(styles, /\.live-call-audio-unlock[\s\S]*min-height:\s*48px/);
    assert.match(styles, /\.live-call-audio-unlock:focus-visible/);
    assert.match(styles, /@media \(max-width: 650px\)[\s\S]*\.live-call-audio-unlock[\s\S]*min-height:\s*48px/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.live-call-audio-unlock/);
});

test("normal product entry mounts one shared controller without document navigation", () => {
    assert.match(chat, /id="liveCallOverlay"[\s\S]*class="live-call-overlay"[\s\S]*id="liveCallEndButton"/);
    assert.match(chat, /src="js\/live-call\.js"[\s\S]*src="js\/chat\.js"/);
    assert.match(scriptForSharedController(), /LiveCallController, mountLiveCall/);
    assert.match(chatScript, /window\.WaffleBerryLiveCall\.mountLiveCall\(/);
    assert.match(chatScript, /event\.preventDefault\(\);[\s\S]*openInPageLiveCall\(button\)/);
    assert.doesNotMatch(chatScript, /window\.location\.(assign|replace)\([^)]*live-call/);
});

test("original Call click unlocks audio before call start and exposes no second tap", () => {
    const open = chatScript.slice(
        chatScript.indexOf("function openInPageLiveCall"),
        chatScript.indexOf("window.addEventListener(\"popstate\"")
    );
    const prepare = chatScript.slice(
        chatScript.indexOf("function prepareInPageLiveCall"),
        chatScript.indexOf("function openInPageLiveCall")
    );
    assert.match(prepare, /allowAudioUnlockPrompt:\s*false/);
    assert.match(prepare, /inPageLiveCall\.primeAudioFromGesture\(\)/);
    assert.doesNotMatch(prepare.slice(0, prepare.indexOf("primeAudioFromGesture")), /await|Promise|setTimeout|import\(/);
    assert.ok(open.indexOf("prepareInPageLiveCall()") < open.indexOf("inPageLiveCall.start()"));
    assert.doesNotMatch(chat, /Tap for sound|Tap to start call/);
});

test("strict mobile gesture priming starts silent WebAudio and HTMLAudio synchronously", async () => {
    const context = audioContext("suspended");
    const fixture = makeController(context);
    context.allowResume();
    const prime = fixture.controller.primeAudioFromGesture();
    assert.equal(context.starts(), 1);
    assert.equal(fixture.contexts(), 1);
    assert.equal(await prime, true);
    fixture.controller.startRingback();
    assert.equal(fixture.contexts(), 1);
    assert.equal(context.starts(), 3);
    const fields = fixture.controller.audioDiagnostics.map(({ field }) => field);
    for (const field of [
        "call_gesture_received", "audio_context_created_in_gesture",
        "silent_buffer_started_in_gesture", "html_audio_prime_started_in_gesture",
        "audio_context_post_prime_state", "html_audio_prime_success", "audio_unlock_verified"
    ]) assert.ok(fields.includes(field), field);
});

test("temporarily suspended context gets a bounded verification window", async () => {
    const context = audioContext("suspended");
    const fixture = makeController(context);
    fixture.controller.clock.setTimeout = (callback, delay) => {
        if (delay === 30) {
            context.state = "running";
            queueMicrotask(callback);
        }
        return 1;
    };
    const verified = await fixture.controller.primeAudioFromGesture();
    assert.equal(verified, true);
    assert.equal(fixture.controller.intentionalEnd, false);
    assert.equal(fixture.controller.audioDiagnostics.some(
        ({ field, value }) => field === "audio_unlock_verified" && value === true
    ), true);
});

test("pointerdown primes once, click launches once, and keyboard click remains supported", () => {
    assert.match(chatScript, /addEventListener\("pointerdown"[\s\S]*prepareInPageLiveCall\(\)/);
    assert.match(chatScript, /if \(inPageLiveCall[\s\S]*return inPageLiveCall/);
    assert.match(chatScript, /addEventListener\("click"[\s\S]*openInPageLiveCall\(button\)/);
    assert.match(chatScript, /if \(!liveCallContextReady \|\| liveCallOpen\) return/);
});

test("full-screen call preserves Chat and history while End and Back cleanly exit", () => {
    assert.match(styles, /\.live-call-overlay\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*z-index:\s*3000/);
    assert.match(styles, /\.live-call-overlay\s*\{[\s\S]*height:\s*100dvh/);
    assert.match(styles, /\.live-call-overlay[\s\S]*env\(safe-area-inset-top\)[\s\S]*env\(safe-area-inset-bottom\)/);
    assert.match(styles, /body\.dark-mode \.live-call-overlay/);
    assert.match(chatScript, /chatWebsite\.inert = true/);
    assert.match(chatScript, /onEnded:\s*closeInPageLiveCall/);
    assert.match(chatScript, /chatWebsite\.inert = false/);
    assert.match(chatScript, /history\.pushState\(\{ liveCall: true \}/);
    assert.match(chatScript, /popstate[\s\S]*inPageLiveCall\.end\(\)/);
    assert.match(chatScript, /window\.location\.hash === "#live-call"[\s\S]*window\.history\.back\(\)/);
});

function scriptForSharedController() {
    return source;
}
