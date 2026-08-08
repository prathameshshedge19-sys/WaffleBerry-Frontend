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
        audioUnlock: { hidden: true, focus() {} },
        outputAudio: { autoplay: false, playsInline: false, muted: false, volume: 1,
            srcObject: null, paused: true, playCalls: 0,
            play() { this.playCalls += 1; this.paused = false; return Promise.resolve(); },
            pause() { this.paused = true; } }
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
            return { gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connectedTo: null, connect(node) { this.connectedTo = node; }, disconnect() {} };
        },
        createMediaStreamDestination() {
            return { stream: { getAudioTracks: () => [{ readyState: "live" }] }, disconnect() {} };
        },
        async decodeAudioData() {
            return { duration: 0.1, numberOfChannels: 1,
                getChannelData: () => Float32Array.from([0.1, -0.1]) };
        },
        createOscillator() {
            return { type: "", frequency: { value: 0 }, connect() {}, disconnect() {}, start() { sourceStarts += 1; }, stop() {} };
        },
        createAnalyser() {
            return { fftSize: 0, smoothingTimeConstant: 0, connectedTo: null,
                connect(node) { this.connectedTo = node; }, disconnect() {},
                getFloatTimeDomainData(samples) { samples.fill(0); } };
        },
        createMediaStreamSource() { return { connect() {}, disconnect() {} }; },
        createBuffer(_channels, length, rate) { return { duration: length / rate, copyToChannel() {} }; },
        createBufferSource() {
            return { buffer: null, connectedTo: null, connect(node) { this.connectedTo = node; }, disconnect() {}, addEventListener() {}, start() { sourceStarts += 1; }, stop() {} };
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
    assert.equal(context.starts(), 1);
});

test("suspended mobile audio resumes without exposing a second-tap control", async () => {
    const context = audioContext("suspended");
    const fixture = makeController(context);
    context.allowResume();
    assert.equal(await fixture.controller.resumeAudioContext(), true);
    assert.equal(context.state, "running");
    assert.equal(fixture.controller.elements.audioUnlock.hidden, true);
    fixture.controller.startRingback();
    assert.equal(context.starts(), 1);
});

