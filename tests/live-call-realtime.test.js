"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const realtime = fs.readFileSync(path.join(root, "js/live-call-realtime.js"), "utf8");
const cascade = fs.readFileSync(path.join(root, "js/live-call.js"), "utf8");
const html = fs.readFileSync(path.join(root, "live-call.html"), "utf8");
const chatHtml = fs.readFileSync(path.join(root, "chat.html"), "utf8");
const api = fs.readFileSync(path.join(root, "js/api.js"), "utf8");

function loadRealtimeController() {
    const document = { dispatchEvent() {} };
    const window = { performance: { now: () => 10 }, fetch() {}, setTimeout, clearTimeout };
    vm.runInNewContext(realtime, {
        window, document, console, JSON, Promise,
        MediaStream: class MediaStream { constructor(tracks) { this.tracks = tracks; } },
        CustomEvent: class CustomEvent {}
    });
    return window.WaffleBerryRealtimeLiveCall.RealtimeLiveCallController;
}

function loadRealtimeModule() {
    const window = { performance: { now: () => 10 }, fetch() {}, setTimeout, clearTimeout };
    vm.runInNewContext(realtime, {
        window, document: { dispatchEvent() {} }, console, JSON, Promise, Blob,
        URL, Uint8Array, atob,
        MediaStream: class MediaStream { constructor(tracks) { this.tracks = tracks; } },
        CustomEvent: class CustomEvent {}
    });
    return window.WaffleBerryRealtimeLiveCall;
}

