"use strict";

(function initializeLiveCall() {
const CALL_STATES = Object.freeze([
    "idle", "connecting", "connected", "greeting", "listening", "user_speaking", "processing",
    "speaking", "ending", "ended", "error"
]);
const EVENT_VERSION = 1;
const TRANSPORT_STATES = Object.freeze(["connected", "degraded", "reconnecting", "offline", "failed"]);
const RECONNECT_DELAYS_MS = Object.freeze([500, 1000, 2000, 4000]);
const HEARTBEAT_INTERVAL_MS = 20000;
const HEARTBEAT_TIMEOUT_MS = 8000;
const RECORDING_DISCONNECT_GRACE_MS = 5000;
const VAD_SAMPLE_INTERVAL_MS = 50;
const VAD_SPEECH_THRESHOLD = 0.035;
const RINGBACK_GAIN = 0.025;
const MINIMUM_CONNECTING_MS = 2700;
const RINGBACK_FADE_OUT_MS = 150;
const FIRST_AUDIO_PLAYBACK_TIMEOUT_MS = 2500;
const OUTPUT_ENERGY_SAMPLE_MS = 25;
const OUTPUT_ENERGY_CONFIRM_MS = 75;
const OUTPUT_ENERGY_THRESHOLD = 0.003;
const DECODED_SILENCE_THRESHOLD = 0.0005;
const VAD_BARGE_IN_THRESHOLD = 0.09;
const VAD_SPEECH_START_MS = 150;
const VAD_BARGE_IN_START_MS = 250;
const VAD_SILENCE_COMMIT_MS = 850;
const VAD_MINIMUM_SPEECH_MS = 300;
const VAD_MAXIMUM_TURN_MS = 60000;

class LiveCallController {
    constructor(options = {}) {
        this.api = options.api || window.WaffleBerryApi;
        this.mediaDevices = options.mediaDevices || navigator.mediaDevices;
        this.WebSocketClass = options.WebSocketClass || window.WebSocket;
        this.MediaRecorderClass = options.MediaRecorderClass || window.MediaRecorder;
        this.AudioContextClass = options.AudioContextClass || window.AudioContext || window.webkitAudioContext;
        this.AudioClass = options.AudioClass || window.Audio;
        this.URLClass = options.URLClass || window.URL;
        this.clock = options.clock || window;
        this.performance = options.performance || window.performance;
        this.random = options.random || Math.random;
        this.elements = options.elements || this.readElements();
        this.legacy = Object.prototype.hasOwnProperty.call(options, "legacy")
            ? options.legacy
            : window.WaffleBerryCompanionIdentity?.getLegacy?.();
        this.state = "idle";
        this.session = null;
        this.stream = null;
        this.socket = null;
        this.timerId = null;
        this.connectedAt = null;
        this.endPromise = null;
        this.muted = false;
        this.recorder = null;
        this.recordedChunks = [];
        this.turnId = 1;
        this.activeTurnId = null;
        this.playback = null;
        this.playbackUrl = null;
        this.responseAudio = [];
        this.responseCompleted = false;
        this.receivedAudioChunks = new Set();
        this.pcmSources = new Set();
        this.pcmNextStart = 0;
        this.pcmPlaybackTurn = null;
        this.pcmPlaybackReported = false;
        this.pcmPlaybackChain = Promise.resolve();
        this.firstAudioWatchdog = null;
        this.playbackConfirmedTurnId = null;
        this.outputRepairAttemptedTurnId = null;
        this.pendingVadSilenceMs = null;
        this.lastVoiceDetectedAt = null;
        this.turnTimings = new Map();
        this.recordingTurnId = null;
        this.audioChunkSendChain = Promise.resolve();
        this.audioChunkStarted = false;
        this.transcriptionProcessor = null;
        this.transcriptionSilentGain = null;
        this.discardRecording = false;
        this.speakerEnabled = true;
        this.transportState = "degraded";
        this.reconnectAttempt = 0;
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.heartbeatTimeout = null;
        this.heartbeatId = 0;
        this.recordingGraceTimer = null;
        this.intentionalEnd = false;
        this.socketGeneration = 0;
        this.audioContext = null;
        this.outputDestination = null;
        this.outputGain = null;
        this.outputAnalyser = null;
        this.outputContext = null;
        this.outputEnergyTimer = null;
        this.outputEnergyCandidateAt = null;
        this.outputEnergyRms = 0;
        this.pendingPlaybackConfirmation = null;
        this.decodedSources = new Set();
        this.decodedPlaybackActive = false;
        this.audioResumePromise = null;
        this.audioDiagnostics = [];
        this.debugAudio = options.debugAudio ?? (
            ["localhost", "127.0.0.1"].includes(window.location.hostname)
            || new URLSearchParams(window.location.search).has("debugAudio")
        );
        this.vadAnalyser = null;
        this.vadSource = null;
        this.vadTimer = null;
        this.vadTurnTimer = null;
        this.vadCandidateAt = null;
        this.speechStartedAt = null;
        this.lastSpeechAt = null;
        this.vadSuspended = false;
        this.greetingPlayback = false;
        this.ringbackStarted = false;
        this.ringbackActive = false;
        this.ringbackGain = null;
        this.ringbackOscillators = [];
        this.ringbackMinimumTimer = null;
        this.ringbackMinimumElapsed = false;
        this.pendingGreeting = null;
        this.pendingInitialReady = null;
        this.startupTransitioning = false;
        this.ringbackFadeTimer = null;
        this.ringbackFadeResolver = null;
        this.ringbackStartCount = 0;
        this.ringbackStopCount = 0;
        this.ringbackCreatedCount = 0;
        this.ringbackRestartCount = 0;
        this.debugLiveCall = new URLSearchParams(window.location.search).get("debugLiveCall") === "1";
        this.navigate = options.navigate || ((url) => window.location.assign(url));
        this.onEnded = options.onEnded || null;
        this.realtimeController = null;
        this.realtimeRecoveryPromise = null;
        this.realtimeReconnectCount = 0;
        this.realtimeRecoveryGeneration = 0;
        this.frontendStartupStage = "not_started";
        this.frontendFailureCategory = "none";
        this.frontendMessageCode = "none";
        this.operationalStarted = false;
        this.operationalEnded = false;
        this.operational = {
            turn_started_count: 0, turn_completed_count: 0,
            turn_failed_count: 0, turn_recovered_count: 0,
            recovery_count: 0, response_failure_count: 0,
            external_tts_failure_count: 0, memory_route_count: 0,
            memory_supported_count: 0, memory_unsupported_count: 0,
            memory_error_count: 0, memory_timeout_count: 0
        };
    }

    reportOperational(event, outcome, failureCategory = "none") {
        if (!this.session?.session_id
                || typeof this.api.reportLiveCallOperationalEvent !== "function") return Promise.resolve();
        if (event === "call_started") {
            if (this.operationalStarted) return Promise.resolve();
            this.operationalStarted = true;
        }
        if (event === "call_ended") {
            if (this.operationalEnded) return Promise.resolve();
            this.operationalEnded = true;
        }
        const durationMs = this.connectedAt ? Math.max(0, Date.now() - this.connectedAt) : 0;
        return this.api.reportLiveCallOperationalEvent(this.session.session_id, {
            event, outcome, failure_category: failureCategory,
            duration_ms: durationMs, ...this.operational
        }).catch(() => {});
    }

    countOperational(name, amount = 1) {
        if (Object.prototype.hasOwnProperty.call(this.operational, name)) {
            this.operational[name] = Math.max(0, this.operational[name] + amount);
        }
    }

    recordFrontendStartup(stage, failureCategory = "none", error = null, messageCode = "none") {
        this.frontendStartupStage = stage;
        this.frontendFailureCategory = failureCategory;
        this.frontendMessageCode = messageCode;
        if (!this.debugLiveCall) return;
        console.debug("REALTIME_FRONTEND_STARTUP", {
            stage,
            failure_category: failureCategory,
            exception_name: error?.name || "na",
            message_code: messageCode
        });
        this.renderDebugPanel();
    }

    validateRealtimeSession(session) {
        const validEngine = session?.engine === "realtime" || session?.engine === "cascade";
        const validTransport = session?.transport === "webrtc" || session?.transport === "websocket";
        const validRealtime = session?.engine !== "realtime" || (
            session.transport === "webrtc"
            && session.realtime_capable === true
            && ["realtime_native", "external_streaming_tts", "external_nonstreaming_tts"].includes(session.speech_renderer)
            && typeof session.realtime_strict === "boolean"
            && session.engine_reason === "none"
            && Boolean(session.session_id)
        );
        if (!validEngine || !validTransport || !validRealtime) {
            const error = new TypeError("Invalid Live Call session response.");
            error.frontendCategory = "invalid_session_response";
            error.messageCode = "session_contract_invalid";
            throw error;
        }
    }

    readElements() {
        return {
            status: document.getElementById("liveCallStatus"),
            timer: document.getElementById("liveCallTimer"),
            microphoneStatus: document.getElementById("liveCallMicrophoneStatus"),
            mute: document.getElementById("liveCallMuteButton"),
            speaker: document.getElementById("liveCallSpeakerButton"),
            end: document.getElementById("liveCallEndButton"),
            controls: document.getElementById("liveCallControls"),
            ended: document.getElementById("liveCallEnded"),
            relationship: document.getElementById("liveCallRelationship"),
            endedTitle: document.getElementById("liveCallEndedTitle"),
            outputAudio: document.getElementById("liveCallOutput"),
            realtimeOutput: document.getElementById("liveCallRealtimeOutput"),
            debugPanel: document.getElementById("liveCallDebugPanel"),
            debugValues: document.getElementById("liveCallDebugValues")
        };
    }

    renderDebugPanel() {
        if (!this.debugLiveCall || !this.elements.debugPanel || !this.elements.debugValues) return;
        this.elements.debugPanel.hidden = false;
        if (this.session?.engine === "realtime") {
            this.elements.debugValues.textContent = `ENGINE: ${this.session.engine.toUpperCase()}\n`
                + `RENDERER: ${this.session.speech_renderer === "realtime_native" ? "NATIVE" : "EXTERNAL"}\n`
                + `VOICE: ${String(this.session.effective_voice || "unknown").toUpperCase()}\n`
                + `STRICT: ${String(this.session.realtime_strict === true)}\n`
                + `STARTUP STAGE: ${this.frontendStartupStage}\n`
                + `LAST FAILURE: ${this.frontendFailureCategory}\n`
                + `FALLBACK REASON: ${this.session.fallback_reason || this.session.engine_reason || "none"}\n`
                + `FAILED STAGE: ${this.realtimeController?.startupStage || "none"}\n`
                + `REASON: ${this.realtimeController?.startupFailureCategory || this.frontendFailureCategory}\n`
                + `STATUS: ${this.realtimeController?.startupStatusCode ?? "na"}\n`
                + `LAST TOOL: ${this.realtimeController?.memoryDiagnostics?.last_tool || "none"}\n`
                + `TOOL STATUS: ${this.realtimeController?.memoryDiagnostics?.status || "unsupported"}\n`
                + `MEMORIES USED: ${this.realtimeController?.memoryDiagnostics?.memories_used || 0}\n`
                + `IDENTITIES USED: ${this.realtimeController?.memoryDiagnostics?.identities_used || 0}\n`
                + `TOOL LATENCY: ${this.realtimeController?.memoryDiagnostics?.tool_latency_ms ?? "na"} ms\n`
                + `FOLLOW-UP CONTEXT: ${this.realtimeController?.memoryDiagnostics?.followup_context || "none"}\n`
                + JSON.stringify(this.realtimeController?.diagnostics?.() || {}, null, 2);
            return;
        }
        const track = this.outputDestination?.stream?.getAudioTracks?.()[0];
        const output = this.elements.outputAudio;
        const lastFailure = [...this.audioDiagnostics].reverse()
            .find((entry) => entry.field === "last_failure_stage")?.value || "none";
        this.elements.debugValues.textContent = `ENGINE: ${(this.session?.engine || "pending").toUpperCase()}\n`
            + `FALLBACK REASON: ${this.session?.fallback_reason || this.session?.engine_reason || "none"}\n`
            + JSON.stringify({
            effective_voice: this.session?.effective_voice || "pending",
            base_delivery_profile: this.session?.base_delivery_profile || "identity_neutral_v1",
            audio_context_state: this.audioContext?.state || "missing",
            destination_track_state: track?.readyState || "missing",
            output_element_playing: output?.paused === false,
            speaker_enabled: this.speakerEnabled,
            output_gain: this.outputGain?.gain?.value ?? null,
            measured_rms: Number(this.outputEnergyRms.toFixed(6)),
            ringback: {
                created_count: this.ringbackCreatedCount,
                start_count: this.ringbackStartCount,
                stop_count: this.ringbackStopCount,
                restart_count: this.ringbackRestartCount,
            },
            last_failure_stage: lastFailure,
        }, null, 2);
    }

    recordAudioDiagnostic(field, value) {
        if (!this.debugAudio && !this.debugLiveCall) return;
        this.audioDiagnostics.push({ field, value, at: Math.round(this.performance.now()) });
        if (this.debugLiveCall) {
            console.debug("LIVE_CALL_AUDIO", { field, value });
            this.renderDebugPanel();
        }
    }

    getAudioContext() {
        if (!this.audioContext || this.audioContext.state === "closed") {
            this.audioContext = new this.AudioContextClass();
            this.recordAudioDiagnostic("audio_context_initial_state", this.audioContext.state);
            this.audioContext.addEventListener?.("statechange", () => {
                if (["suspended", "interrupted"].includes(this.audioContext?.state)) {
                    this.recoverAudioAfterVisibility();
                }
            });
        }
        return this.audioContext;
    }

    async resumeAudioContext() {
        const context = this.getAudioContext();
        if (context.state === "running") return true;
        if (this.audioResumePromise) return this.audioResumePromise;
        this.audioResumePromise = (async () => {
            try { await context.resume?.(); } catch { /* activation may be required */ }
            this.recordAudioDiagnostic("audio_context_after_resume", context.state);
            return context.state === "running";
        })().finally(() => { this.audioResumePromise = null; });
        return this.audioResumePromise;
    }

    async unlockHtmlAudio() {
        const probe = new this.AudioClass(
            SILENT_AUDIO_DATA_URI
        );
        probe.muted = true;
        try {
            await Promise.resolve(probe.play());
            probe.pause?.();
            return true;
        } catch {
            return false;
        }
    }

    primeAudioFromGesture() {
        // Kept temporarily for compatibility with older callers; the call flow no longer primes silence.
        return this.resumeAudioContext();
        /* istanbul ignore next -- superseded legacy implementation retained during rollout */
        if (this.audioPrimePromise) return this.audioPrimePromise;
        this.recordAudioDiagnostic("call_gesture_received", true);
        let context;
        let silentSourceStarted = false;
        let resumePromise;
        let mediaPromise;
        try {
            context = this.getAudioContext();
            this.recordAudioDiagnostic("audio_context_created_in_gesture", true);
            resumePromise = Promise.resolve(context.resume?.())
                .then(() => true, () => false);
        } catch {
            this.recordAudioDiagnostic("audio_unlock_failure_reason", "context_creation_failed");
            this.audioPrimePromise = Promise.resolve(false);
            return this.audioPrimePromise;
        }

        try {
            const buffer = context.createBuffer(1, 1, context.sampleRate || 44100);
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(context.destination);
            source.start(0);
            source.stop?.(context.currentTime + 0.005);
            this.audioPrimeSource = source;
            silentSourceStarted = true;
            this.recordAudioDiagnostic("silent_buffer_started_in_gesture", true);
        } catch {
            this.recordAudioDiagnostic("audio_unlock_failure_reason", "silent_source_start_failed");
        }

        try {
            const probe = new this.AudioClass(
                SILENT_AUDIO_DATA_URI
            );
            probe.playsInline = true;
            probe.preload = "auto";
            probe.muted = false;
            probe.volume = 0.01;
            this.recordAudioDiagnostic("html_audio_prime_started_in_gesture", true);
            mediaPromise = Promise.resolve(probe.play()).then(() => {
                probe.pause?.();
                try { probe.currentTime = 0; } catch { /* resetting is optional */ }
                this.primedMediaElement = probe;
                this.recordAudioDiagnostic("html_audio_prime_success", true);
                return true;
            }, () => false);
        } catch {
            mediaPromise = Promise.resolve(false);
        }

        const primeTimeout = new Promise((resolve) => {
            this.clock.setTimeout(() => resolve([false, false]), 900);
        });
        this.audioPrimePromise = Promise.race([
            Promise.all([resumePromise, mediaPromise]),
            primeTimeout
        ])
            .then(async ([resumeAccepted, mediaReady]) => {
                const contextRunning = await this.waitForRunningAudioContext();
                this.recordAudioDiagnostic("audio_context_post_prime_state", context.state);
                const verified = silentSourceStarted && mediaReady && contextRunning;
                this.audioUnlocked = verified;
                this.recordAudioDiagnostic("audio_unlock_verified", verified);
                if (!verified) {
                    const reason = context.state === "closed" ? "context_closed"
                        : !resumeAccepted ? "context_resume_rejected"
                        : !silentSourceStarted ? "silent_source_start_failed"
                        : !mediaReady ? "html_media_blocked"
                        : context.state !== "running" ? "context_never_running"
                        : "unknown";
                    this.recordAudioDiagnostic("audio_unlock_failure_reason", reason);
                }
                return verified;
            });
        return this.audioPrimePromise;
    }

    waitForRunningAudioContext(timeoutMs = 900) {
        const context = this.audioContext;
        if (context?.state === "running") return Promise.resolve(true);
        if (!context || context.state === "closed") return Promise.resolve(false);
        const startedAt = this.performance.now();
        return new Promise((resolve) => {
            const inspect = () => {
                if (context.state === "running") return resolve(true);
                if (context.state === "closed"
                        || this.performance.now() - startedAt >= timeoutMs) return resolve(false);
                this.clock.setTimeout(inspect, 30);
            };
            inspect();
        });
    }

    createAudioPlayback(url) {
        const playback = this.primedMediaElement || new this.AudioClass(url);
        if (this.primedMediaElement) playback.src = url;
        playback.playsInline = true;
        return playback;
    }

    requestAudioUnlock() {
        if (this.audioUnlocked && this.audioContext?.state === "running") {
            return Promise.resolve(true);
        }
        if (!this.allowAudioUnlockPrompt) {
            this.fail("Sound isn’t available for this call. Please try again.");
            return Promise.resolve(false);
        }
        if (!this.audioUnlockPromise) {
            this.recordAudioDiagnostic("audio_unlock_required", true);
            this.elements.audioUnlock.hidden = false;
            this.elements.audioUnlock.focus?.({ preventScroll: true });
            this.elements.status.textContent = "Ready when you are";
            this.audioUnlockPromise = new Promise((resolve) => {
                this.audioUnlockResolve = resolve;
            });
        }
        return this.audioUnlockPromise;
    }

    async activateAudio() {
        const contextPromise = this.resumeAudioContext();
        const blockedPlayback = this.pendingBlockedPlayback;
        const mediaPromise = blockedPlayback
            ? Promise.resolve(blockedPlayback.media.play())
                .then(() => true, () => false)
            : this.unlockHtmlAudio();
        const [contextReady, mediaReady] = await Promise.all([
            contextPromise, mediaPromise
        ]);
        if (!contextReady || !mediaReady) return false;
        this.audioUnlocked = true;
        if (this.pendingBlockedPlayback === blockedPlayback) {
            this.pendingBlockedPlayback = null;
        }
        if (this.elements.audioUnlock) this.elements.audioUnlock.hidden = true;
        this.recordAudioDiagnostic("audio_unlock_success", true);
        this.handleAudioOutputReady();
        const resolve = this.audioUnlockResolve;
        this.audioUnlockResolve = null;
        this.audioUnlockPromise = null;
        resolve?.(true);
        return true;
    }

    isAudioActivationError(error) {
        return ["NotAllowedError", "AbortError"].includes(error?.name)
            || this.audioContext?.state === "suspended"
            || this.audioContext?.state === "interrupted";
    }

    handleBlockedMediaPlayback(error, media, onFailure) {
        this.recordAudioDiagnostic("html_audio_play_rejected", error?.name || "play_rejected");
        if (!this.isAudioActivationError(error) || this.intentionalEnd) {
            onFailure();
            return;
        }
        this.audioUnlocked = false;
        this.pendingBlockedPlayback = { media, onFailure };
        this.requestAudioUnlock();
    }

    async ensureAudioReady() {
        if (await this.resumeAudioContext()) {
            this.audioUnlocked = true;
            return true;
        }
        return this.requestAudioUnlock();
    }

    prepareAudioOutput() {
        if (this.audioPrimePromise) {
            this.audioPrimePromise.then((verified) => {
                if (this.intentionalEnd) return;
                if (!verified) {
                    this.fail("Sound isn’t available for this call. Please try again.");
                    return;
                }
                this.handleAudioOutputReady();
            });
            return;
        }
        this.resumeAudioContext().then((running) => {
            if (this.intentionalEnd) return;
            if (!running) {
                this.requestAudioUnlock();
                return;
            }
            this.audioUnlocked = true;
            this.handleAudioOutputReady();
        });
    }

    handleAudioOutputReady() {
        if (this.intentionalEnd || !this.speakerEnabled || this.state !== "connecting") return;
        if (this.pendingInitialReady) {
            this.ringbackMinimumElapsed = true;
            this.completeInitialConnection();
            return;
        }
        this.startRingback();
    }

    setState(nextState, message) {
        if (!CALL_STATES.includes(nextState)) throw new Error("Invalid call state.");
        this.state = nextState;
        document.body.dataset.callState = nextState;
        if (message) this.elements.status.textContent = message;
        document.dispatchEvent(new CustomEvent("waffleberry:livecallstate", {
            detail: { state: nextState }
        }));
    }

    setTransportState(nextState, message) {
        if (!TRANSPORT_STATES.includes(nextState)) throw new Error("Invalid transport state.");
        this.transportState = nextState;
        document.body.dataset.transportState = nextState;
        if (message) this.elements.status.textContent = message;
        document.dispatchEvent(new CustomEvent("waffleberry:livecalltransport", {
            detail: { state: nextState }
        }));
    }

    async start() {
        if (this.state !== "idle") return;
        this.setState("connecting", "Connecting…");
        if (!this.legacy?.backendLegacyId) {
            return this.fail("This Companion is not available for Live Call.");
        }
        if (!this.mediaDevices?.getUserMedia || !this.AudioContextClass) {
            return this.fail("Live Call is not supported in this browser.");
        }
        this.elements.relationship.textContent = this.legacy.relationship;
        try {
            this.recordFrontendStartup("microphone_request_started");
            this.stream = await this.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: false
            });
            this.recordFrontendStartup("microphone_acquired");
            if (this.intentionalEnd) return this.releaseMicrophone();
            this.elements.microphoneStatus.textContent = "Microphone ready";
            await this.resumeAudioContext();
            this.startRingback();
            if (this.intentionalEnd) return this.releaseMicrophone();
            const requestedEngine = new URLSearchParams(window.location.search).get("engine") || "auto";
            this.session = await this.api.createLiveCallSession(
                this.legacy.backendLegacyId, requestedEngine
            );
            this.recordFrontendStartup("session_response_received");
            this.validateRealtimeSession(this.session);
            this.recordFrontendStartup("engine_validated");
            if (this.intentionalEnd) {
                try { await this.api.endLiveCallSession(this.session.session_id); } catch { /* local cleanup won */ }
                return;
            }
            if (this.session.engine === "realtime") {
                try {
                    const RealtimeController = window.WaffleBerryRealtimeLiveCall?.RealtimeLiveCallController;
                    if (!window.WaffleBerryRealtimeLiveCall) {
                        const error = new Error("Realtime module unavailable.");
                        error.frontendCategory = "realtime_module_missing";
                        error.messageCode = "realtime_module_missing";
                        throw error;
                    }
                    this.recordFrontendStartup("realtime_module_available");
                    if (!RealtimeController) {
                        const error = new Error("Realtime controller unavailable.");
                        error.frontendCategory = "realtime_controller_missing";
                        error.messageCode = "realtime_export_missing";
                        throw error;
                    }
                    this.recordFrontendStartup("realtime_controller_constructing");
                    try {
                        this.realtimeController = new RealtimeController(this);
                    } catch (error) {
                        error.frontendCategory = "controller_constructor_failed";
                        error.messageCode = "realtime_constructor_failed";
                        throw error;
                    }
                    this.recordFrontendStartup("realtime_controller_constructed");
                    this.recordFrontendStartup("realtime_start_entered");
                    await this.realtimeController.start();
                    this.recordEngineDecision("none");
                    return;
                } catch (error) {
                    this.recordFrontendStartup(
                        this.frontendStartupStage,
                        error?.frontendCategory || this.realtimeController?.startupFailureCategory
                            || "unknown_frontend_startup",
                        error,
                        error?.messageCode || "realtime_start_failed"
                    );
                    const fallbackReason = this.realtimeStartupFailureReason(error);
                    this.realtimeController?.close();
                    if (this.session.realtime_strict) {
                        this.session.fallback_reason = fallbackReason;
                        const failedSessionId = this.session.session_id;
                        await this.reportOperational("call_ended", "startup_failed",
                            this.operationalFailureCategory(error));
                        try { await this.api.endLiveCallSession(failedSessionId); } catch { /* best effort */ }
                        this.renderDebugPanel();
                        this.recordEngineDecision(fallbackReason);
                        throw error;
                    }
                    this.realtimeController = null;
                    const failedSessionId = this.session.session_id;
                    await this.reportOperational("call_ended", "startup_failed",
                        this.operationalFailureCategory(error));
                    try { await this.api.endLiveCallSession(failedSessionId); } catch { /* best effort */ }
                    this.session = await this.api.createLiveCallSession(
                        this.legacy.backendLegacyId, "cascade"
                    );
                    this.session.fallback_reason = fallbackReason;
                    this.operationalStarted = false;
                    this.operationalEnded = false;
                }
            }
            if (!this.WebSocketClass || !this.MediaRecorderClass) {
                throw new Error("Cascade Live Call is unavailable.");
            }
            await this.initializeCallAudioOutput();
            await this.initializeVad();
            this.recordEngineDecision(this.session.fallback_reason || this.session.engine_reason || "none");
            this.connectTransport();
        } catch (error) {
            if (this.session?.engine === "realtime") {
                this.recordFrontendStartup(
                    this.frontendStartupStage,
                    error?.frontendCategory || this.frontendFailureCategory
                        || "unknown_frontend_startup",
                    error,
                    error?.messageCode || this.frontendMessageCode || "startup_failed"
                );
            }
            this.releaseMicrophone();
            if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
                return this.fail("Microphone access is needed for Live Call.");
            }
            if (error?.status === 401) {
                return this.fail("Your session has expired. Please sign in again.");
            }
            return this.fail("We couldn’t start the call. Please try again.");
        }
    }

    realtimeStartupFailureReason(error) {
        const stage = error?.realtimeStage || this.realtimeController?.startupStage || "unknown";
        if (stage === "bootstrap_failed") return "bootstrap_failed";
        if (["peer_connection_created", "peer_connection_failed", "local_track_added",
            "offer_created", "local_description_set"].includes(stage)) {
            return "webrtc_setup_failed";
        }
        if (["sdp_exchange_started", "sdp_exchange_failed", "sdp_exchange_completed",
            "remote_description_failed", "remote_description_set"].includes(stage)) {
            return "webrtc_setup_failed";
        }
        if (["data_channel_failed", "data_channel_timeout"].includes(stage)) {
            return "data_channel_failed";
        }
        return "frontend_capability_failed";
    }

    operationalFailureCategory(error) {
        const provider = this.realtimeController?.lastProviderFailureCategory;
        if (["provider_rate_limited", "provider_quota_exhausted"].includes(provider)) return provider;
        if (provider === "provider_transient") return "provider_transient_failure";
        const stage = error?.realtimeStage || this.realtimeController?.startupStage
            || this.frontendStartupStage || "unknown";
        if (stage.includes("bootstrap")) return "bootstrap";
        if (stage.includes("peer") || stage.includes("local_track") || stage.includes("offer")) return "peer_connection";
        if (stage.includes("sdp") || stage.includes("description")) return "sdp_exchange";
        if (stage.includes("data_channel")) return "data_channel";
        if (stage.includes("microphone")) return "microphone";
        return "unknown";
    }

    recoverRealtimeTransport(reason) {
        if (this.session?.engine !== "realtime" || this.intentionalEnd
                || ["ending", "ended", "error"].includes(this.state)) return Promise.resolve(false);
        if (this.realtimeRecoveryPromise) return this.realtimeRecoveryPromise;
        if (this.realtimeReconnectCount >= 2) {
            this.realtimeController?.close();
            this.fail("We couldn’t continue the call.");
            return Promise.resolve(false);
        }
        const recoveryGeneration = ++this.realtimeRecoveryGeneration;
        this.realtimeReconnectCount += 1;
        this.setTransportState("reconnecting", "Reconnecting…");
        this.stopRingback();
        const oldController = this.realtimeController;
        oldController?.invalidateForRecovery?.(reason);
        oldController?.close();
        this.realtimeRecoveryPromise = Promise.resolve().then(async () => {
            if (this.intentionalEnd || recoveryGeneration !== this.realtimeRecoveryGeneration) return false;
            const RealtimeController = window.WaffleBerryRealtimeLiveCall?.RealtimeLiveCallController;
            if (!RealtimeController) throw new Error("Realtime recovery unavailable.");
            const replacement = new RealtimeController(this);
            replacement.greetingSent = true;
            replacement.reconnectCount = this.realtimeReconnectCount;
            replacement.lastRecoveryReason = reason;
            this.realtimeController = replacement;
            await replacement.start();
            if (this.intentionalEnd || recoveryGeneration !== this.realtimeRecoveryGeneration) {
                replacement.close();
                return false;
            }
            this.setTransportState("connected");
            this.setState("listening", this.muted ? "Muted" : "Listening");
            replacement.metric("successful_recovery_count", 1);
            return true;
        }).catch(() => {
            if (!this.intentionalEnd && recoveryGeneration === this.realtimeRecoveryGeneration) {
                this.realtimeController?.metric("failed_recovery_count", 1);
                this.fail("We couldn’t continue the call.");
            }
            return false;
        }).finally(() => {
            if (recoveryGeneration === this.realtimeRecoveryGeneration) this.realtimeRecoveryPromise = null;
        });
        return this.realtimeRecoveryPromise;
    }

    recordEngineDecision(fallbackReason) {
        if (!this.debugLiveCall) return;
        console.debug("LIVE_CALL_ENGINE", {
            session_id_safe: this.session?.session_id?.slice(-8) || "none",
            effective_voice: this.session?.effective_voice || "unknown",
            feature_enabled: this.session?.engine === "realtime"
                || this.session?.engine_reason !== "feature_flag_disabled",
            voice_realtime_capable: this.session?.realtime_capable ?? false,
            selected_engine: this.session?.engine || "unknown",
            fallback_reason: fallbackReason || "none"
        });
        this.renderDebugPanel();
    }

    async initializeCallAudioOutput() {
        if (this.outputDestination) return;
        const microphoneTrack = this.stream?.getAudioTracks?.()[0];
        this.recordAudioDiagnostic("mic_capture_active", microphoneTrack?.readyState === "live");
        if (microphoneTrack?.readyState !== "live") throw new Error("Microphone capture is not active.");
        const context = this.getAudioContext();
        await this.resumeAudioContext();
        this.recordAudioDiagnostic("audio_context_state", context.state);
        this.outputDestination = context.createMediaStreamDestination();
        this.outputContext = context;
        this.outputGain = context.createGain();
        this.outputAnalyser = context.createAnalyser();
        this.outputAnalyser.fftSize = 1024;
        this.outputAnalyser.smoothingTimeConstant = 0.1;
        this.outputGain.gain.value = this.speakerEnabled ? 1 : 0;
        this.outputGain.connect(this.outputAnalyser);
        this.outputAnalyser.connect(this.outputDestination);
        this.recordAudioDiagnostic("output_media_stream_created", true);
        const output = this.elements.outputAudio;
        output.autoplay = true;
        output.playsInline = true;
        output.muted = false;
        output.volume = 1;
        output.srcObject = this.outputDestination.stream;
        this.recordAudioDiagnostic("output_audio_srcobject_attached", true);
        this.recordAudioDiagnostic("destination_track_ready_state",
            this.outputDestination.stream?.getAudioTracks?.()[0]?.readyState || "unknown");
        try {
            await Promise.resolve(output.play());
            this.recordAudioDiagnostic("output_audio_play_resolved", true);
        } catch {
            this.recordAudioDiagnostic("output_audio_play_rejected", true);
        }
        if (this.outputEnergyTimer === null) {
            this.outputEnergyTimer = this.clock.setInterval(
                () => this.sampleOutputEnergy(), OUTPUT_ENERGY_SAMPLE_MS
            );
        }
    }

    async ensureOutputRouteHealthy(turnId = null) {
        if (!this.speakerEnabled || !this.outputDestination || !this.outputGain
                || !this.outputAnalyser) return false;
        const context = this.getAudioContext();
        const output = this.elements.outputAudio;
        const track = this.outputDestination.stream?.getAudioTracks?.()[0];
        const inspect = () => context.state === "running"
            && track?.readyState === "live"
            && output?.srcObject === this.outputDestination.stream
            && output?.paused !== true
            && this.outputGain.gain.value > 0;
        if (inspect()) return true;
        if (turnId !== null && this.outputRepairAttemptedTurnId === turnId) return false;
        this.outputRepairAttemptedTurnId = turnId;
        await this.resumeAudioContext();
        if (output && output.srcObject !== this.outputDestination.stream) {
            output.srcObject = this.outputDestination.stream;
        }
        try { await Promise.resolve(output?.play?.()); } catch { /* bounded repair failed */ }
        const healthy = inspect();
        this.recordAudioDiagnostic("output_route_repaired", healthy);
        return healthy;
    }

    decodedSignal(buffer) {
        let peak = 0;
        let squared = 0;
        let count = 0;
        for (let channel = 0; channel < (buffer.numberOfChannels || 0); channel += 1) {
            const samples = buffer.getChannelData(channel);
            count += samples.length;
            for (const sample of samples) {
                const amplitude = Math.abs(sample);
                peak = Math.max(peak, amplitude);
                squared += sample * sample;
            }
        }
        const signal = {
            durationMs: Math.round((buffer.duration || 0) * 1000),
            channels: buffer.numberOfChannels || 0,
            samples: count,
            peak,
            rms: count ? Math.sqrt(squared / count) : 0,
        };
        this.recordAudioDiagnostic("decoded_duration_ms", signal.durationMs);
        this.recordAudioDiagnostic("decoded_peak", Number(signal.peak.toFixed(6)));
        return signal;
    }

    sampleOutputEnergy() {
        if (!this.outputAnalyser) return;
        const samples = new Float32Array(this.outputAnalyser.fftSize);
        this.outputAnalyser.getFloatTimeDomainData(samples);
        this.outputEnergyRms = Math.sqrt(
            samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length
        );
        if (!this.pendingPlaybackConfirmation || !this.speakerEnabled
                || this.outputEnergyRms < OUTPUT_ENERGY_THRESHOLD) {
            this.outputEnergyCandidateAt = null;
            return;
        }
        const now = this.performance.now();
        this.outputEnergyCandidateAt ??= now;
        if (now - this.outputEnergyCandidateAt < OUTPUT_ENERGY_CONFIRM_MS) return;
        const pending = this.pendingPlaybackConfirmation;
        this.pendingPlaybackConfirmation = null;
        this.outputEnergyCandidateAt = null;
        this.recordAudioDiagnostic("energy_detected", true);
        this.recordAudioDiagnostic("energy_first_ms", Math.round(now - pending.startedAt));
        this.clearFirstAudioWatchdog();
        if (pending.greeting) {
            this.setState("greeting", "Speaking");
            this.sendEvent("latency.greeting_playback_started");
            return;
        }
        if (pending.turnId !== this.activeTurnId) return;
        this.playbackConfirmedTurnId = pending.turnId;
        this.setState("speaking", "Speaking");
        this.markTurnTiming(pending.turnId, "first_audible_playback");
        this.sendEvent("latency.playback_started", { turn_id: pending.turnId });
    }

    armFirstAudioWatchdog(turnId, greeting = false) {
        if ((!greeting && this.playbackConfirmedTurnId === turnId)
                || this.firstAudioWatchdog !== null) return;
        this.firstAudioWatchdog = this.clock.setTimeout(async () => {
            this.firstAudioWatchdog = null;
            if ((!greeting && turnId !== this.activeTurnId)
                    || (!greeting && this.playbackConfirmedTurnId === turnId)) return;
            this.recordAudioDiagnostic("watchdog_fired", true);
            if ((!greeting && turnId !== this.activeTurnId)
                    || (!greeting && this.playbackConfirmedTurnId === turnId)) return;
            const pending = this.pendingPlaybackConfirmation;
            this.pendingPlaybackConfirmation = null;
            this.clearPcmPlayback();
            this.clearDecodedPlayback();
            const retried = pending?.retry === 0 && await this.repairOutputRoute(turnId);
            if (retried) return this.replayPendingPlayback(pending);
            this.recoverTurn("playback_energy_timeout");
        }, FIRST_AUDIO_PLAYBACK_TIMEOUT_MS);
    }

    clearFirstAudioWatchdog() {
        if (this.firstAudioWatchdog !== null) this.clock.clearTimeout(this.firstAudioWatchdog);
        this.firstAudioWatchdog = null;
    }

    async confirmPlayback(turnId, greeting = false) {
        if (!greeting && turnId !== this.activeTurnId) return false;
        if (!await this.ensureOutputRouteHealthy(turnId)) return false;
        this.pendingPlaybackConfirmation = {
            ...(this.pendingPlaybackConfirmation || {}),
            turnId, greeting, startedAt: this.performance.now(),
        };
        this.armFirstAudioWatchdog(turnId, greeting);
        return true;
    }

    async repairOutputRoute(turnId) {
        this.recordAudioDiagnostic("route_repair_attempted", true);
        const context = this.getAudioContext();
        const track = this.outputDestination?.stream?.getAudioTracks?.()[0];
        if (!this.outputDestination || !this.outputAnalyser || this.outputContext !== context
                || context.state === "closed"
                || track?.readyState !== "live") {
            this.outputDestination = null;
            this.outputGain = null;
            this.outputAnalyser = null;
            this.outputContext = null;
            await this.initializeCallAudioOutput();
        }
        const healthy = await this.ensureOutputRouteHealthy(turnId);
        this.recordAudioDiagnostic("route_repair_success", healthy);
        return healthy;
    }

    replayPendingPlayback(pending) {
        if (!pending) return this.recoverTurn("output_route_failed");
        pending.retry = 1;
        if (pending.kind === "decoded") {
            pending.chunk.retry = 1;
            this.responseAudio.unshift(pending.chunk);
            return this.playResponse(pending.turnId);
        }
        if (pending.kind === "pcm") {
            pending.message._playbackRetry = 1;
            return this.queuePcmChunk(pending.message);
        }
        if (pending.kind === "greeting") {
            pending.message._playbackRetry = 1;
            this.greetingPlayback = false;
            return this.playGreeting(pending.message);
        }
        this.recoverTurn("output_route_failed");
    }

    startRingback() {
        if (this.ringbackStarted || !this.speakerEnabled || this.intentionalEnd) return;
        const context = this.getAudioContext();
        if (context.state !== "running") return;
        this.ringbackStarted = true;
        this.ringbackActive = true;
        this.ringbackStartCount += 1;
        this.recordAudioDiagnostic("ringback_start_count", this.ringbackStartCount);
        this.ringbackMinimumTimer = this.clock.setTimeout(() => {
            this.ringbackMinimumTimer = null;
            this.ringbackMinimumElapsed = true;
            this.completeInitialConnection();
        }, MINIMUM_CONNECTING_MS);
        try {
            const gain = context.createGain();
            this.ringbackGain = gain;
            gain.gain.value = RINGBACK_GAIN;
            gain.connect(this.outputGain || context.destination);
            const oscillator = context.createOscillator();
            oscillator.type = "sine";
            oscillator.frequency.value = 460;
            oscillator.connect(gain);
            this.ringbackCreatedCount += 1;
            oscillator.start();
            this.ringbackOscillators = [oscillator];
            this.recordAudioDiagnostic("ringback_started", true);
            this.recordAudioDiagnostic("ringback_source_started", true);
        } catch {
            this.stopRingbackTone();
        }
    }

    stopRingbackTone() {
        this.ringbackOscillators.forEach((oscillator) => {
            try { oscillator.stop(); } catch { /* already stopped */ }
            oscillator.disconnect?.();
        });
        this.ringbackOscillators = [];
        this.ringbackGain?.disconnect?.();
        this.ringbackGain = null;
    }

    closeRingbackAudio() {
        this.stopRingbackTone();
    }

    stopRingback(discardPendingGreeting = true, fadeOut = false) {
        if (this.ringbackActive) {
            this.ringbackStopCount += 1;
            this.recordAudioDiagnostic("ringback_stop_count", this.ringbackStopCount);
        }
        this.ringbackActive = false;
        if (this.ringbackMinimumTimer !== null) this.clock.clearTimeout(this.ringbackMinimumTimer);
        this.ringbackMinimumTimer = null;
        this.ringbackMinimumElapsed = true;
        if (discardPendingGreeting) this.pendingGreeting = null;
        if (this.ringbackFadeTimer !== null) this.clock.clearTimeout(this.ringbackFadeTimer);
        this.ringbackFadeTimer = null;
        this.ringbackFadeResolver?.();
        this.ringbackFadeResolver = null;
        if (fadeOut && this.ringbackGain && this.audioContext) {
            const now = this.audioContext.currentTime;
            this.ringbackGain.gain.cancelScheduledValues?.(now);
            this.ringbackGain.gain.setValueAtTime?.(this.ringbackGain.gain.value, now);
            this.ringbackGain.gain.linearRampToValueAtTime?.(0, now + RINGBACK_FADE_OUT_MS / 1000);
            return new Promise((resolve) => {
                this.ringbackFadeResolver = resolve;
                this.ringbackFadeTimer = this.clock.setTimeout(() => {
                    this.ringbackFadeTimer = null;
                    this.ringbackFadeResolver = null;
                    this.closeRingbackAudio();
                    resolve();
                }, RINGBACK_FADE_OUT_MS);
            });
        }
        this.closeRingbackAudio();
        return Promise.resolve();
    }

    async initializeVad() {
        if (!this.AudioContextClass || this.vadAnalyser || !this.stream) return;
        this.getAudioContext();
        this.vadAnalyser = this.audioContext.createAnalyser();
        this.vadAnalyser.fftSize = 1024;
        this.vadAnalyser.smoothingTimeConstant = 0.2;
        this.vadSource = this.audioContext.createMediaStreamSource(this.stream);
        this.vadSource.connect(this.vadAnalyser);
        this.vadTimer = this.clock.setInterval(() => this.sampleVoiceActivity(), VAD_SAMPLE_INTERVAL_MS);
    }

    sampleVoiceActivity() {
        if (!this.vadAnalyser || this.vadSuspended || this.muted
                || this.transportState !== "connected" || this.greetingPlayback
                || !["listening", "speaking", "user_speaking"].includes(this.state)) {
            this.vadCandidateAt = null;
            return;
        }
        const samples = new Float32Array(this.vadAnalyser.fftSize);
        this.vadAnalyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        const now = Date.now();
        const bargeIn = this.state === "speaking";
        const threshold = bargeIn ? VAD_BARGE_IN_THRESHOLD : VAD_SPEECH_THRESHOLD;
        const startDuration = bargeIn ? VAD_BARGE_IN_START_MS : VAD_SPEECH_START_MS;
        if (rms >= threshold) {
            this.lastSpeechAt = now;
            this.lastVoiceDetectedAt = this.performance.now();
            if (this.recorder?.state === "recording" && this.recordingTurnId) {
                const timing = this.turnTimings.get(this.recordingTurnId);
                if (timing) timing.marks.vad_last_voice_detected = this.lastVoiceDetectedAt;
            }
            this.vadCandidateAt ??= now;
            if (!this.recorder && now - this.vadCandidateAt >= startDuration) {
                this.startAutomaticTurn(now);
            }
            return;
        }
        this.vadCandidateAt = null;
        if (this.recorder?.state === "recording" && this.lastSpeechAt
                && now - this.lastSpeechAt >= VAD_SILENCE_COMMIT_MS) {
            this.finishAutomaticTurn(now);
        }
    }

    startAutomaticTurn(now = Date.now()) {
        if (this.recorder || this.muted || this.vadSuspended
                || this.transportState !== "connected" || !this.stream) return;
        if (this.state === "speaking") this.interruptPlayback();
        const mimeType = this.preferredMimeType();
        this.recordedChunks = [];
        this.discardRecording = false;
        this.responseCompleted = false;
        this.receivedAudioChunks.clear();
        this.clearPcmPlayback();
        this.speechStartedAt = now;
        this.lastSpeechAt = now;
        this.recordingTurnId = this.turnId++;
        this.countOperational("turn_started_count");
        this.turnTimings.set(this.recordingTurnId, {
            marks: { vad_last_voice_detected: this.lastVoiceDetectedAt },
            streaming_stt_active: false,
            streaming_stt_fallback_reason: "unsupported",
            streaming_tts_active: false,
            streaming_tts_fallback_reason: "no_audio",
            pcm_capture_started: false,
            pcm_input_sample_rate: null,
            pcm_output_sample_rate: 24000,
            pcm_chunks_sent: 0,
            pcm_bytes_sent: 0,
        });
        this.audioChunkStarted = false;
        this.audioChunkSendChain = Promise.resolve();
        this.recorder = mimeType
            ? new this.MediaRecorderClass(this.stream, { mimeType })
            : new this.MediaRecorderClass(this.stream);
        this.recorder.addEventListener("dataavailable", (event) => {
            if (!event.data?.size) return;
            if (Number.isFinite(this.turnTimings.get(this.recordingTurnId)?.marks.mediarecorder_stop_called)) {
                this.markTurnTiming(this.recordingTurnId, "mediarecorder_final_dataavailable");
            }
            this.recordedChunks.push(event.data);
            const turnId = this.recordingTurnId;
            const start = !this.audioChunkStarted;
            this.audioChunkStarted = true;
            this.audioChunkSendChain = this.audioChunkSendChain.then(
                () => this.sendLiveAudioChunk(event.data, turnId, start, mimeType)
            );
        });
        this.recorder.addEventListener("stop", () => {
            this.markTurnTiming(this.recordingTurnId, "mediarecorder_stop_event");
            this.commitRecording(mimeType);
        });
        const streamingSttStarted = this.startStreamingTranscription(this.recordingTurnId);
        const timing = this.turnTimings.get(this.recordingTurnId);
        timing.streaming_stt_active = streamingSttStarted;
        timing.streaming_stt_fallback_reason = streamingSttStarted ? "none" : "unsupported";
        this.recorder.start(250);
        document.body.dataset.recording = "true";
        this.setState("user_speaking", "Listening");
        this.elements.microphoneStatus.textContent = "You are speaking";
        this.vadTurnTimer = this.clock.setTimeout(
            () => this.finishAutomaticTurn(Date.now(), true), VAD_MAXIMUM_TURN_MS
        );
    }

    finishAutomaticTurn(now = Date.now(), maximumReached = false) {
        if (this.recorder?.state !== "recording") return;
        if (!maximumReached && (!this.speechStartedAt || !this.lastSpeechAt
                || this.lastSpeechAt - this.speechStartedAt < VAD_MINIMUM_SPEECH_MS)) {
            this.discardRecording = true;
        }
        if (this.vadTurnTimer !== null) this.clock.clearTimeout(this.vadTurnTimer);
        this.pendingVadSilenceMs = this.lastSpeechAt
            ? Math.max(0, Math.round(now - this.lastSpeechAt))
            : null;
        this.markTurnTiming(this.recordingTurnId, "vad_silence_commit");
        this.vadTurnTimer = null;
        this.stopStreamingTranscription();
        this.activeTurnId = this.recordingTurnId;
        this.playbackConfirmedTurnId = null;
        this.outputRepairAttemptedTurnId = null;
        this.markTurnTiming(this.recordingTurnId, "realtime_commit_sent");
        this.sendEvent("transcription.commit", {
            turn_id: this.recordingTurnId,
            vad_silence_ms: this.pendingVadSilenceMs
        });
        this.markTurnTiming(this.recordingTurnId, "mediarecorder_stop_called");
        this.recorder.requestData?.();
        this.recorder.stop();
        document.body.dataset.recording = "false";
        this.setState(this.discardRecording ? "listening" : "processing",
            this.discardRecording ? "Listening" : "Thinking");
        this.recorder = null;
        this.speechStartedAt = null;
        this.lastSpeechAt = null;
    }

    stopVad() {
        this.stopStreamingTranscription();
        if (this.vadTimer !== null) this.clock.clearInterval(this.vadTimer);
        if (this.vadTurnTimer !== null) this.clock.clearTimeout(this.vadTurnTimer);
        this.vadTimer = null;
        this.vadTurnTimer = null;
        this.vadSource?.disconnect?.();
        this.vadSource = null;
        this.vadAnalyser = null;
    }

    closeAudioContext() {
        const context = this.audioContext;
        this.clearDecodedPlayback();
        this.outputGain?.disconnect?.();
        this.outputAnalyser?.disconnect?.();
        this.outputDestination?.disconnect?.();
        this.outputGain = null;
        this.outputAnalyser = null;
        this.outputContext = null;
        this.outputDestination = null;
        if (this.outputEnergyTimer !== null) this.clock.clearInterval(this.outputEnergyTimer);
        this.outputEnergyTimer = null;
        this.pendingPlaybackConfirmation = null;
        if (this.elements.outputAudio) {
            this.elements.outputAudio.pause?.();
            this.elements.outputAudio.srcObject = null;
        }
        this.audioContext = null;
        this.audioUnlocked = false;
        this.pendingBlockedPlayback = null;
        this.audioPrimeSource?.disconnect?.();
        this.audioPrimeSource = null;
        this.audioPrimePromise = null;
        if (this.primedMediaElement) {
            this.primedMediaElement.pause?.();
            this.primedMediaElement.src = "";
        }
        this.primedMediaElement = null;
        if (this.elements.audioUnlock) this.elements.audioUnlock.hidden = true;
        this.audioUnlockResolve?.(false);
        this.audioUnlockResolve = null;
        this.audioUnlockPromise = null;
        if (context && context.state !== "closed") Promise.resolve(context.close?.()).catch(() => {});
    }

    startStreamingTranscription(turnId) {
        if (!this.audioContext?.createScriptProcessor || !this.vadSource || !turnId) return false;
        const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        const silentGain = this.audioContext.createGain();
        silentGain.gain.value = 0;
        processor.connect(silentGain);
        silentGain.connect(this.audioContext.destination);
        this.vadSource.connect(processor);
        processor.onaudioprocess = (event) => {
            if (turnId !== this.recordingTurnId || this.transportState !== "connected") return;
            const input = event.inputBuffer.getChannelData(0);
            const inputRate = this.audioContext.sampleRate;
            const outputLength = Math.max(1, Math.floor(input.length * 24000 / inputRate));
            const pcm = new ArrayBuffer(outputLength * 2);
            const view = new DataView(pcm);
            for (let index = 0; index < outputLength; index += 1) {
                const sourceIndex = Math.min(input.length - 1, Math.floor(index * inputRate / 24000));
                const sample = Math.max(-1, Math.min(1, input[sourceIndex]));
                view.setInt16(index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
            }
            const bytes = new Uint8Array(pcm);
            let binary = "";
            bytes.forEach((value) => { binary += String.fromCharCode(value); });
            const sent = this.sendEvent("transcription.audio", { turn_id: turnId, data: btoa(binary) });
            const timing = this.turnTimings.get(turnId);
            if (sent && timing) {
                timing.pcm_capture_started = true;
                timing.pcm_input_sample_rate = inputRate;
                timing.pcm_chunks_sent += 1;
                timing.pcm_bytes_sent += bytes.byteLength;
            }
        };
        this.transcriptionProcessor = processor;
        this.transcriptionSilentGain = silentGain;
        return true;
    }

    stopStreamingTranscription() {
        if (this.transcriptionProcessor) this.transcriptionProcessor.onaudioprocess = null;
        this.transcriptionProcessor?.disconnect?.();
        this.transcriptionSilentGain?.disconnect?.();
        this.transcriptionProcessor = null;
        this.transcriptionSilentGain = null;
    }

    connectTransport(resume = false) {
        if (this.intentionalEnd || !this.session) return;
        const generation = ++this.socketGeneration;
        const protocols = [
            "waffleberry.live-call.v1",
            `auth.${this.session.transport_token}`
        ];
        this.socket = new this.WebSocketClass(
            this.api.liveCallWebSocketUrl(this.session.session_id),
            protocols
        );
        this.socket.addEventListener("open", () => {
            if (generation !== this.socketGeneration) return;
            this.sendEvent("session.start", {
                resume,
                last_client_turn_id: this.turnId - 1
            });
        });
        this.socket.addEventListener("message", (event) => {
            if (generation !== this.socketGeneration) return;
            let message;
            try { message = JSON.parse(event.data); } catch { return this.failTransport(); }
            if (message.version !== EVENT_VERSION) return this.failTransport();
            if (message.type === "session.ready") this.connected(message, resume);
            if (message.type === "heartbeat.pong") this.receiveHeartbeat(message);
            if (message.type === "greeting.started") this.beginGreeting();
            if (message.type === "greeting.audio") this.playGreeting(message);
            if (message.type === "greeting.failed") this.finishGreeting();
            if (message.type === "greeting.completed"
                    && !this.greetingPlayback && !this.pendingGreeting) this.finishGreeting();
            if (["transcription.final", "response.started", "response.text.delta", "audio.chunk", "response.completed", "latency.commit_received"].includes(message.type)) {
                this.handleTurnEvent(message);
            }
            if (message.type === "session.ended" && this.state !== "ended") {
                this.sessionEndResolver?.();
                this.sessionEndResolver = null;
                if (this.state !== "ending") this.finishEnded();
            }
            if (message.type === "error" && message.turn_id) this.handleTurnEvent(message);
            else if (message.type === "error" && message.code === "session_expired") {
                this.fail("Your session has expired. Please sign in again.");
            } else if (message.type === "error") this.failTransport();
        });
        this.socket.addEventListener("error", () => {
            if (generation === this.socketGeneration) {
                this.setTransportState("degraded", "Connection unstable");
            }
        });
        this.socket.addEventListener("close", (event) => {
            if (generation !== this.socketGeneration) return;
            this.stopHeartbeat();
            if (event?.code === 4401) return this.fail("Your session has expired. Please sign in again.");
            if (event?.code === 4404) return this.failUnavailable(true);
            if (!["ending", "ended", "error"].includes(this.state)) this.scheduleReconnect();
        });
    }

    connected(message = {}, resumed = false) {
        if (["ending", "ended", "error"].includes(this.state)) return;
        this.clearReconnectTimer();
        this.reconnectAttempt = 0;
        this.setTransportState("connected");
        this.elements.mute.disabled = false;
        this.elements.speaker.disabled = false;
        this.elements.microphoneStatus.textContent = "Microphone on";
        if (Number.isInteger(message.next_turn_id)) this.turnId = Math.max(this.turnId, message.next_turn_id);
        this.startHeartbeat();
        this.reportOperational("call_started", "started");
        if (!resumed && this.state === "connecting") {
            this.pendingInitialReady = message;
            this.completeInitialConnection();
            return;
        }
        this.setState("connected", "Listening");
        if (!message.greeting_completed) {
            this.setState("greeting", "Connecting…");
        } else {
            this.reconcileTurn(message, resumed);
        }
    }

    async completeInitialConnection() {
        if (!this.ringbackMinimumElapsed || !this.pendingInitialReady
                || this.startupTransitioning || this.state !== "connecting") return;
        this.startupTransitioning = true;
        await this.stopRingback(false, true);
        this.startupTransitioning = false;
        if (this.state !== "connecting" || this.intentionalEnd) return;
        const message = this.pendingInitialReady;
        this.pendingInitialReady = null;
        this.setState("greeting", "Connecting…");
        const pendingGreeting = this.pendingGreeting;
        this.pendingGreeting = null;
        if (message.greeting_completed && !pendingGreeting) {
            this.reconcileTurn(message, false);
        } else if (pendingGreeting) {
            this.playGreeting(pendingGreeting);
        }
    }

    beginGreeting() {
        if (["ending", "ended", "error"].includes(this.state)) return;
        if (this.state === "connecting" || this.startupTransitioning) return;
        this.setState("greeting", "Connecting…");
    }

    async playGreeting(message) {
        if (this.greetingPlayback || !message.data) return;
        if (this.state === "connecting" || this.startupTransitioning || this.ringbackActive) {
            this.pendingGreeting = message;
            return;
        }
        this.pendingGreeting = null;
        this.greetingPlayback = true;
        try {
            const buffer = await this.decodeAudioData(message.data);
            const signal = this.decodedSignal(buffer);
            if (!signal.samples || signal.peak < DECODED_SILENCE_THRESHOLD) {
                this.greetingPlayback = false;
                this.recordAudioDiagnostic("last_failure_stage", "decoded_audio_silent");
                return this.finishGreeting();
            }
            if (["ending", "ended", "error"].includes(this.state)) {
                this.greetingPlayback = false;
                return;
            }
            this.startDecodedSource(buffer, () => {
                this.greetingPlayback = false;
                if (this.pendingPlaybackConfirmation?.greeting) return;
                this.finishGreeting();
            }, "greeting_source_started");
            this.startTimer();
            this.pendingPlaybackConfirmation = {
                kind: "greeting", message, retry: message._playbackRetry || 0,
            };
            this.clock.setTimeout(() => this.confirmPlayback(null, true), 0);
        } catch {
            this.greetingPlayback = false;
            this.finishGreeting();
        }
    }

    async decodeAudioData(encoded) {
        const raw = atob(encoded);
        const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
        return this.audioContext.decodeAudioData(bytes.buffer.slice(0));
    }

    startDecodedSource(buffer, onEnded, diagnostic) {
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.outputGain || this.audioContext.destination);
        this.decodedSources.add(source);
        source.addEventListener("ended", () => {
            this.decodedSources.delete(source);
            source.disconnect?.();
            onEnded?.();
        }, { once: true });
        source.start();
        this.recordAudioDiagnostic(diagnostic, true);
        return source;
    }

    clearDecodedPlayback() {
        this.decodedSources.forEach((source) => {
            try { source.stop(); } catch { /* already stopped */ }
            source.disconnect?.();
        });
        this.decodedSources.clear();
        this.decodedPlaybackActive = false;
        this.greetingPlayback = false;
    }

    finishGreeting() {
        if (["ending", "ended", "error"].includes(this.state)) return;
        this.stopRingback();
        this.greetingPlayback = false;
        this.startTimer();
        this.setState("listening", this.muted ? "Muted" : "Listening");
    }

    reconcileTurn(message, resumed) {
        this.startTimer();
        const interrupted = new Set(message.interrupted_turn_ids || []);
        if (this.activeTurnId && interrupted.has(this.activeTurnId)) this.activeTurnId = null;
        if (this.activeTurnId && message.last_completed_turn_id === this.activeTurnId) {
            this.activeTurnId = null;
            this.responseAudio = [];
            return this.setState("listening", "The connection returned. Please continue.");
        }
        if (message.active_turn_id) {
            this.activeTurnId = message.active_turn_id;
            return this.setState("processing", "Thinking");
        }
        if (resumed && this.activeTurnId) {
            this.activeTurnId = null;
            this.responseAudio = [];
            return this.setState("listening", "The connection returned. Please repeat your last response.");
        }
        this.setState("listening", this.muted ? "Muted" : "Listening");
    }

    scheduleReconnect() {
        if (this.intentionalEnd || ["ending", "ended", "error"].includes(this.state) || this.reconnectTimer !== null) return;
        this.clearPcmPlayback();
        this.clearDecodedPlayback();
        this.responseAudio = [];
        if (this.playback) { this.playback.pause(); this.playback.src = ""; }
        this.playback = null;
        if (this.playbackUrl) this.URLClass.revokeObjectURL(this.playbackUrl);
        this.playbackUrl = null;
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            this.setTransportState("offline", "Connection lost…");
            this.boundRecordingDuringDisconnect();
            return;
        }
        if (this.reconnectAttempt >= RECONNECT_DELAYS_MS.length) return this.failUnavailable(true);
        this.setTransportState("reconnecting", "Reconnecting…");
        this.boundRecordingDuringDisconnect();
        const base = RECONNECT_DELAYS_MS[this.reconnectAttempt++];
        const delay = Math.round(base * (0.85 + this.random() * 0.3));
        this.reconnectTimer = this.clock.setTimeout(() => {
            this.reconnectTimer = null;
            this.connectTransport(true);
        }, delay);
    }

    clearReconnectTimer() {
        if (this.reconnectTimer !== null) this.clock.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }

    handleOffline() {
        if (["ending", "ended", "error"].includes(this.state)) return;
        if (this.session?.engine === "realtime") {
            this.realtimeController?.handleOfflineHint?.();
            return;
        }
        this.clearReconnectTimer();
        this.setTransportState("offline", "Connection lost…");
        this.boundRecordingDuringDisconnect();
        this.socket?.close();
    }

    handleOnline() {
        if (this.session?.engine === "realtime") {
            this.realtimeController?.handleOnlineHint?.();
            return;
        }
        if (this.transportState !== "offline" || this.intentionalEnd) return;
        this.reconnectAttempt = 0;
        this.scheduleReconnect();
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = this.clock.setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
    }

    sendHeartbeat() {
        if (this.socket?.readyState !== 1) return;
        const heartbeatId = ++this.heartbeatId;
        this.sendEvent("heartbeat.ping", { heartbeat_id: heartbeatId });
        if (this.heartbeatTimeout !== null) this.clock.clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = this.clock.setTimeout(() => {
            this.heartbeatTimeout = null;
            this.setTransportState("degraded", "Connection unstable");
            this.socket?.close();
        }, HEARTBEAT_TIMEOUT_MS);
    }

    receiveHeartbeat(message) {
        if (message.heartbeat_id !== this.heartbeatId) return;
        if (this.heartbeatTimeout !== null) this.clock.clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = null;
        this.setTransportState("connected");
        if (this.state === "greeting" && message.greeting_completed) this.finishGreeting();
        if (this.state === "processing" && this.activeTurnId
                && message.active_turn_id !== this.activeTurnId) {
            this.reconcileTurn(message, true);
        }
    }

    stopHeartbeat() {
        if (this.heartbeatTimer !== null) this.clock.clearInterval(this.heartbeatTimer);
        if (this.heartbeatTimeout !== null) this.clock.clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimer = null;
        this.heartbeatTimeout = null;
    }

    boundRecordingDuringDisconnect() {
        if (this.recorder?.state !== "recording" || this.recordingGraceTimer !== null) return;
        this.recordingGraceTimer = this.clock.setTimeout(() => {
            this.recordingGraceTimer = null;
            if (this.transportState === "connected" || this.recorder?.state !== "recording") return;
            this.discardRecording = true;
            this.recorder.stop();
            this.setState("listening", "Connection lost. Please repeat your answer when reconnected.");
        }, RECORDING_DISCONNECT_GRACE_MS);
    }

    updateTimer() {
        if (!this.connectedAt) return;
        const elapsed = Math.max(0, Math.floor((Date.now() - this.connectedAt) / 1000));
        const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
        const seconds = String(elapsed % 60).padStart(2, "0");
        this.elements.timer.textContent = `${minutes}:${seconds}`;
    }

    startTimer() {
        if (this.connectedAt) return;
        this.connectedAt = Date.now();
        this.updateTimer();
        if (this.timerId === null) {
            this.timerId = this.clock.setInterval(() => this.updateTimer(), 1000);
        }
    }

    toggleMute() {
        if (!["connected", "greeting", "listening", "user_speaking", "speaking"].includes(this.state)
                || !this.stream) return;
        const berrySpeaking = ["greeting", "speaking"].includes(this.state);
        this.muted = !this.muted;
        document.body.dataset.microphoneMuted = String(this.muted);
        if (this.muted && this.recorder?.state === "recording") {
            this.discardRecording = true;
            this.recorder.stop();
            this.recorder = null;
            this.recordedChunks = [];
        }
        this.stream.getAudioTracks().forEach((track) => {
            track.enabled = !this.muted;
        });
        this.elements.mute.setAttribute("aria-pressed", String(this.muted));
        this.elements.mute.setAttribute(
            "aria-label", this.muted ? "Unmute microphone" : "Mute microphone"
        );
        this.elements.mute.lastElementChild.textContent = this.muted ? "Unmute" : "Mute";
        this.elements.microphoneStatus.textContent = this.muted ? "Microphone muted" : "Microphone on";
        if (!berrySpeaking) {
            this.setState("listening", this.muted ? "Muted" : "Listening");
        } else if (this.muted) {
            this.elements.microphoneStatus.textContent = "Microphone muted";
        }
    }

    async toggleSpeaker() {
        if (["ending", "ended", "error"].includes(this.state)) return;
        this.speakerEnabled = !this.speakerEnabled;
        this.realtimeController?.setSpeaker(this.speakerEnabled);
        if (this.outputGain) this.outputGain.gain.value = this.speakerEnabled ? 1 : 0;
        if (this.speakerEnabled && this.audioContext?.state !== "running") {
            await this.resumeAudioContext();
            await Promise.resolve(this.elements.outputAudio?.play?.()).catch(() => {});
        }
        const gainMatchesSpeaker = !this.outputGain || (
            this.speakerEnabled ? this.outputGain.gain.value > 0 : this.outputGain.gain.value === 0
        );
        this.recordAudioDiagnostic("speaker_gain_invariant", gainMatchesSpeaker);
        this.elements.speaker.setAttribute("aria-pressed", String(this.speakerEnabled));
        this.elements.speaker.setAttribute(
            "aria-label", this.speakerEnabled ? "Turn speaker off" : "Turn speaker on"
        );
        this.elements.speaker.lastElementChild.textContent =
            this.speakerEnabled ? "Speaker on" : "Speaker off";
    }

    async recoverAudioAfterVisibility() {
        if (document.visibilityState === "visible" && this.session?.engine === "realtime") {
            this.realtimeController?.verifyAfterForeground?.();
        }
        if (document.visibilityState !== "visible" || this.intentionalEnd
                || !this.speakerEnabled || !this.audioContext
                || ["running", "closed"].includes(this.audioContext.state)) return;
        const resumeAttempt = this.resumeAudioContext();
        const resumeTimeout = new Promise((resolve) => {
            this.clock.setTimeout(() => resolve(false), 900);
        });
        await Promise.race([resumeAttempt, resumeTimeout]);
        const recovered = await this.waitForRunningAudioContext(900);
        if (recovered) await Promise.resolve(this.elements.outputAudio?.play?.()).catch(() => {});
    }

    async openSettings() {
        if (this.elements.settingsDialog.open || ["ending", "ended", "error"].includes(this.state)) return;
        this.vadSuspended = true;
        if (this.recorder?.state === "recording") {
            this.discardRecording = true;
            this.recorder.stop();
            this.recorder = null;
            this.recordedChunks = [];
            this.setState("listening", this.muted ? "Muted" : "Listening");
        }
        this.elements.settingsDialog.showModal();
        this.elements.settingsClose.focus();
        this.elements.settingsForm.elements.conversationStyle.value =
            this.session?.conversation_style || "natural";
        this.elements.settingsForm.elements.responseLength.value =
            this.session?.response_length || "balanced";
        this.elements.settingsStatus.textContent = "";
        this.elements.currentVoice.textContent = this.voiceDisplayName(this.session?.effective_voice);
        await this.loadVoicePreference();
    }

    closeSettings(force = false) {
        if (this.elements.settingsDialog.open && (force || !this.settingsSaving)) {
            this.elements.settingsDialog.close();
            this.vadSuspended = false;
        }
    }

    voiceDisplayName(voiceId) {
        if (!voiceId || voiceId.startsWith("standard_")) return "Automatic";
        const voices = this.voicePreference?.available_voices;
        const match = [...(voices?.male || []), ...(voices?.female || [])]
            .find((voice) => voice.id === voiceId);
        return match?.name || voiceId.charAt(0).toUpperCase() + voiceId.slice(1);
    }

    async loadVoicePreference() {
        this.elements.voiceOptions.setAttribute("aria-busy", "true");
        try {
            this.voicePreference = await this.api.apiRequest("/user/voice-preference");
            this.renderVoiceOptions();
            this.elements.currentVoice.textContent =
                this.voiceDisplayName(this.session?.effective_voice);
        } catch {
            this.elements.settingsStatus.textContent =
                "Voice choices could not be loaded. Your call can continue.";
        } finally {
            this.elements.voiceOptions.setAttribute("aria-busy", "false");
        }
    }

    renderVoiceOptions() {
        const create = (id, name, recommendation) => {
            const label = document.createElement("label");
            const input = document.createElement("input");
            input.type = "radio";
            input.name = "berryVoice";
            input.value = id;
            input.checked = (this.voicePreference.selected_voice || "") === id;
            const copy = document.createElement("span");
            const title = document.createElement("strong");
            const detail = document.createElement("small");
            title.textContent = name;
            detail.textContent = recommendation;
            copy.append(title, detail);
            label.append(input, copy);
            return label;
        };
        const options = [create("", "Automatic", "Berry chooses based on the selected relationship.")];
        for (const group of ["male", "female"]) {
            for (const voice of this.voicePreference.available_voices[group] || []) {
                options.push(create(voice.id, voice.name, voice.recommendation));
            }
        }
        this.elements.voiceOptions.replaceChildren(...options);
    }

    async saveSettings(event) {
        event.preventDefault();
        if (this.settingsSaving || !this.socket || this.socket.readyState !== 1) return;
        const style = this.elements.settingsForm.elements.conversationStyle.value;
        const length = this.elements.settingsForm.elements.responseLength.value;
        if (!new Set(["natural", "gentle", "expressive"]).has(style)
                || !new Set(["short", "balanced", "detailed"]).has(length)) {
            this.elements.settingsStatus.textContent = "Choose a valid call setting.";
            return;
        }
        this.settingsSaving = true;
        this.elements.settingsStatus.textContent = "Saving settings…";
        try {
            const selectedVoice = this.elements.settingsForm.elements.berryVoice?.value;
            const existingVoice = this.voicePreference?.selected_voice || "";
            let voiceChanged = false;
            if (selectedVoice !== undefined && selectedVoice !== existingVoice) {
                this.voicePreference = await this.api.apiRequest("/user/voice-preference", {
                    method: "PUT", body: { voice: selectedVoice || null }
                });
                voiceChanged = true;
                this.voiceChangedForNextCall = true;
            }
            this.elements.settingsStatus.textContent = voiceChanged
                ? "Voice updated. It will be used on your next call."
                : "Updating call settings…";
        } catch {
            this.elements.settingsStatus.textContent =
                "We couldn’t update that setting. Your call can continue.";
        } finally {
            this.settingsSaving = false;
        }
    }

    trapSettingsFocus(event) {
        if (event.key !== "Tab") return;
        const controls = Array.from(this.elements.settingsDialog.querySelectorAll(
            "button:not([disabled]), input:not([disabled])"
        ));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
        }
    }

    preferredMimeType() {
        const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
        return types.find((type) => this.MediaRecorderClass.isTypeSupported?.(type)) || "";
    }

    toggleTalking() {
        if (this.recorder?.state === "recording") return this.finishAutomaticTurn();
        return this.startAutomaticTurn();
    }

    startTalking() {
        return this.startAutomaticTurn();
    }

    interruptPlayback() {
        const interruptedTurnId = this.activeTurnId;
        if (!interruptedTurnId) return;
        this.activeTurnId = null;
        this.responseAudio = [];
        this.responseCompleted = false;
        this.receivedAudioChunks.clear();
        this.clearPcmPlayback();
        this.clearDecodedPlayback();
        if (this.playback) {
            this.playback.pause();
            this.playback.src = "";
            this.playback = null;
        }
        if (this.playbackUrl) {
            this.URLClass.revokeObjectURL(this.playbackUrl);
            this.playbackUrl = null;
        }
        this.sendEvent("interrupt", { turn_id: interruptedTurnId });
        this.setState("listening", "Listening");
    }

    stopTalking() {
        return this.finishAutomaticTurn();
    }

    async commitRecording(fallbackMime) {
        const turnId = this.recordingTurnId;
        this.recordingTurnId = null;
        await this.audioChunkSendChain;
        this.markTurnTiming(turnId, "fallback_blob_finalized");
        if (this.discardRecording || ["ending", "ended", "error"].includes(this.state)) {
            if (turnId) this.sendEvent("audio.cancel", { turn_id: turnId });
            this.discardRecording = false;
            this.recordedChunks = [];
            return;
        }
        if (this.transportState !== "connected") {
            if (turnId) this.sendEvent("audio.cancel", { turn_id: turnId });
            this.recordedChunks = [];
            return this.setState("listening", "Connection lost. Please repeat your answer when reconnected.");
        }
        if (!turnId || !this.audioChunkStarted) return this.recoverTurn("audio_empty");
        this.activeTurnId = turnId;
        this.playbackConfirmedTurnId = null;
        this.outputRepairAttemptedTurnId = null;
        this.recordedChunks = [];
        if (["ending", "ended", "error"].includes(this.state)) return;
        this.markTurnTiming(turnId, "fallback_commit_sent");
        this.sendEvent("audio.commit", {
            turn_id: turnId,
            vad_silence_ms: this.pendingVadSilenceMs
        });
        this.pendingVadSilenceMs = null;
    }

    async sendLiveAudioChunk(blob, turnId, start, fallbackMime) {
        if (!turnId || this.transportState !== "connected" || this.intentionalEnd) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const chunkSize = 48 * 1024;
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            const slice = bytes.subarray(offset, offset + chunkSize);
            let binary = "";
            slice.forEach((value) => { binary += String.fromCharCode(value); });
            this.sendEvent("audio.chunk", {
                turn_id: turnId, start: start && offset === 0,
                mime_type: blob.type || fallbackMime || "audio/webm",
                data: btoa(binary)
            });
        }
    }

    sendEvent(type, detail = {}) {
        if (this.socket?.readyState === 1) {
            this.socket.send(JSON.stringify({ version: EVENT_VERSION, type, ...detail }));
            return true;
        }
        return false;
    }

    markTurnTiming(turnId, milestone, at = this.performance.now()) {
        const timing = this.turnTimings.get(turnId);
        if (timing && Number.isFinite(at) && !Number.isFinite(timing.marks[milestone])) {
            timing.marks[milestone] = at;
        }
    }

    reportClientLatency(turnId) {
        const timing = this.turnTimings.get(turnId);
        if (!timing) return;
        const elapsed = (start, end) => {
            const from = timing.marks[start];
            const to = timing.marks[end];
            return Number.isFinite(from) && Number.isFinite(to)
                ? Math.max(0, Math.round(to - from)) : null;
        };
        const firstServer = [
            "transcription_final_received", "response_started_received",
            "first_text_delta_received", "first_tts_chunk_received",
        ].map((name) => timing.marks[name]).filter(Number.isFinite).sort((a, b) => a - b)[0];
        if (Number.isFinite(firstServer)) timing.marks.first_server_response = firstServer;
        this.sendEvent("latency.client_turn", {
            turn_id: turnId,
            speech_end_to_realtime_commit_ms: elapsed("vad_last_voice_detected", "realtime_commit_sent"),
            speech_end_to_fallback_commit_ms: elapsed("vad_last_voice_detected", "fallback_commit_sent"),
            realtime_commit_to_server_receive_ms: elapsed("realtime_commit_sent", "realtime_commit_received_ack"),
            fallback_commit_to_server_receive_ms: elapsed("fallback_commit_sent", "fallback_commit_received_ack"),
            realtime_commit_to_first_server_response_ms: elapsed("realtime_commit_sent", "first_server_response"),
            client_first_audio_receive_ms: elapsed("vad_last_voice_detected", "first_tts_chunk_received"),
            audio_decode_ms: elapsed("first_tts_chunk_received", "first_audio_chunk_decodable"),
            audio_queue_wait_ms: elapsed("first_audio_chunk_decodable", "first_audible_playback"),
            audio_context_resume_ms: elapsed("audio_context_resume_started", "audio_context_resumed"),
            client_end_of_speech_to_audible_ms: elapsed("vad_last_voice_detected", "first_audible_playback"),
            response_audio_completed_ms: elapsed("first_audible_playback", "response_audio_completed"),
            silence_to_recorder_stop_ms: elapsed("vad_silence_commit", "mediarecorder_stop_called"),
            recorder_stop_to_final_data_ms: elapsed("mediarecorder_stop_called", "mediarecorder_final_dataavailable"),
            final_data_to_fallback_commit_ms: elapsed("mediarecorder_final_dataavailable", "fallback_blob_finalized"),
            streaming_stt_active: timing.streaming_stt_active,
            streaming_stt_fallback_reason: timing.streaming_stt_fallback_reason,
            streaming_tts_active: timing.streaming_tts_active,
            streaming_tts_fallback_reason: timing.streaming_tts_fallback_reason,
            pcm_capture_started: timing.pcm_capture_started,
            pcm_input_sample_rate: timing.pcm_input_sample_rate,
            pcm_output_sample_rate: timing.pcm_output_sample_rate,
            pcm_chunks_sent: timing.pcm_chunks_sent,
            pcm_bytes_sent: timing.pcm_bytes_sent,
            pcm_chunks_received: timing.pcm_chunks_received,
        });
        this.turnTimings.delete(turnId);
    }

    handleTurnEvent(message) {
        if (message.turn_id !== this.activeTurnId) return;
        if (message.type === "latency.commit_received") {
            const milestone = message.commit_kind === "realtime"
                ? "realtime_commit_received_ack" : "fallback_commit_received_ack";
            this.markTurnTiming(message.turn_id, milestone);
            return;
        }
        if (message.type === "transcription.final") {
            this.markTurnTiming(message.turn_id, "transcription_final_received");
            this.setState("processing", "Thinking");
        }
        if (message.type === "response.started") {
            this.markTurnTiming(message.turn_id, "response_started_received");
            this.setState("processing", "Thinking");
        }
        if (message.type === "response.text.delta") {
            this.markTurnTiming(message.turn_id, "first_text_delta_received");
        }
        if (message.type === "audio.chunk") {
            this.markTurnTiming(message.turn_id, "first_tts_chunk_received");
            const key = `${message.turn_id}:${message.chunk_index ?? 0}`;
            if (this.receivedAudioChunks.has(key)) return;
            this.receivedAudioChunks.add(key);
            this.armFirstAudioWatchdog(message.turn_id);
            if (message.streaming && message.mime_type === "audio/L16") {
                this.queuePcmChunk(message);
            } else {
                this.responseAudio.push({ data: message.data, mimeType: message.mime_type });
                this.playResponse(message.turn_id);
            }
        }
        if (message.type === "response.completed") {
            const timing = this.turnTimings.get(message.turn_id);
            if (timing) {
                timing.streaming_stt_active = message.streaming_stt_active === true;
                timing.streaming_stt_fallback_reason = message.streaming_stt_fallback_reason || "provider_fallback";
                timing.streaming_tts_active = message.streaming_tts_active === true;
                timing.streaming_tts_fallback_reason = message.streaming_tts_fallback_reason || "provider_fallback";
                timing.pcm_chunks_received = Number.isInteger(message.pcm_chunks_received)
                    ? message.pcm_chunks_received : null;
            }
            this.responseCompleted = true;
            if (!this.playback && !this.decodedPlaybackActive && !this.responseAudio.length
                    && !this.pcmSources.size) {
                this.finishResponse(message.turn_id);
            }
        }
        if (message.type === "error") this.recoverTurn(message.failure_stage || message.code);
    }

    async playResponse(turnId) {
        if (turnId !== this.activeTurnId || this.playback || this.decodedPlaybackActive
                || !this.responseAudio.length) return;
        const chunk = this.responseAudio.shift();
        this.decodedPlaybackActive = true;
        try {
            const buffer = await this.decodeAudioData(chunk.data);
            if (turnId !== this.activeTurnId) {
                this.decodedPlaybackActive = false;
                return;
            }
            const signal = this.decodedSignal(buffer);
            if (!signal.samples || signal.peak < DECODED_SILENCE_THRESHOLD) {
                this.decodedPlaybackActive = false;
                this.recordAudioDiagnostic("last_failure_stage", "decoded_audio_silent");
                return this.recoverTurn("decoded_audio_silent");
            }
            this.markTurnTiming(turnId, "first_audio_chunk_decodable");
            this.startDecodedSource(buffer, () => {
                this.decodedPlaybackActive = false;
                if (turnId !== this.activeTurnId || ["ending", "ended"].includes(this.state)) return;
                if (this.responseAudio.length) return this.playResponse(turnId);
                if (this.responseCompleted) this.finishResponse(turnId);
            }, "nonstreaming_buffer_source_started");
            this.markTurnTiming(turnId, "audio_scheduled");
            this.pendingPlaybackConfirmation = {
                kind: "decoded", turnId, chunk, retry: chunk.retry || 0,
            };
            this.clock.setTimeout(() => this.confirmPlayback(turnId), 0);
        } catch {
            this.decodedPlaybackActive = false;
            if (turnId === this.activeTurnId) this.recoverTurn("audio_unavailable");
        }
    }

    queuePcmChunk(message) {
        this.pcmPlaybackChain = this.pcmPlaybackChain
            .then(() => this.playPcmChunk(message))
            .catch(() => {
                if (message.turn_id === this.activeTurnId) this.recoverTurn("audio_unavailable");
            });
        return this.pcmPlaybackChain;
    }

    async playPcmChunk(message) {
        if (message.turn_id !== this.activeTurnId || !this.speakerEnabled) return;
        const raw = atob(message.data);
        if (!raw.length || raw.length % 2 !== 0) return this.recoverTurn("audio_invalid");
        const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
        const view = new DataView(bytes.buffer);
        const samples = new Float32Array(bytes.length / 2);
        for (let index = 0; index < samples.length; index += 1) {
            samples[index] = view.getInt16(index * 2, true) / 32768;
        }
        this.markTurnTiming(message.turn_id, "first_audio_chunk_decodable");
        this.recordAudioDiagnostic("pcm_playback_context_state", this.audioContext?.state || "missing");
        if (this.audioContext?.state !== "running") {
            this.markTurnTiming(message.turn_id, "audio_context_resume_started");
            const running = await this.resumeAudioContext();
            this.markTurnTiming(message.turn_id, "audio_context_resumed");
            if (message.turn_id !== this.activeTurnId || !this.speakerEnabled) return;
            if (!running) throw new Error("Audio output unavailable.");
        }
        if (this.audioContext?.state !== "running") throw new Error("Audio output unavailable.");
        const sampleRate = Number.isInteger(message.sample_rate) ? message.sample_rate : 24000;
        const buffer = this.audioContext.createBuffer(1, samples.length, sampleRate);
        buffer.copyToChannel(samples, 0);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.outputGain || this.audioContext.destination);
        const startAt = Math.max(this.audioContext.currentTime + 0.02, this.pcmNextStart);
        this.pcmNextStart = startAt + buffer.duration;
        this.pcmPlaybackTurn = message.turn_id;
        this.pcmSources.add(source);
        source.addEventListener("ended", () => {
            this.pcmSources.delete(source);
            source.disconnect?.();
            if (message.turn_id === this.activeTurnId && this.responseCompleted
                    && !this.pcmSources.size && !this.responseAudio.length) {
                this.finishResponse(message.turn_id);
            }
        }, { once: true });
        source.start(startAt);
        this.recordAudioDiagnostic("pcm_source_started", true);
        this.markTurnTiming(message.turn_id, "audio_scheduled");
        this.pendingPlaybackConfirmation = {
            kind: "pcm", turnId: message.turn_id, message,
            retry: message._playbackRetry || 0,
        };
        if (!this.pcmPlaybackReported) {
            this.pcmPlaybackReported = true;
            this.sendEvent("latency.frontend_first_playable_chunk", { turn_id: message.turn_id });
            const delayMs = Math.max(0, Math.round((startAt - this.audioContext.currentTime) * 1000));
            this.clock.setTimeout(() => {
                if (message.turn_id === this.activeTurnId) {
                    this.markTurnTiming(message.turn_id, "webaudio_source_started");
                    this.confirmPlayback(message.turn_id);
                }
            }, delayMs);
        }
    }

    clearPcmPlayback() {
        this.pcmSources.forEach((source) => {
            try { source.stop(); } catch { /* already stopped */ }
            source.disconnect?.();
        });
        this.pcmSources.clear();
        this.pcmNextStart = 0;
        this.pcmPlaybackTurn = null;
        this.pcmPlaybackReported = false;
    }

    finishResponse(turnId) {
        if (turnId !== this.activeTurnId || ["ending", "ended"].includes(this.state)) return;
        if (this.playbackConfirmedTurnId !== turnId
                && this.pendingPlaybackConfirmation?.turnId === turnId) return;
        this.markTurnTiming(turnId, "response_audio_completed");
        this.reportClientLatency(turnId);
        this.countOperational("turn_completed_count");
        this.activeTurnId = null;
        this.clearFirstAudioWatchdog();
        this.playbackConfirmedTurnId = null;
        this.outputRepairAttemptedTurnId = null;
        this.responseCompleted = false;
        this.receivedAudioChunks.clear();
        this.clearPcmPlayback();
        this.clearDecodedPlayback();
        this.setState("listening", this.muted ? "Muted" : "Listening");
    }

    recoverTurn(code) {
        this.countOperational("turn_failed_count");
        this.countOperational("turn_recovered_count");
        this.clearFirstAudioWatchdog();
        this.activeTurnId = null;
        this.playbackConfirmedTurnId = null;
        this.outputRepairAttemptedTurnId = null;
        this.pendingPlaybackConfirmation = null;
        this.outputEnergyCandidateAt = null;
        this.responseAudio = [];
        this.responseCompleted = false;
        this.receivedAudioChunks.clear();
        this.clearPcmPlayback();
        this.clearDecodedPlayback();
        this.recordAudioDiagnostic("last_failure_stage", code);
        const message = ["audio_empty", "transcription_empty", "stt_failed"].includes(code)
            ? "I didn\u2019t catch that. Could you say it again?"
            : ["decoded_audio_silent", "output_route_failed", "playback_energy_timeout",
                "audio_delivery_failed", "audio_unavailable", "audio_invalid", "tts_failed"].includes(code)
                ? "I couldn\u2019t play that response. Please try speaking again."
                : "I\u2019m having trouble responding right now. Please try again.";
        this.setState("listening", message);
    }

    end() {
        if (this.endPromise) return this.endPromise;
        this.endPromise = this.performEnd();
        return this.endPromise;
    }

    async performEnd() {
        if (this.state === "ended") return;
        this.intentionalEnd = true;
        this.realtimeRecoveryGeneration += 1;
        this.realtimeController?.close();
        this.stopRingback();
        this.clearReconnectTimer();
        this.stopHeartbeat();
        this.setState("ending", "Ending call…");
        this.stopTimer();
        this.stopVad();
        this.stopTurnMedia();
        this.releaseMicrophone();
        this.closeAudioContext();
        document.dispatchEvent(new CustomEvent("waffleberry:stopspeech"));
        await this.requestTransportEnd();
        this.socket?.close();
        if (this.session?.session_id) {
            await this.reportOperational("call_ended", "user_ended");
            try { await this.api.endLiveCallSession(this.session.session_id); } catch { /* cleanup remains local */ }
        }
        this.finishEnded();
        this.disposeLifecycleListeners?.();
        if (this.onEnded) {
            this.onEnded();
            return;
        }
        const returnUrl = this.elements.ended.querySelector('a[href^="chat.html"]')?.href
            || document.getElementById("returnToChatTop")?.href || "chat.html";
        this.clock.setTimeout(() => this.navigate(returnUrl), 150);
    }

    requestTransportEnd() {
        if (this.socket?.readyState !== 1) return Promise.resolve();
        return new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            this.sessionEndResolver = finish;
            this.sendEvent("session.end");
            this.clock.setTimeout(finish, 500);
        });
    }

    releaseMicrophone() {
        this.stopVad();
        this.stopTurnMedia();
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
        this.elements.mute.disabled = true;
        this.elements.speaker.disabled = true;
    }

    stopTurnMedia() {
        this.stopStreamingTranscription();
        if (this.recordingGraceTimer !== null) this.clock.clearTimeout(this.recordingGraceTimer);
        this.recordingGraceTimer = null;
        if (this.recorder?.state === "recording") {
            this.discardRecording = true;
            this.recorder.stop();
        }
        this.recorder = null;
        this.recordedChunks = [];
        document.body.dataset.recording = "false";
        if (this.playback) { this.playback.pause(); this.playback.src = ""; }
        this.playback = null;
        this.pendingBlockedPlayback = null;
        if (this.playbackUrl) this.URLClass.revokeObjectURL(this.playbackUrl);
        this.playbackUrl = null;
        this.activeTurnId = null;
        this.responseAudio = [];
        this.responseCompleted = false;
        this.receivedAudioChunks.clear();
        this.clearPcmPlayback();
        this.clearDecodedPlayback();
    }

    stopTimer() {
        if (this.timerId !== null) this.clock.clearInterval(this.timerId);
        this.timerId = null;
        this.connectedAt = null;
    }

    finishEnded() {
        this.stopTimer();
        this.releaseMicrophone();
        this.closeAudioContext();
        this.setState("ended", "Call ended");
        this.elements.endedTitle.textContent = "Call ended";
        this.elements.controls.hidden = true;
        this.elements.ended.hidden = false;
    }

    fail(message) {
        const outcome = this.operationalStarted ? "transport_failed" : "startup_failed";
        this.reportOperational("call_ended", outcome,
            outcome === "transport_failed" ? "transport" : "unknown");
        this.intentionalEnd = true;
        this.stopRingback();
        this.clearReconnectTimer();
        this.stopHeartbeat();
        this.stopTimer();
        this.releaseMicrophone();
        this.closeAudioContext();
        this.disposeLifecycleListeners?.();
        this.setState("error", message);
        this.elements.endedTitle.textContent = "Call unavailable";
        this.elements.controls.hidden = true;
        this.elements.ended.hidden = false;
    }

    failTransport() {
        if (["ending", "ended", "error"].includes(this.state)) return;
        this.socket?.close();
        this.scheduleReconnect();
    }

    failUnavailable(resume) {
        this.setTransportState("failed");
        this.fail(resume
            ? "The call connection was lost. Please start a new call."
            : "Your session has expired. Please sign in again.");
    }

    cleanupForNavigation() {
        if (this.state === "ended") return;
        this.intentionalEnd = true;
        this.realtimeRecoveryGeneration += 1;
        this.realtimeController?.close();
        this.stopRingback();
        this.clearReconnectTimer();
        this.stopHeartbeat();
        this.stopTimer();
        this.releaseMicrophone();
        this.closeAudioContext();
        this.disposeLifecycleListeners?.();
        this.sendEvent("session.end");
        this.socket?.close();
        if (this.session?.session_id) {
            this.api.endLiveCallSession(this.session.session_id).catch(() => {});
        }
        this.state = "ended";
    }
}