test("call startup captures a live microphone before attaching persistent output", async () => {
    const context = audioContext("suspended");
    const fixture = makeController(context);
    let microphoneRequests = 0;
    let sessions = 0;
    let transports = 0;
    fixture.controller.mediaDevices = {
        async getUserMedia() {
            microphoneRequests += 1;
            const track = { readyState: "live", enabled: true, stop() {} };
            return { getTracks: () => [track], getAudioTracks: () => [track] };
        }
    };
    fixture.controller.api = {
        async createLiveCallSession() {
            sessions += 1;
            return { session_id: 1, engine: "cascade", transport: "websocket" };
        },
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
    assert.equal(fixture.controller.elements.outputAudio.srcObject, fixture.controller.outputDestination.stream);
    assert.equal(fixture.controller.elements.outputAudio.playCalls, 1);
    assert.equal(microphoneRequests, 1);
    assert.equal(sessions, 1);
    assert.equal(transports, 1);
    assert.equal(context.starts(), 0);
});

test("WebKit output uses one persistent autoplay MediaStream element after live capture", async () => {
    const context = audioContext("running");
    const fixture = makeController(context);
    fixture.controller.stream = { getAudioTracks: () => [{ readyState: "live" }] };
    await fixture.controller.initializeCallAudioOutput();
    const output = fixture.controller.elements.outputAudio;
    const destination = fixture.controller.outputDestination;
    assert.equal(output.autoplay, true);
    assert.equal(output.playsInline, true);
    assert.equal(output.srcObject, destination.stream);
    assert.equal(output.playCalls, 1);
    assert.equal(fixture.controller.outputGain.connectedTo, fixture.controller.outputAnalyser);
    assert.equal(fixture.controller.outputAnalyser.connectedTo, destination);
    await fixture.controller.initializeCallAudioOutput();
    assert.equal(output.playCalls, 1);
    assert.match(markup, /<audio id="liveCallOutput" autoplay playsinline aria-label="Live Call audio"><\/audio>/);
    assert.match(chat, /<audio id="liveCallOutput" autoplay playsinline aria-label="Live Call audio"><\/audio>/);
});

test("Speaker changes shared gain without destroying the persistent output route", async () => {
    const context = audioContext("running");
    const fixture = makeController(context);
    fixture.controller.stream = { getAudioTracks: () => [{ readyState: "live" }] };
    await fixture.controller.initializeCallAudioOutput();
    const destination = fixture.controller.outputDestination;
    await fixture.controller.toggleSpeaker();
    assert.equal(fixture.controller.outputGain.gain.value, 0);
    assert.equal(fixture.controller.outputDestination, destination);
    assert.equal(fixture.controller.elements.outputAudio.srcObject, destination.stream);
    await fixture.controller.toggleSpeaker();
    assert.equal(fixture.controller.outputGain.gain.value, 1);
    assert.equal(fixture.controller.outputDestination, destination);
});

test("Speaking is confirmed only by sustained analyser energy", async () => {
    const context = audioContext("running");
    const fixture = makeController(context);
    fixture.controller.stream = { getAudioTracks: () => [{ readyState: "live" }] };
    await fixture.controller.initializeCallAudioOutput();
    fixture.controller.activeTurnId = 4;
    fixture.controller.pendingPlaybackConfirmation = {
        turnId: 4, greeting: false, startedAt: 0
    };
    fixture.controller.sampleOutputEnergy();
    assert.notEqual(fixture.controller.state, "speaking");
    fixture.controller.outputAnalyser.getFloatTimeDomainData = (samples) => samples.fill(0.05);
    fixture.controller.outputEnergyCandidateAt = -100;
    fixture.controller.sampleOutputEnergy();
    assert.equal(fixture.controller.state, "speaking");
    assert.equal(fixture.controller.playbackConfirmedTurnId, 4);
});

test("decoded silence is distinguished from valid speech without retaining content", () => {
    const fixture = makeController(audioContext("running"));
    const silent = fixture.controller.decodedSignal({
        duration: 0.2, numberOfChannels: 1,
        getChannelData: () => new Float32Array(32),
    });
    const audible = fixture.controller.decodedSignal({
        duration: 0.2, numberOfChannels: 1,
        getChannelData: () => Float32Array.from([0, 0.02, -0.01]),
    });
    assert.equal(silent.peak, 0);
    assert.ok(audible.peak > 0);
    assert.equal("content" in silent, false);
});

test("normal call entry contains no pointer or silent-media priming", () => {
    const entry = chatScript.slice(0, chatScript.indexOf("const STREAM_INACTIVITY_TIMEOUT_MS"));
    assert.doesNotMatch(entry, /pointerdown|primeAudioFromGesture|data:audio|Tap for sound/);
});

test("streaming PCM waits for a running context and preserves queued playback", async () => {
    const context = audioContext("suspended");
    const fixture = makeController(context);
    fixture.controller.activeTurnId = 7;
    context.allowResume();
    const queued = fixture.controller.queuePcmChunk({
        turn_id: 7, data: btoa("\u0000\u0000"), sample_rate: 24000
    });
    await new Promise(setImmediate);
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

test("persistent output has no second-tap UI and existing controls remain accessible", () => {
    assert.doesNotMatch(markup, /liveCallAudioUnlock|Tap for sound|Tap to start call/);
    assert.doesNotMatch(markup, /Tap to start call/);
    assert.match(markup, /id="liveCallStatus"[^>]*role="status"[^>]*aria-live="assertive"/);
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

test("original Call click starts directly without priming or a second tap", () => {
    const open = chatScript.slice(
        chatScript.indexOf("function openInPageLiveCall"),
        chatScript.indexOf("window.addEventListener(\"popstate\"")
    );
    const prepare = chatScript.slice(
        chatScript.indexOf("function prepareInPageLiveCall"),
        chatScript.indexOf("function openInPageLiveCall")
    );
    assert.doesNotMatch(prepare, /primeAudioFromGesture|silent|pointerdown/);
    assert.ok(open.indexOf("prepareInPageLiveCall()") < open.indexOf("inPageLiveCall.start()"));
    assert.doesNotMatch(chat, /Tap for sound|Tap to start call/);
});

test("MediaStream output replaces gesture priming in the product flow", () => {
    assert.doesNotMatch(chatScript, /primeAudioFromGesture|pointerdown/);
    assert.match(source, /createMediaStreamDestination\(\)/);
});

test("temporarily suspended context resumes through the shared context", async () => {
    const context = audioContext("suspended");
    const fixture = makeController(context);
    fixture.controller.clock.setTimeout = (callback, delay) => {
        if (delay === 30) {
            context.state = "running";
            queueMicrotask(callback);
        }
        return 1;
    };
    fixture.controller.getAudioContext();
    const verified = await fixture.controller.waitForRunningAudioContext();
    assert.equal(verified, true);
    assert.equal(fixture.controller.intentionalEnd, false);
    assert.equal(context.state, "running");
});

test("click launches once, keyboard click remains supported, and pointer priming is absent", () => {
    assert.doesNotMatch(chatScript, /addEventListener\("pointerdown"/);
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