class Emitter {
    constructor() { this.listeners = {}; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    emit(name, value = {}) { this.listeners[name]?.(value); }
}

test("native realtime uses WebRTC microphone and one persistent remote audio element", () => {
    assert.match(realtime, /new this\.RTCPeerConnectionClass\(\)/);
    assert.match(realtime, /this\.micSender = this\.peer\.addTrack\(this\.micTrack, this\.owner\.stream\)/);
    assert.match(realtime, /this\.peer\.ontrack = \(event\) => this\.attachRemoteAudio\(event\)/);
    assert.match(realtime, /audio\.srcObject = stream/);
    assert.match(html, /id="liveCallRealtimeOutput" autoplay playsinline/);
    assert.doesNotMatch(realtime, /MediaStreamDestination|pcmSources|MediaRecorder/);
    assert.match(realtime, /if \(!this\.owner\.debugLiveCall[\s\S]*startMicDiagnostic/);
});

test("the production Chat shell loads Realtime before Live Call and contains shared required DOM", () => {
    const realtimeScript = chatHtml.indexOf('<script src="js/live-call-realtime.js"></script>');
    const liveCallScript = chatHtml.indexOf('<script src="js/live-call.js"></script>');
    const chatScript = chatHtml.indexOf('<script src="js/chat.js"></script>');
    assert.ok(realtimeScript >= 0);
    assert.ok(realtimeScript < liveCallScript && liveCallScript < chatScript);
    for (const id of ["liveCallRealtimeOutput", "liveCallDebugPanel", "liveCallDebugValues",
        "liveCallStatus", "liveCallMicrophoneStatus", "liveCallRelationship"]) {
        assert.match(chatHtml, new RegExp(`id=["']${id}["']`));
    }
});

test("same-document debug wiring exposes strict engine and safe pre-bootstrap failure", () => {
    assert.match(cascade, /REALTIME_FRONTEND_STARTUP/);
    assert.match(cascade, /session_response_received[\s\S]*engine_validated/);
    assert.match(cascade, /realtime_module_available[\s\S]*realtime_controller_constructing[\s\S]*realtime_controller_constructed/);
    assert.match(realtime, /bootstrap_request_about_to_send[\s\S]*createRealtimeBootstrap[\s\S]*bootstrap_request_sent/);
    assert.match(cascade, /STRICT: [\s\S]*STARTUP STAGE: [\s\S]*LAST FAILURE:/);
    assert.match(cascade, /LAST TOOL:[\s\S]*TOOL STATUS:[\s\S]*MEMORIES USED:[\s\S]*IDENTITIES USED:[\s\S]*TOOL LATENCY:[\s\S]*FOLLOW-UP CONTEXT:/);
});

test("realtime startup sends one exact greeting and maps native state events", () => {
    assert.match(realtime, /if \(!this\.greetingSent\)[\s\S]*this\.greetingSent = true/);
    assert.match(realtime, /Say exactly: Hello\?/);
    assert.match(realtime, /input_audio_buffer\.speech_started[\s\S]*user_speaking/);
    assert.match(realtime, /input_audio_buffer\.speech_stopped[\s\S]*processing/);
    assert.doesNotMatch(realtime, /handleAudioDelta[\s\S]{0,1400}setState\("speaking"/);
    assert.match(realtime, /handleMediaPlaying[\s\S]*setState\("speaking"/);
    assert.match(realtime, /response\.done[\s\S]*listening/);
    assert.doesNotMatch(realtime, /type:\s*["']session\.update["']/);
});

test("function calls complete once through authenticated WaffleBerry tools", () => {
    assert.match(realtime, /response\.function_call_arguments\.done/);
    assert.match(realtime, /this\.completedToolCalls\.has\(event\.call_id\)/);
    assert.match(realtime, /executeRealtimeTool/);
    assert.match(realtime, /type: "function_call_output"/);
    assert.match(realtime, /this\.send\(\{ type: "response\.create", response: \{ output_modalities: \[this\.renderer\.kind === "native" \? "audio" : "text"\] \} \}\)/);
});

test("hybrid selection and startup-only cascade fallback remain explicit", () => {
    assert.match(api, /engine = "auto"/);
    assert.match(cascade, /get\("engine"\) \|\| "auto"/);
    assert.match(cascade, /this\.session\.engine === "realtime"/);
    assert.match(cascade, /await this\.realtimeController\.start\(\)[\s\S]*catch[\s\S]*realtime_strict/);
    assert.match(cascade, /endLiveCallSession\(failedSessionId\)[\s\S]*createLiveCallSession\([\s\S]*"cascade"/);
    assert.match(cascade, /initializeCallAudioOutput\(\)[\s\S]*initializeVad\(\)[\s\S]*connectTransport\(\)/);
    assert.match(cascade, /ENGINE: \$\{[\s\S]*FALLBACK REASON:/);
    assert.match(cascade, /LIVE_CALL_ENGINE/);
    assert.doesNotMatch(realtime, /\/api\/v1\/live-call\/ws/);
});

test("external voices keep Realtime conversation while rendering only selected external speech", () => {
    assert.match(realtime, /class RealtimeNativeRenderer/);
    assert.match(realtime, /class ExternalNonStreamingRenderer/);
    assert.match(realtime, /response\.output_text\.delta/);
    assert.match(realtime, /renderRealtimeSpeech/);
    assert.match(realtime, /output_modalities: \[this\.renderer\.kind === "native" \? "audio" : "text"\]/);
    assert.match(realtime, /EXTERNAL_TTS_MAX_QUEUE = 3/);
    assert.match(realtime, /phrase\.generation !== this\.generation/);
    assert.match(realtime, /cancelResponse\(\)[\s\S]*this\.synthesisQueue = \[\][\s\S]*this\.readyQueue = \[\][\s\S]*this\.stopAudio\(\)/);
    assert.match(realtime, /await this\.audio\.play\(\)[\s\S]*setState\("speaking", "Speaking"\)/);
    assert.match(api, /function renderRealtimeSpeech[\s\S]*response_id[\s\S]*generation_id[\s\S]*user_input_turn_id/);
    assert.match(cascade, /RENDERER:.*NATIVE.*EXTERNAL/);
});

test("external phrase assembler balances first response latency with natural larger chunks", () => {
    const { ExternalPhraseAssembler } = loadRealtimeModule();
    const short = new ExternalPhraseAssembler();
    assert.deepEqual([...short.push("My husband is Madhav.")], []);
    assert.deepEqual([...short.finish()], ["My husband is Madhav."]);

    const paired = new ExternalPhraseAssembler();
    assert.deepEqual([...paired.push("Goa was lovely. We spent our mornings by the sea.")],
        ["Goa was lovely. We spent our mornings by the sea."]);

    const unicode = new ExternalPhraseAssembler();
    assert.deepEqual([...unicode.push("मला गोवा खूप आवडला। तिथला समुद्र खूप सुंदर होता।")],
        ["मला गोवा खूप आवडला। तिथला समुद्र खूप सुंदर होता।"]);

    const bounded = new ExternalPhraseAssembler();
    const words = `${"natural ".repeat(32)}ending.`;
    const chunks = [...bounded.push(words), ...bounded.finish()];
    assert.ok(chunks[0].length >= 120 && chunks[0].length <= 220);
    assert.equal(chunks.join(" ").replace(/\s+/g, " "), words.trim().replace(/\s+/g, " "));
    assert.ok(chunks.every((chunk) => !chunk.startsWith(" ") && !chunk.endsWith(" ")));
});

test("external prefetch is one-ahead, ordered, interruption-safe, and native-isolated", () => {
    const nativeClass = realtime.slice(
        realtime.indexOf("class RealtimeNativeRenderer"),
        realtime.indexOf("class ExternalPhraseAssembler")
    );
    assert.doesNotMatch(nativeClass, /External|renderRealtimeSpeech|PhraseAssembler/);
    assert.match(realtime, /this\.readyQueue\.length >= 1/);
    assert.match(realtime, /this\.readyQueue\.push\(\{ \.\.\.phrase, result \}\)/);
    assert.match(realtime, /const phrase = this\.readyQueue\.shift\(\)[\s\S]*await this\.play/);
    assert.match(realtime, /playingQueue[\s\S]*external_prefetch_started/);
    assert.match(realtime, /cancelResponse\(\)[\s\S]*this\.synthesisQueue = \[\][\s\S]*this\.readyQueue = \[\][\s\S]*this\.stopAudio/);
    assert.match(realtime, /phrase\.generation !== this\.generation[\s\S]*recordStaleEvent/);
    assert.match(realtime, /EXTERNAL_FIRST_CHUNK_WAIT_MS = 160/);
});

test("End Call closes WebRTC, data channel, media attachment, and backend session", () => {
    assert.match(realtime, /this\.channel\?\.close\(\)/);
    assert.match(realtime, /this\.peer\?\.close\(\)/);
    assert.match(realtime, /audio\.srcObject = null/);
    assert.match(cascade, /performEnd\(\)[\s\S]*this\.realtimeController\?\.close\(\)/);
    assert.match(cascade, /endLiveCallSession\(this\.session\.session_id\)/);
});

test("mocked peer lifecycle adds microphone, attaches remote stream once, and cleans up", async () => {
    const channel = new Emitter();
    channel.readyState = "open";
    channel.sent = [];
    channel.send = (value) => channel.sent.push(JSON.parse(value));
    channel.close = () => { channel.closed = true; };
    class Peer extends Emitter {
        constructor() { super(); this.tracks = []; }
        createDataChannel() { return channel; }
        addTrack(track) { this.tracks.push(track); }
        async createOffer() { return { type: "offer", sdp: "offer-sdp" }; }
        async setLocalDescription() {}
        async setRemoteDescription(answer) { this.answer = answer; }
        close() { this.closed = true; }
    }
    const remoteAudio = new Emitter();
    remoteAudio.paused = false;
    remoteAudio.play = async () => {};
    remoteAudio.pause = () => {};
    const owner = {
        api: { createRealtimeBootstrap: async () => ({ client_secret: "short-lived", model: "test" }) },
        session: { session_id: "session-1" },
        stream: { getTracks: () => [{ id: "mic", kind: "audio" }],
            getAudioTracks: () => [{ id: "mic", kind: "audio" }] },
        elements: { realtimeOutput: remoteAudio, mute: {}, speaker: {}, status: {} },
        stopRingback() {}, startTimer() {}, setState() {}, muted: false, speakerEnabled: true,
        clock: { setTimeout, clearTimeout }
    };
    const Controller = loadRealtimeController();
    const controller = new Controller(owner, {
        RTCPeerConnectionClass: Peer,
        fetch: async () => {
            setTimeout(() => channel.emit("open"), 0);
            return { ok: true, status: 200, text: async () => "answer-sdp" };
        }
    });
    await controller.start();
    assert.equal(controller.peer.tracks.length, 1);
    const remoteTrack = new Emitter();
    Object.assign(remoteTrack, { id: "track-1", kind: "audio", readyState: "live", enabled: true, muted: false });
    controller.peer.ontrack({ track: remoteTrack, streams: [{ id: "remote" }] });
    assert.equal(remoteAudio.srcObject.id, "remote");
    channel.emit("open");
    assert.equal(channel.sent.filter((event) => event.type === "response.create").length, 1);
    controller.close();
    assert.equal(channel.closed, true);
    assert.equal(remoteAudio.srcObject, null);
});

test("native startup uses the documented SDP contract and requests greeting after channel open", async () => {
    const channel = new Emitter();
    channel.readyState = "connecting";
    channel.sent = [];
    channel.send = (value) => channel.sent.push(JSON.parse(value));
    class Peer {
        createDataChannel(name) { assert.equal(name, "oai-events"); return channel; }
        addTrack() { return {}; }
        getTransceivers() { return []; }
        async createOffer() { return { type: "offer", sdp: "private-offer" }; }
        async setLocalDescription() {}
        async setRemoteDescription(answer) { assert.equal(answer.sdp, "private-answer"); }
    }
    const requests = [];
    const owner = {
        api: { createRealtimeBootstrap: async () => ({ client_secret: "ephemeral-only" }) },
        session: { session_id: "session-1" },
        stream: { getAudioTracks: () => [{ kind: "audio" }], getTracks: () => [] },
        elements: { realtimeOutput: {}, mute: {}, speaker: {} },
        stopRingback() {}, startTimer() {}, setState() {}, renderDebugPanel() {},
        speakerEnabled: true, clock: { setTimeout, clearTimeout }, debugLiveCall: false
    };
    const Controller = loadRealtimeController();
    const controller = new Controller(owner, {
        RTCPeerConnectionClass: Peer,
        fetch: async (url, options) => {
            requests.push({ url, options });
            setTimeout(() => { channel.readyState = "open"; channel.emit("open"); }, 0);
            return { ok: true, status: 200, text: async () => "private-answer" };
        }
    });
    await controller.start();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.openai.com/v1/realtime/calls");
    assert.equal(requests[0].options.headers.Authorization, "Bearer ephemeral-only");
    assert.equal(requests[0].options.headers["Content-Type"], "application/sdp");
    assert.equal(requests[0].options.body, "private-offer");
    assert.equal(channel.sent.filter((event) => event.type === "response.create").length, 1);
});

test("strict startup failure owns one cleanup and contains no cascade session creation branch", () => {
    assert.match(cascade, /if \(this\.session\.realtime_strict\)[\s\S]*endLiveCallSession\(failedSessionId\)[\s\S]*throw error/);
    const strictBranch = cascade.match(/if \(this\.session\.realtime_strict\) \{([\s\S]*?)\n\s*\}/)?.[1] || "";
    assert.doesNotMatch(strictBranch, /createLiveCallSession/);
    assert.match(cascade, /FAILED STAGE:[\s\S]*REASON:[\s\S]*STATUS:/);
});

function runtimeController(options = {}) {
    const sent = [];
    const states = [];
    const channel = { readyState: "open", send: (value) => sent.push(JSON.parse(value)) };
    const owner = {
        api: options.api || { executeRealtimeTool: async () => ({ result: {
            status: "supported", memory_count: 1, identity_count: 0,
            followup_context: "active", diagnostics: { total_tool_ms: 12 }
        } }) },
        session: { session_id: "session-1" }, state: "listening", muted: false,
        elements: { realtimeOutput: { paused: false } },
        setState(state, label) { this.state = state; states.push([state, label]); },
        setTransportState(state) { this.transportState = state; },
        clock: options.clock || { setTimeout, clearTimeout }, debugLiveCall: false,
        speakerEnabled: true
    };
    const Controller = loadRealtimeController();
    const controller = new Controller(owner, {
        RTCPeerConnectionClass: class {}, clock: owner.clock,
        performance: options.performance || { now: () => 100 }
    });
    controller.channel = channel;
    return { controller, owner, sent, states };
}

function confirmCandidate(controller) {
    assert.ok(controller.bargeInCandidate);
    controller.bargeInCandidate.micPeak = 0.2;
    controller.confirmBargeInCandidate(controller.bargeInCandidate);
}

test("native speech start tolerates natural pauses and Thinking begins only on speech stopped", () => {
    const { controller, owner } = runtimeController();
    controller.handleEvent({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) });
    assert.equal(owner.state, "user_speaking");
    assert.notEqual(owner.state, "processing");
    controller.handleEvent({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) });
    assert.equal(owner.state, "processing");
    controller.close();
});

test("native input remains full-duplex while assistant media is Speaking", () => {
    const { controller, owner } = runtimeController();
    const mic = { id: "mic-track", kind: "audio", readyState: "live", enabled: true, muted: false,
        label: "Microphone", getSettings: () => ({ echoCancellation: true, noiseSuppression: true,
            autoGainControl: true, channelCount: 1, sampleRate: 48000 }) };
    const sender = { track: mic };
    controller.micTrack = mic;
    controller.micSender = sender;
    controller.micTransceiver = { sender, direction: "sendrecv", currentDirection: "sendrecv" };
    controller.peer = { connectionState: "connected", iceConnectionState: "connected" };
    owner.stream = { active: true };
    makeHealthyMedia(controller, owner);
    controller.responseHasAudio = true;
    controller.handleMediaPlaying("playing");
    assert.equal(owner.state, "speaking");
    assert.equal(mic.enabled, true);
    assert.equal(controller.inputDiagnostics().sender_track_matches_mic, true);
    assert.equal(controller.inputDiagnostics().transceiver_direction, "sendrecv");
    controller.handleEvent({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) });
    confirmCandidate(controller);
    assert.equal(owner.state, "user_speaking");
    assert.equal(controller.speechStartedWhileAssistantSpeaking, 1);
    assert.equal(mic.enabled, true);
    controller.close();
});

test("native Realtime refines supported microphone processing without replacing its track", async () => {
    const { controller } = runtimeController();
    let applied;
    const mic = { applyConstraints: async (constraints) => { applied = constraints; } };
    controller.micTrack = mic;
    await controller.configureMicTrack();
    assert.equal(applied.echoCancellation, true);
    assert.equal(applied.noiseSuppression, true);
    assert.equal(applied.autoGainControl, true);
    assert.equal(controller.micTrack, mic);
    controller.close();
});

test("speech_started input events bypass response ownership filtering", () => {
    const { controller, owner } = runtimeController();
    controller.activeResponseId = "response-active";
    controller.cancelledResponseIds.add("response-stale");
    controller.assistantSpeaking = true;
    controller.handleEvent({ data: JSON.stringify({
        type: "input_audio_buffer.speech_started", response_id: "response-stale"
    }) });
    confirmCandidate(controller);
    assert.equal(controller.userSpeaking, true);
    assert.equal(owner.state, "user_speaking");
    controller.close();
});

test("event-type and local mic-level diagnostics are DEBUG-only and never drive interruption", () => {
    const normal = runtimeController();
    normal.controller.recordEventType("input_audio_buffer.speech_started");
    assert.deepEqual([...normal.controller.observedEventTypes], []);
    normal.controller.micRms = 0.5;
    assert.equal(normal.controller.userSpeaking, false);
    normal.controller.close();

    const debug = runtimeController();
    debug.owner.debugLiveCall = true;
    debug.controller.recordEventType("input_audio_buffer.speech_started");
    assert.deepEqual([...debug.controller.observedEventTypes], ["input_audio_buffer.speech_started"]);
    debug.controller.micRms = 0.75;
    assert.equal(debug.controller.userSpeaking, false);
    debug.controller.close();
});

test("confirmed speech preserves native input while client cancels and clears only output", () => {
    const { controller, owner, sent } = runtimeController();
    controller.activeResponseId = "response-old";
    controller.responseHasAudio = true;
    controller.assistantSpeaking = true;
    controller.handleSpeechStarted();
    confirmCandidate(controller);
    assert.equal(owner.state, "user_speaking");
    assert.deepEqual(sent.map((event) => event.type), ["response.cancel", "output_audio_buffer.clear"]);
    assert.equal(sent.some((event) => event.type.startsWith("input_audio_buffer.")), false);
    assert.equal(controller.cancelledResponseIds.has("response-old"), true);
    controller.handleAudioDelta("response-old");
    assert.equal(owner.state, "user_speaking");
    controller.close();
});

test("speech_started while idle changes UI without sending interruption events", () => {
    const { controller, owner, sent } = runtimeController();
    controller.handleSpeechStarted();
    assert.equal(owner.state, "user_speaking");
    assert.deepEqual(sent, []);
    assert.equal(controller.interruptionDiagnostics.speech_started_received, true);
    controller.close();
});

test("one native speech turn invokes the authoritative interruption only once", () => {
    const { controller, sent } = runtimeController();
    controller.activeResponseId = "response-once";
    controller.responseHasAudio = true;
    controller.handleSpeechStarted();
    confirmCandidate(controller);
    controller.handleSpeechStarted();
    assert.deepEqual(sent.map((event) => event.type), ["response.cancel", "output_audio_buffer.clear"]);
    controller.close();
});

test("post-response.done playback is cleared without invalid response cancellation or guessed truncation", () => {
    const { controller, owner, sent } = runtimeController();
    makeHealthyMedia(controller, owner);
    controller.activeResponseId = "response-buffered";
    controller.responseHasAudio = true;
    controller.handleOutputItemAdded({ id: "assistant-item", type: "message", role: "assistant" });
    controller.handleMediaPlaying("playing");
    controller.handleResponseTerminal({ type: "response.done", response: {
        id: "response-buffered", status: "completed"
    } }, "response-buffered");
    controller.handleSpeechStarted();
    confirmCandidate(controller);
    assert.deepEqual(sent.map((event) => event.type), ["output_audio_buffer.clear"]);
    assert.equal(controller.interruptionDiagnostics.truncate_sent, false);
    assert.equal(controller.interruptionDiagnostics.playback_position_ms, null);
    assert.equal(owner.state, "user_speaking");
    controller.handleAudioCleared();
    assert.equal(controller.activeAssistantItemId, null);
    controller.close();
});

test("cancelled response deltas and terminal events are suppressed and counted", () => {
    const { controller } = runtimeController();
    controller.activeResponseId = "response-stale";
    controller.responseHasAudio = true;
    controller.handleSpeechStarted();
    confirmCandidate(controller);
    controller.handleAudioDelta("response-stale");
    controller.handleResponseTerminal({ type: "response.done", response: {
        id: "response-stale", status: "completed"
    } }, "response-stale");
    assert.equal(controller.staleEventsSuppressed, 2);
    controller.close();
});

test("server auto-cancel acknowledgement does not recover or disturb the new user turn", () => {
    const { controller, owner } = runtimeController();
    controller.activeResponseId = "response-race";
    controller.responseHasAudio = true;
    controller.handleSpeechStarted();
    confirmCandidate(controller);
    controller.handleEvent({ data: JSON.stringify({
        type: "response.cancelled", response: { id: "response-race", status: "cancelled" }
    }) });
    assert.equal(owner.state, "user_speaking");
    assert.equal(controller.activeUserInputTurnId, 1);
    controller.close();
});

test("repeated interruptions retain the peer, channel, and persistent audio element", () => {
    const { controller, owner, sent } = runtimeController();
    const peer = { id: "same-peer" };
    const audio = owner.elements.realtimeOutput;
    controller.peer = peer;
    for (const responseId of ["response-1", "response-2", "response-3"]) {
        controller.activeResponseId = responseId;
        controller.responseHasAudio = true;
        controller.assistantSpeaking = true;
        controller.handleSpeechStarted();
        confirmCandidate(controller);
        controller.handleSpeechStopped();
    }
    assert.equal(sent.filter((event) => event.type === "response.cancel").length, 3);
    assert.equal(sent.filter((event) => event.type === "output_audio_buffer.clear").length, 3);
    assert.equal(controller.peer, peer);
    assert.equal(owner.elements.realtimeOutput, audio);
    controller.close();
});

test("speech stopped remains authoritative while stale assistant events arrive", () => {
    const { controller, owner, sent } = runtimeController();
    const mic = { id: "same-mic", kind: "audio" };
    const sender = { track: mic };
    controller.micTrack = mic;
    controller.micSender = sender;
    controller.activeResponseId = "old-response";
    controller.responseHasAudio = true;
    controller.handleSpeechStarted();
    confirmCandidate(controller);
    controller.handleResponseTerminal({ type: "response.cancelled", response: {
        id: "old-response", status: "cancelled"
    } }, "old-response");
    controller.handleAudioCleared();
    controller.handleSpeechStopped();
    assert.equal(owner.state, "processing");
    assert.equal(controller.activeUserInputTurnId, 1);
    assert.equal(controller.micTrack, mic);
    assert.equal(controller.micSender, sender);
    assert.equal(sent.some((event) => event.type === "response.create"), false);
    controller.close();
});

test("short low-energy native start is diagnostic only and never clears output", () => {
    const { controller, sent } = runtimeController();
    controller.responseHasAudio = true;
    controller.assistantSpeaking = true;
    controller.micRms = 0.005;
    controller.micPeak = 0.02;
    controller.handleSpeechStarted();
    controller.handleSpeechStarted();
    controller.handleSpeechStopped();
    assert.equal(sent.filter((event) => event.type === "output_audio_buffer.clear").length, 0);
    assert.equal(controller.assistantOutputClearCount, 0);
    assert.equal(controller.falseInterruptCandidateCount, 1);
    controller.close();
});

test("genuine barge-in stays visually Speaking until the bounded 150ms gate confirms", () => {
    const timers = [];
    const clock = {
        setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
        clearTimeout() {}
    };
    const { controller, owner, sent } = runtimeController({ clock });
    controller.activeResponseId = "speaking-response";
    controller.responseHasAudio = true;
    controller.assistantSpeaking = true;
    owner.state = "speaking";
    controller.micRms = 0.03;
    controller.micPeak = 0.15;
    controller.handleSpeechStarted();
    assert.equal(owner.state, "speaking");
    assert.equal(sent.length, 0);
    assert.equal(timers[0].delay, 150);
    timers[0].callback();
    assert.equal(owner.state, "user_speaking");
    assert.deepEqual(sent.map((event) => event.type), [
        "response.cancel", "output_audio_buffer.clear"
    ]);
    controller.close();
});

test("a genuine short No or Wait confirms on native speech_stopped without losing input", () => {
    const { controller, owner, sent } = runtimeController();
    controller.activeResponseId = "short-response";
    controller.responseHasAudio = true;
    controller.assistantSpeaking = true;
    controller.micPeak = 0.12;
    controller.handleSpeechStarted();
    controller.handleSpeechStopped();
    assert.equal(owner.state, "processing");
    assert.equal(controller.activeUserInputTurnId, 1);
    assert.deepEqual(sent.map((event) => event.type), [
        "response.cancel", "output_audio_buffer.clear"
    ]);
    controller.close();
});

test("response stall watchdog cancels once, returns to Listening, and keeps the peer usable", () => {
    let watchdog;
    const clock = { setTimeout(callback) { watchdog = callback; return 1; }, clearTimeout() {} };
    const { controller, owner, sent } = runtimeController({ clock });
    controller.activeResponseId = "response-stuck";
    controller.armResponseWatchdog();
    watchdog();
    assert.equal(owner.state, "listening");
    assert.deepEqual(sent.map((event) => event.type), ["response.cancel", "output_audio_buffer.clear"]);
    assert.equal(controller.peer, null);
    assert.equal(controller.channel.readyState, "open");
    controller.close();
});

test("tool completion requests one continuation and duplicate events are ignored", async () => {
    const { controller, sent } = runtimeController();
    const event = { call_id: "call-1", name: "retrieve_legacy_memory_context",
        arguments: JSON.stringify({ query: "Goa" }), response_id: "response-tool" };
    controller.activeResponseId = "response-tool";
    await controller.runTool(event);
    await controller.runTool(event);
    assert.deepEqual(sent.map((item) => item.type), ["conversation.item.create", "response.create"]);
    controller.close();
});

test("memory diagnostics expose only safe counts and never retrieved content", async () => {
    const secretMemory = "private Goa memory text";
    const api = { executeRealtimeTool: async () => ({ result: {
        status: "conflicted", memory_count: 2, identity_count: 1,
        followup_context: "active", context: secretMemory,
        diagnostics: { total_tool_ms: 31 }
    } }) };
    const { controller } = runtimeController({ api });
    await controller.runTool({
        call_id: "memory-safe", name: "retrieve_legacy_memory_context",
        arguments: JSON.stringify({ query: "What happened after that?" })
    });
    assert.deepEqual(JSON.parse(JSON.stringify(controller.memoryDiagnostics)), {
        last_tool: "memory", status: "conflict", memories_used: 2,
        identities_used: 1, tool_latency_ms: 31, followup_context: "active"
    });
    assert.doesNotMatch(JSON.stringify(controller.diagnostics()), new RegExp(secretMemory));
    controller.close();
});

test("late interrupted tool output resolves safely without reviving a stale response", async () => {
    let finishTool;
    const api = { executeRealtimeTool: () => new Promise((resolve) => { finishTool = resolve; }) };
    const { controller, sent } = runtimeController({ api });
    controller.activeResponseId = "response-tool";
    const pending = controller.runTool({ call_id: "call-race", name: "retrieve_legacy_memory_context",
        arguments: "{}", response_id: "response-tool" });
    controller.handleSpeechStarted();
    confirmCandidate(controller);
    finishTool({ result: { status: "grounded" } });
    await pending;
    const output = sent.find((item) => item.type === "conversation.item.create");
    assert.equal(JSON.parse(output.item.output).status, "cancelled");
    assert.equal(sent.filter((item) => item.type === "response.create").length, 0);
    controller.close();
});

test("tool watchdog always sends a bounded failure result and one continuation", async () => {
    const timers = [];
    const clock = {
        setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {}
    };
    const api = { executeRealtimeTool: () => new Promise(() => {}) };
    const { controller, sent } = runtimeController({ api, clock });
    const pending = controller.runTool({ call_id: "call-stuck", name: "retrieve_legacy_memory_context",
        arguments: "{}", response_id: "response-tool" });
    timers[0]();
    await pending;
    const output = sent.find((item) => item.type === "conversation.item.create");
    assert.equal(JSON.parse(output.item.output).status, "error");
    assert.equal(sent.filter((item) => item.type === "response.create").length, 1);
    controller.close();
});

function makeHealthyMedia(controller, owner) {
    controller.remoteTrack = {
        id: "remote-track", kind: "audio", readyState: "live", enabled: true, muted: false
    };
    controller.remoteStream = { id: "remote-stream" };
    Object.assign(owner.elements.realtimeOutput, {
        paused: false, muted: false, volume: 1, srcObject: controller.remoteStream,
        play: async () => {}, pause() {}
    });
}

test("response events alone never show Speaking; actual media playback does", () => {
    const { controller, owner } = runtimeController();
    makeHealthyMedia(controller, owner);
    controller.handleResponseCreated({ id: "response-1" });
    assert.notEqual(owner.state, "speaking");
    controller.handleAudioDelta("response-1");
    assert.notEqual(owner.state, "speaking");
    controller.handleMediaPlaying("playing");
    assert.equal(owner.state, "speaking");
    controller.close();
});

test("play rejection is recorded and never produces a false Speaking state", async () => {
    const { controller, owner } = runtimeController();
    makeHealthyMedia(controller, owner);
    owner.elements.realtimeOutput.play = async () => {
        const error = new Error("blocked"); error.name = "NotAllowedError"; throw error;
    };
    const played = await controller.requestRemotePlay("test");
    assert.equal(played, false);
    assert.equal(controller.playStatus, "rejected");
    assert.match(controller.lastAudioFailure, /NotAllowedError/);
    assert.notEqual(owner.state, "speaking");
    controller.close();
});

test("response.done while native output is playing remains Speaking until buffer stops", () => {
    const { controller, owner } = runtimeController();
    makeHealthyMedia(controller, owner);
    controller.activeResponseId = "response-1";
    controller.responseHasAudio = true;
    controller.handleMediaPlaying("playing");
    controller.handleResponseTerminal({ type: "response.done", response: {
        id: "response-1", status: "completed"
    } }, "response-1");
    assert.equal(owner.state, "speaking");
    controller.handleMediaPlaybackComplete();
    assert.equal(owner.state, "listening");
    controller.close();
});

test("track mute suppresses Speaking and unmute arms one bounded recovery", () => {
    let timerCount = 0;
    const clock = { setTimeout() { timerCount += 1; return timerCount; }, clearTimeout() {} };
    const { controller, owner } = runtimeController({ clock });
    makeHealthyMedia(controller, owner);
    controller.responseHasAudio = true;
    controller.handleMediaPlaying("playing");
    controller.remoteTrack.muted = true;
    controller.handleTrackMute();
    assert.notEqual(owner.state, "speaking");
    controller.remoteTrack.muted = false;
    controller.handleTrackUnmute();
    assert.ok(controller.mediaWatchdog !== null);
    controller.close();
});

test("stalled remote media performs only one bounded same-stream repair", async () => {
    const timers = [];
    const clock = { setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {} };
    const { controller, owner } = runtimeController({ clock });
    makeHealthyMedia(controller, owner);
    let plays = 0;
    owner.elements.realtimeOutput.play = async () => { plays += 1; };
    controller.responseHasAudio = true;
    controller.handleMediaStall("stalled");
    timers[0]();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(controller.mediaRepairAttempted, true);
    assert.equal(plays, 1);
    assert.equal(owner.elements.realtimeOutput.srcObject, controller.remoteStream);
    controller.close();
});

test("tool continuation is explicitly audio-capable before the same media path speaks", async () => {
    const { controller, owner, sent } = runtimeController();
    makeHealthyMedia(controller, owner);
    await controller.runTool({ call_id: "call-audio", name: "retrieve_legacy_memory_context",
        arguments: "{}", response_id: "response-tool" });
    const continuation = sent.find((event) => event.type === "response.create");
    assert.deepEqual(continuation.response.output_modalities, ["audio"]);
    controller.handleResponseCreated({ id: "response-after-tool" });
    controller.handleAudioDelta("response-after-tool");
    assert.notEqual(owner.state, "speaking");
    controller.handleMediaPlaying("playing");
    assert.equal(owner.state, "speaking");
    controller.close();
});

test("temporary ICE disconnect uses grace and recovery is bounded without greeting or ringback", () => {
    const timers = [];
    const clock = { setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {} };
    const { controller, owner } = runtimeController({ clock });
    let recoveries = 0;
    owner.recoverRealtimeTransport = () => { recoveries += 1; };
    controller.peer = { connectionState: "disconnected", iceConnectionState: "disconnected" };
    controller.handleIceStateChange();
    assert.equal(owner.transportState, "reconnecting");
    assert.equal(recoveries, 0);
    controller.peer.connectionState = "connected";
    controller.peer.iceConnectionState = "connected";
    controller.handlePeerStateChange();
    timers[0]();
    assert.equal(recoveries, 0);
    controller.peer.connectionState = "failed";
    controller.handlePeerStateChange();
    controller.handlePeerStateChange();
    assert.equal(recoveries, 1);
    assert.match(cascade, /replacement\.greetingSent = true/);
    assert.match(cascade, /recoverRealtimeTransport[\s\S]*stopRingback\(\)/);
});

test("reliability classification and rare-turn diagnostics remain privacy safe", () => {
    const { controller } = runtimeController();
    assert.equal(controller.classifyProviderError({ code: "rate_limit_exceeded" }), "provider_rate_limited");
    assert.equal(controller.classifyProviderError({ code: "insufficient_quota" }), "provider_quota_exhausted");
    assert.equal(controller.classifyProviderError({ type: "server_error" }), "provider_transient");
    assert.equal(controller.classifyProviderError({ code: "unmapped" }), "unknown");
    assert.match(realtime, /REALTIME_RECOVERY[\s\S]*speech_started[\s\S]*user_turn_committed[\s\S]*first_output_received/);
});

test("recovery invalidates external queues and End/navigation always cancel replacement", () => {
    assert.match(realtime, /requestTransportRecovery\(reason\)[\s\S]*renderer\.cancelResponse\(\)/);
    assert.match(cascade, /performEnd\(\)[\s\S]*realtimeRecoveryGeneration \+= 1[\s\S]*realtimeController\?\.close\(\)/);
    assert.match(cascade, /cleanupForNavigation\(\)[\s\S]*realtimeRecoveryGeneration \+= 1[\s\S]*realtimeController\?\.close\(\)/);
    assert.match(cascade, /if \(this\.realtimeRecoveryPromise\) return this\.realtimeRecoveryPromise/);
    assert.match(cascade, /this\.realtimeReconnectCount >= 2/);
});

test("media interruptions, diagnostics, and long-call collections are bounded", () => {
    assert.match(realtime, /TRACK_INTERRUPTION_GRACE_MS = 3000/);
    assert.match(realtime, /handleMicMute[\s\S]*replaceMicrophoneTrack/);
    assert.match(realtime, /replaceTrack\?\.\(replacement\)/);
    assert.match(realtime, /requestTransportRecovery\("remote_track_ended"\)/);
    assert.match(realtime, /removeEventListener\?\.\("connectionstatechange"/);
    assert.match(realtime, /observedEventTypes\.size > 64/);
    assert.match(realtime, /completedToolCalls\.size > 128/);
});
