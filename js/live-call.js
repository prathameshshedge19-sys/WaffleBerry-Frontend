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
        this.voicePreference = null;
        this.settingsSaving = false;
        this.voiceChangedForNextCall = false;
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
        this.audioResumePromise = null;
        this.audioUnlockPromise = null;
        this.audioUnlockResolve = null;
        this.audioUnlocked = false;
        this.pendingBlockedPlayback = null;
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
        this.navigate = options.navigate || ((url) => window.location.assign(url));
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
            settingsButton: document.getElementById("liveCallSettingsButton"),
            settingsDialog: document.getElementById("liveCallSettingsDialog"),
            settingsForm: document.getElementById("liveCallSettingsForm"),
            settingsClose: document.getElementById("liveCallSettingsClose"),
            settingsStatus: document.getElementById("liveCallSettingsStatus"),
            currentVoice: document.getElementById("liveCallCurrentVoice"),
            voiceOptions: document.getElementById("liveCallVoiceOptions"),
            audioUnlock: document.getElementById("liveCallAudioUnlock")
        };
    }

    recordAudioDiagnostic(field, value) {
        if (!this.debugAudio) return;
        this.audioDiagnostics.push({ field, value, at: Math.round(this.performance.now()) });
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
            "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
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

    requestAudioUnlock() {
        if (this.audioUnlocked && this.audioContext?.state === "running") {
            return Promise.resolve(true);
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
        this.elements.audioUnlock.hidden = true;
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
        this.setState("connecting", "Connecting");
        if (!this.legacy?.backendLegacyId) {
            return this.fail("This Companion is not available for Live Call.");
        }
        if (!this.mediaDevices?.getUserMedia || !this.WebSocketClass
                || !this.MediaRecorderClass || !this.AudioContextClass) {
            return this.fail("Live Call is not supported in this browser.");
        }
        this.elements.relationship.textContent = this.legacy.relationship;
        this.prepareAudioOutput();
        try {
            this.stream = await this.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: false
            });
            if (this.intentionalEnd) return this.releaseMicrophone();
            this.elements.microphoneStatus.textContent = "Microphone ready";
            await this.initializeVad();
            if (this.intentionalEnd) return this.releaseMicrophone();
            this.session = await this.api.createLiveCallSession(
                this.legacy.backendLegacyId
            );
            if (this.intentionalEnd) {
                try { await this.api.endLiveCallSession(this.session.session_id); } catch { /* local cleanup won */ }
                return;
            }
            this.connectTransport();
        } catch (error) {
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

    startRingback() {
        if (this.ringbackStarted || !this.speakerEnabled || this.intentionalEnd) return;
        const context = this.getAudioContext();
        if (context.state !== "running") return;
        this.ringbackStarted = true;
        this.ringbackActive = true;
        this.ringbackMinimumTimer = this.clock.setTimeout(() => {
            this.ringbackMinimumTimer = null;
            this.ringbackMinimumElapsed = true;
            this.completeInitialConnection();
        }, MINIMUM_CONNECTING_MS);
        try {
            const gain = context.createGain();
            this.ringbackGain = gain;
            gain.gain.value = RINGBACK_GAIN;
            gain.connect(context.destination);
            this.ringbackOscillators = [440, 480].map((frequency) => {
                const oscillator = context.createOscillator();
                oscillator.type = "sine";
                oscillator.frequency.value = frequency;
                oscillator.connect(gain);
                oscillator.start();
                return oscillator;
            });
            this.recordAudioDiagnostic("ringback_started", true);
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
        this.setState("user_speaking", "Listening to you");
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
        this.audioContext = null;
        this.audioUnlocked = false;
        this.pendingBlockedPlayback = null;
        this.elements.audioUnlock.hidden = true;
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
            if (message.type === "session.settings.updated") {
                this.session.conversation_style = message.conversation_style;
                this.session.response_length = message.response_length;
                this.elements.settingsStatus.textContent = this.voiceChangedForNextCall
                    ? "Voice updated. It will be used on your next call. Call settings updated."
                    : "Call settings updated.";
            }
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
        if (!resumed && this.state === "connecting") {
            this.pendingInitialReady = message;
            this.completeInitialConnection();
            return;
        }
        this.setState("connected", "Connected");
        if (!message.greeting_completed) {
            this.setState("greeting", "Starting call");
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
        this.setState("greeting", "Starting call");
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
        this.setState("greeting", "Starting call");
    }

    playGreeting(message) {
        if (this.greetingPlayback || !message.data) return;
        if (this.state === "connecting" || this.startupTransitioning || this.ringbackActive) {
            this.pendingGreeting = message;
            return;
        }
        this.pendingGreeting = null;
        const raw = atob(message.data);
        const blob = new Blob([
            Uint8Array.from(raw, (character) => character.charCodeAt(0))
        ], { type: message.mime_type || "audio/mpeg" });
        const url = this.URLClass.createObjectURL(blob);
        this.playbackUrl = url;
        this.playback = new this.AudioClass(url);
        this.playback.muted = !this.speakerEnabled;
        this.greetingPlayback = true;
        this.recordAudioDiagnostic("greeting_play_requested", true);
        this.playback.addEventListener("playing", () => {
            this.startTimer();
            this.setState("greeting", "Speaking");
            this.recordAudioDiagnostic("greeting_play_started", true);
            this.sendEvent("latency.greeting_playback_started");
        }, { once: true });
        const finish = () => {
            if (this.playbackUrl === url) this.URLClass.revokeObjectURL(url);
            this.playbackUrl = null;
            this.playback = null;
            this.greetingPlayback = false;
            this.finishGreeting();
        };
        this.playback.addEventListener("ended", finish, { once: true });
        this.playback.addEventListener("error", finish, { once: true });
        Promise.resolve(this.playback.play()).catch((error) => {
            this.handleBlockedMediaPlayback(error, this.playback, finish);
        });
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
            return this.setState("listening", "I’m having trouble responding. Please try again.");
        }
        this.setState("listening", this.muted ? "Muted" : "Listening");
    }

    scheduleReconnect() {
        if (this.intentionalEnd || ["ending", "ended", "error"].includes(this.state) || this.reconnectTimer !== null) return;
        this.clearPcmPlayback();
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
        this.setTransportState("reconnecting", "Reconnecting");
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
        this.clearReconnectTimer();
        this.setTransportState("offline", "Connection lost…");
        this.boundRecordingDuringDisconnect();
        this.socket?.close();
    }

    handleOnline() {
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
        if (!this.speakerEnabled) {
            this.clearPcmPlayback();
            const pendingGreeting = this.pendingGreeting;
            this.pendingGreeting = null;
            this.stopRingback(false);
            if (pendingGreeting) this.playGreeting(pendingGreeting);
            this.completeInitialConnection();
        } else if (this.audioContext?.state !== "running") {
            await this.activateAudio();
        }
        if (this.playback) this.playback.muted = !this.speakerEnabled;
        this.elements.speaker.setAttribute("aria-pressed", String(this.speakerEnabled));
        this.elements.speaker.setAttribute(
            "aria-label", this.speakerEnabled ? "Turn speaker off" : "Turn speaker on"
        );
        this.elements.speaker.lastElementChild.textContent =
            this.speakerEnabled ? "Speaker on" : "Speaker off";
    }

    async recoverAudioAfterVisibility() {
        if (document.visibilityState !== "visible" || this.intentionalEnd
                || !this.speakerEnabled || !this.audioContext
                || ["running", "closed"].includes(this.audioContext.state)) return;
        await this.resumeAudioContext();
        if (!["running", "closed"].includes(this.audioContext?.state)) {
            this.audioUnlocked = false;
            this.requestAudioUnlock();
        }
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
            this.sendEvent("session.settings", {
                conversation_style: style, response_length: length
            });
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
            if (!this.playback && !this.responseAudio.length && !this.pcmSources.size) {
                this.finishResponse(message.turn_id);
            }
        }
        if (message.type === "error") this.recoverTurn(message.code);
    }

    playResponse(turnId) {
        if (turnId !== this.activeTurnId || this.playback || !this.responseAudio.length) return;
        const chunk = this.responseAudio.shift();
        const raw = atob(chunk.data);
        const blob = new Blob([
            Uint8Array.from(raw, (character) => character.charCodeAt(0))
        ], { type: chunk.mimeType || "audio/mpeg" });
        const url = this.URLClass.createObjectURL(blob);
        this.playbackUrl = url;
        this.playback = new this.AudioClass(url);
        this.playback.muted = !this.speakerEnabled;
        this.setState("speaking", "Speaking");
        this.playback.addEventListener("canplay", () => {
            this.markTurnTiming(turnId, "first_audio_chunk_decodable");
        }, { once: true });
        this.playback.addEventListener("playing", () => {
            this.markTurnTiming(turnId, "audio_scheduled");
            this.markTurnTiming(turnId, "html_audio_playing");
            this.markTurnTiming(turnId, "first_audible_playback");
            this.sendEvent("latency.playback_started", { turn_id: turnId });
        }, { once: true });
        const finish = () => {
            if (this.playbackUrl === url) {
                this.URLClass.revokeObjectURL(url);
                this.playbackUrl = null;
            }
            if (turnId !== this.activeTurnId || ["ending", "ended"].includes(this.state)) return;
            this.playback = null;
            if (this.responseAudio.length) return this.playResponse(turnId);
            if (this.responseCompleted) this.finishResponse(turnId);
        };
        this.playback.addEventListener("ended", finish, { once: true });
        this.playback.addEventListener("error", () => { finish(); }, { once: true });
        Promise.resolve(this.playback.play()).catch((error) => {
            this.handleBlockedMediaPlayback(error, this.playback, finish);
        });
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
            if (!running) {
                await this.requestAudioUnlock();
                if (message.turn_id !== this.activeTurnId || !this.speakerEnabled) return;
            }
        }
        if (this.audioContext?.state !== "running") throw new Error("Audio output unavailable.");
        const sampleRate = Number.isInteger(message.sample_rate) ? message.sample_rate : 24000;
        const buffer = this.audioContext.createBuffer(1, samples.length, sampleRate);
        buffer.copyToChannel(samples, 0);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
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
        this.markTurnTiming(message.turn_id, "audio_scheduled");
        this.setState("speaking", "Speaking");
        if (!this.pcmPlaybackReported) {
            this.pcmPlaybackReported = true;
            this.sendEvent("latency.frontend_first_playable_chunk", { turn_id: message.turn_id });
            const delayMs = Math.max(0, Math.round((startAt - this.audioContext.currentTime) * 1000));
            this.clock.setTimeout(() => {
                if (message.turn_id === this.activeTurnId) {
                    this.markTurnTiming(message.turn_id, "webaudio_source_started");
                    this.markTurnTiming(message.turn_id, "first_audible_playback");
                    this.sendEvent("latency.playback_started", { turn_id: message.turn_id });
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
        this.markTurnTiming(turnId, "response_audio_completed");
        this.reportClientLatency(turnId);
        this.activeTurnId = null;
        this.responseCompleted = false;
        this.receivedAudioChunks.clear();
        this.clearPcmPlayback();
        this.setState("listening", this.muted ? "Muted" : "Listening");
    }

    recoverTurn(code) {
        this.activeTurnId = null;
        this.responseAudio = [];
        this.responseCompleted = false;
        this.receivedAudioChunks.clear();
        this.clearPcmPlayback();
        const message = ["audio_empty", "transcription_empty"].includes(code)
            ? "I didn\u2019t catch that. Could you say it again?"
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
        this.stopRingback();
        this.clearReconnectTimer();
        this.stopHeartbeat();
        this.setState("ending", "Ending call…");
        this.closeSettings(true);
        this.stopTimer();
        this.stopVad();
        this.stopTurnMedia();
        this.releaseMicrophone();
        this.closeAudioContext();
        document.dispatchEvent(new CustomEvent("waffleberry:stopspeech"));
        await this.requestTransportEnd();
        this.socket?.close();
        if (this.session?.session_id) {
            try { await this.api.endLiveCallSession(this.session.session_id); } catch { /* cleanup remains local */ }
        }
        this.finishEnded();
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
        this.intentionalEnd = true;
        this.stopRingback();
        this.clearReconnectTimer();
        this.stopHeartbeat();
        this.stopTimer();
        this.releaseMicrophone();
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
        this.stopRingback();
        this.clearReconnectTimer();
        this.stopHeartbeat();
        this.stopTimer();
        this.releaseMicrophone();
        this.closeAudioContext();
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

window.WaffleBerryLiveCall = Object.freeze({
    CALL_STATES, TRANSPORT_STATES, RECONNECT_DELAYS_MS, HEARTBEAT_INTERVAL_MS,
    HEARTBEAT_TIMEOUT_MS, RECORDING_DISCONNECT_GRACE_MS, RINGBACK_GAIN,
    MINIMUM_CONNECTING_MS, RINGBACK_FADE_OUT_MS,
    LiveCallController
});

document.addEventListener("DOMContentLoaded", async () => {
    await window.authReady;
    const legacy = await resolveLiveCallLegacy();
    scopeLinks(legacy);
    if (legacy) {
        document.querySelectorAll("[data-companion-name]").forEach((element) => {
            element.textContent = legacy.displayName;
        });
        document.title = `${legacy.displayName} | Waffle Berry`;
    }
    const controller = new LiveCallController({ legacy });
    window.liveCallController = controller;
    controller.elements.mute.addEventListener("click", () => controller.toggleMute());
    controller.elements.speaker.addEventListener("click", () => controller.toggleSpeaker());
    controller.elements.settingsButton.addEventListener("click", () => controller.openSettings());
    controller.elements.settingsClose.addEventListener("click", () => controller.closeSettings());
    controller.elements.settingsForm.addEventListener("submit", (event) => controller.saveSettings(event));
    controller.elements.settingsDialog.addEventListener("keydown", (event) => controller.trapSettingsFocus(event));
    controller.elements.settingsDialog.addEventListener("cancel", (event) => {
        event.preventDefault(); controller.closeSettings();
    });
    controller.elements.settingsDialog.addEventListener("close", () => controller.elements.settingsButton.focus());
    controller.elements.end.addEventListener("click", () => controller.end());
    controller.elements.audioUnlock.addEventListener("click", () => controller.activateAudio());
    window.addEventListener("offline", () => controller.handleOffline());
    window.addEventListener("online", () => controller.handleOnline());
    document.addEventListener("visibilitychange", () => controller.recoverAudioAfterVisibility());
    window.addEventListener("pagehide", () => controller.cleanupForNavigation(), { once: true });
    document.addEventListener("waffleberry:signout", () => controller.cleanupForNavigation(), { once: true });
    controller.start();
});
})();