function scopeLinks(legacy) {
    const parameters = new URLSearchParams();
    if (legacy?.id) parameters.set("legacyId", legacy.id);
    const conversationId = Number(new URLSearchParams(window.location.search).get("conversationId"));
    if (Number.isInteger(conversationId) && conversationId > 0) {
        parameters.set("conversationId", String(conversationId));
    }
    const query = parameters.toString() ? `?${parameters.toString()}` : "";
    document.querySelectorAll('[href="chat.html"]').forEach((link) => {
        link.href = `chat.html${query}`;
    });
}

async function resolveLiveCallLegacy() {
    const requestedLegacyId = new URLSearchParams(window.location.search).get("legacyId");
    if (!requestedLegacyId) return null;
    let legacy = window.WaffleBerryLegacyState?.select(requestedLegacyId) || null;
    if (!legacy) {
        try {
            await window.WaffleBerryLegacyState?.hydratePersisted("active");
            legacy = window.WaffleBerryLegacyState?.select(requestedLegacyId) || null;
        } catch {
            return null;
        }
    }
    if (!legacy?.backendLegacyId || legacy.status === "archived") return null;
    return legacy;
}

function mountLiveCall(options = {}) {
    const controller = new LiveCallController(options);
    const lifecycle = new AbortController();
    const listenerOptions = { signal: lifecycle.signal };
    controller.disposeLifecycleListeners = () => lifecycle.abort();
    controller.elements.mute.addEventListener("click", () => controller.toggleMute(), listenerOptions);
    controller.elements.speaker.addEventListener("click", () => controller.toggleSpeaker(), listenerOptions);
    controller.elements.end.addEventListener("click", () => controller.end(), listenerOptions);
    controller.elements.audioUnlock?.addEventListener("click", () => controller.activateAudio(), listenerOptions);
    window.addEventListener("offline", () => controller.handleOffline(), { signal: lifecycle.signal });
    window.addEventListener("online", () => controller.handleOnline(), { signal: lifecycle.signal });
    document.addEventListener("visibilitychange", () => controller.recoverAudioAfterVisibility(), { signal: lifecycle.signal });
    window.addEventListener("pagehide", () => controller.cleanupForNavigation(), { once: true, signal: lifecycle.signal });
    document.addEventListener("waffleberry:signout", () => controller.cleanupForNavigation(), { once: true, signal: lifecycle.signal });
    return controller;
}

window.WaffleBerryLiveCall = Object.freeze({
    CALL_STATES, TRANSPORT_STATES, RECONNECT_DELAYS_MS, HEARTBEAT_INTERVAL_MS,
    HEARTBEAT_TIMEOUT_MS, RECORDING_DISCONNECT_GRACE_MS, RINGBACK_GAIN,
    MINIMUM_CONNECTING_MS, RINGBACK_FADE_OUT_MS,
    LiveCallController, mountLiveCall
});

document.addEventListener("DOMContentLoaded", async () => {
    if (!document.body.classList.contains("live-call-page")) return;
    await window.authReady;
    const legacy = await resolveLiveCallLegacy();
    scopeLinks(legacy);
    if (legacy) {
        document.querySelectorAll("[data-companion-name]").forEach((element) => {
            element.textContent = legacy.displayName;
        });
        document.title = `${legacy.displayName} | Waffle Berry`;
    }
    const controller = mountLiveCall({ legacy });
    window.liveCallController = controller;
    controller.start();
});
})();
