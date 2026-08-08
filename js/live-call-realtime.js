"use strict";

(function initializeRealtimeLiveCall() {
const RESPONSE_STALL_MS = 10000;
const TOOL_STALL_MS = 7000;
const REMOTE_AUDIO_START_MS = 2500;
const REMOTE_AUDIO_STALL_MS = 1500;
const DATA_CHANNEL_STARTUP_TIMEOUT_MS = 10000;
const BARGE_IN_CONFIRMATION_MS = 150;
const BARGE_IN_MIC_RMS_FLOOR = 0.01;
const BARGE_IN_MIC_PEAK_FLOOR = 0.03;
const EXTERNAL_TTS_MAX_QUEUE = 3;
const EXTERNAL_TTS_TARGET_MIN = 120;
const EXTERNAL_TTS_TARGET_MAX = 220;
const EXTERNAL_FIRST_CHUNK_MIN = 72;
const EXTERNAL_FIRST_CHUNK_WAIT_MS = 160;
const ICE_DISCONNECT_GRACE_MS = 5000;
const TRACK_INTERRUPTION_GRACE_MS = 3000;
let nextLogicalCallGeneration = 0;
let activeLogicalCallGeneration = 0;
let previousRendererKind = "none";
const mediaOwnerGenerations = new WeakMap();

class RealtimeNativeRenderer {
    constructor(controller) { this.controller = controller; this.kind = "native"; }
    startResponse() {}
    enqueueText() {}
    finishResponse() {}
    cancelResponse() {}
    close() {}
    get playing() { return this.controller.assistantSpeaking; }
}

class ExternalPhraseAssembler {
    constructor() { this.buffer = ""; this.chunkCount = 0; }

    reset() { this.buffer = ""; this.chunkCount = 0; }

    push(delta) {
        this.buffer += delta || "";
        return this.drain(false);
    }

    finish() { return this.drain(true); }

    sentenceEnds() {
        const ends = [];
        const pattern = /[.!?\u0964](?=\s|$)/gu;
        let match;
        while ((match = pattern.exec(this.buffer))) ends.push(match.index + match[0].length);
        return ends;
    }

    naturalCut(force) {
        const ends = this.sentenceEnds();
        const first = this.chunkCount === 0;
        if (ends.length >= 2 && ends[1] <= EXTERNAL_TTS_TARGET_MAX) return ends[1];
        if (ends.length && ends[0] <= EXTERNAL_TTS_TARGET_MAX
                && (force || (first && ends[0] >= EXTERNAL_FIRST_CHUNK_MIN)
                || (!first && ends[0] >= EXTERNAL_TTS_TARGET_MIN))) return ends[0];
        if (this.buffer.length >= EXTERNAL_TTS_TARGET_MIN) {
            const clause = Math.max(
                this.buffer.lastIndexOf(",", EXTERNAL_TTS_TARGET_MAX),
                this.buffer.lastIndexOf(";", EXTERNAL_TTS_TARGET_MAX),
                this.buffer.lastIndexOf(":", EXTERNAL_TTS_TARGET_MAX)
            );
            if (clause >= EXTERNAL_TTS_TARGET_MIN) return clause + 1;
        }
        if (this.buffer.length > EXTERNAL_TTS_TARGET_MAX) {
            const wordBoundary = this.buffer.lastIndexOf(" ", EXTERNAL_TTS_TARGET_MAX);
            return wordBoundary >= EXTERNAL_TTS_TARGET_MIN ? wordBoundary : 0;
        }
        return force && this.buffer.trim() ? this.buffer.length : 0;
    }

    drain(force) {
        const chunks = [];
        let cut;
        while ((cut = this.naturalCut(force)) > 0) {
            const chunk = this.buffer.slice(0, cut).trim();
            this.buffer = this.buffer.slice(cut).trimStart();
            if (chunk) { chunks.push(chunk); this.chunkCount += 1; }
            force = force && Boolean(this.buffer);
        }
        return chunks;
    }
}

class ExternalNonStreamingRenderer {
    constructor(controller) {
        this.controller = controller;
        this.kind = "external";
        this.assembler = new ExternalPhraseAssembler();
        this.synthesisQueue = [];
        this.readyQueue = [];
        this.synthesizing = false;
        this.playingQueue = false;
        this.generation = 0;
        this.responseId = null;
        this.chunkSequence = 0;
        this.chunkCharacters = 0;
        this.ttsRequests = 0;
        this.prefetchStarted = 0;
        this.prefetchReady = 0;
        this.firstSentenceTimer = null;
        this.previousEndedAt = null;
        this.maxInterChunkGap = 0;
        this.audio = controller.owner.elements.outputAudio;
        this.objectUrl = null;
        this._playing = false;
        this.resolvePlayback = null;
        this.closed = false;
    }

    get playing() { return this._playing; }
    get busy() {
        return this.synthesizing || this.playingQueue
            || this.synthesisQueue.length > 0 || this.readyQueue.length > 0;
    }

    startResponse(responseId) {
        this.generation += 1;
        this.responseId = responseId || `response-${this.generation}`;
        this.assembler.reset();
        this.synthesisQueue = [];
        this.readyQueue = [];
        this.chunkSequence = 0;
        this.chunkCharacters = 0;
        this.ttsRequests = 0;
        this.prefetchStarted = 0;
        this.prefetchReady = 0;
        this.previousEndedAt = null;
        this.maxInterChunkGap = 0;
        this.clearFirstSentenceTimer();
    }

    enqueueText(delta) {
        if (!delta || !this.responseId) return;
        this.enqueueChunks(this.assembler.push(delta));
        if (this.assembler.sentenceEnds().length) this.armFirstSentenceTimer();
    }

    finishResponse() {
        this.clearFirstSentenceTimer();
        this.enqueueChunks(this.assembler.finish());
    }

    armFirstSentenceTimer() {
        if (this.firstSentenceTimer !== null) return;
        this.firstSentenceTimer = this.controller.clock.setTimeout(() => {
            this.firstSentenceTimer = null;
            if (!this.controller.isCurrentCall()) return this.controller.recordStaleRendererCallback();
            this.enqueueChunks(this.assembler.finish());
        }, EXTERNAL_FIRST_CHUNK_WAIT_MS);
    }

    clearFirstSentenceTimer() {
        if (this.firstSentenceTimer !== null) this.controller.clock.clearTimeout(this.firstSentenceTimer);
        this.firstSentenceTimer = null;
    }

    enqueueChunks(chunks) {
        for (const text of chunks) {
            if (this.synthesisQueue.length + this.readyQueue.length >= EXTERNAL_TTS_MAX_QUEUE) break;
            this.chunkSequence += 1;
            this.chunkCharacters += text.length;
            this.synthesisQueue.push({
                text, sequence: this.chunkSequence, generation: this.generation,
                responseId: this.responseId, assembledAt: this.controller.performance.now()
            });
            this.controller.metric("external_chunk_count", this.chunkSequence);
            this.controller.metric("external_chunk_avg_chars", Math.round(this.chunkCharacters / this.chunkSequence));
            if (this.chunkSequence === 1) this.controller.metric("external_first_chunk_chars", text.length);
        }
        this.controller.metric("external_queue_depth", this.synthesisQueue.length + this.readyQueue.length);
        this.pumpSynthesis();
    }

    async pumpSynthesis() {
        if (this.synthesizing || !this.synthesisQueue.length || this.readyQueue.length >= 1) return;
        this.synthesizing = true;
        const phrase = this.synthesisQueue.shift();
        if (this.playingQueue) {
            this.prefetchStarted += 1;
            this.controller.metric("external_prefetch_started", this.prefetchStarted);
        }
        const requestAt = this.controller.performance.now();
        this.controller.metric("phrase_assembly_ms", Math.max(0, Math.round(requestAt - phrase.assembledAt)));
        this.controller.reportSpeechLatency("response_text_to_first_tts_request_ms", requestAt);
        this.ttsRequests += 1;
        this.controller.metric("external_tts_requests", this.ttsRequests);
        try {
            const result = await this.controller.api.renderRealtimeSpeech(
                this.controller.owner.session.session_id, phrase.responseId,
                `${phrase.generation}:${phrase.sequence}`,
                this.controller.activeUserInputTurnId || 0, phrase.text
            );
            if (!this.controller.isCurrentCall() || phrase.generation !== this.generation
                    || this.controller.userSpeaking) {
                this.controller.recordStaleEvent();
                if (!this.controller.isCurrentCall()) this.controller.recordStaleRendererCallback();
                return;
            }
            this.controller.metric("tts_first_chunk_ms", Math.max(0, Math.round(this.controller.performance.now() - requestAt)));
            this.readyQueue.push({ ...phrase, result });
            if (this.playingQueue) {
                this.prefetchReady += 1;
                this.controller.metric("external_prefetch_ready_before_previous_end", this.prefetchReady);
            }
        } catch {
            if (this.controller.isCurrentCall() && phrase.generation === this.generation) {
                this.controller.recoverResponse("external_tts_failed");
            }
        } finally {
            this.synthesizing = false;
            this.pumpPlayback();
            this.pumpSynthesis();
        }
    }

    async pumpPlayback() {
        if (this.playingQueue || !this.readyQueue.length) return;
        this.playingQueue = true;
        while (this.readyQueue.length) {
            const phrase = this.readyQueue.shift();
            if (phrase.generation !== this.generation) continue;
            await this.play(phrase.result, phrase.generation);
            this.pumpSynthesis();
        }
        this.playingQueue = false;
        if (this.readyQueue.length) return this.pumpPlayback();
        if (!this.synthesizing && !this.synthesisQueue.length && !this.controller.userSpeaking
                && !this.controller.activeResponseId && this.controller.isCurrentCall()) {
            this.controller.owner.setState("listening", this.controller.owner.muted ? "Muted" : "Listening");
        }
    }

    async play(result, generation) {
        if (!this.audio || !this.controller.isCurrentCall() || generation !== this.generation) return;
        const bytes = Uint8Array.from(atob(result.audio), (value) => value.charCodeAt(0));
        const blob = new Blob([bytes], { type: result.content_type || "audio/wav" });
        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = URL.createObjectURL(blob);
        this.controller.claimMedia(this.audio);
        this.audio.srcObject = null;
        this.audio.src = this.objectUrl;
        this.audio.muted = !this.controller.owner.speakerEnabled;
        await this.audio.play();
        if (!this.controller.isCurrentCall() || generation !== this.generation) return this.stopAudio();
        const startedAt = this.controller.performance.now();
        if (this.previousEndedAt !== null) {
            const gap = Math.max(0, Math.round(startedAt - this.previousEndedAt));
            this.maxInterChunkGap = Math.max(this.maxInterChunkGap, gap);
            this.controller.metric("external_inter_chunk_gap_ms", gap);
            this.controller.metric("external_max_inter_chunk_gap_ms", this.maxInterChunkGap);
        }
        this._playing = true;
        this.controller.responseHasAudio = true;
        this.controller.assistantSpeaking = true;
        this.controller.owner.setState("speaking", "Speaking");
        this.controller.reportSpeechLatency("external_first_audio_ms", this.controller.performance.now());
        this.controller.reportSpeechLatency("speech_end_to_audible_ms", this.controller.performance.now());
        await new Promise((resolve) => {
            const done = () => { this.audio.removeEventListener("ended", done); this.resolvePlayback = null; resolve(); };
            this.resolvePlayback = done;
            this.audio.addEventListener("ended", done, { once: true });
        });
        if (this.controller.isCurrentCall() && generation === this.generation) {
            this.previousEndedAt = this.controller.performance.now();
            this._playing = false;
            this.controller.assistantSpeaking = false;
            this.controller.responseHasAudio = false;
            if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
            if (this.controller.ownsMedia(this.audio)) {
                this.audio.src = "";
                this.controller.releaseMedia(this.audio);
            }
        }
    }

    stopAudio() {
        if (!this.controller.ownsMedia(this.audio)) return;
        this.audio?.pause?.();
        if (this.audio) this.audio.src = "";
        this.resolvePlayback?.();
        this.resolvePlayback = null;
        this._playing = false;
        this.controller.releaseMedia(this.audio);
    }

    cancelResponse() {
        this.generation += 1;
        this.clearFirstSentenceTimer();
        this.assembler.reset();
        this.synthesisQueue = [];
        this.readyQueue = [];
        this.stopAudio();
    }

    close() {
        this.cancelResponse();
        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
        this.closed = true;
    }
}

class RealtimeLiveCallController {
    constructor(owner, options = {}) {
        this.owner = owner;
        this.api = owner.api;
        this.RTCPeerConnectionClass = options.RTCPeerConnectionClass || window.RTCPeerConnection;
        this.fetch = options.fetch || window.fetch.bind(window);
        this.performance = options.performance || window.performance;
        this.clock = options.clock || owner.clock || window;
        this.logicalCallGeneration = ++nextLogicalCallGeneration;
        activeLogicalCallGeneration = this.logicalCallGeneration;
        this.staleRendererCallbackCount = 0;
        this.AudioContextClass = options.AudioContextClass || owner.AudioContextClass || window.AudioContext;
        this.peer = null;
        this.channel = null;
        this.remoteStream = null;
        this.micTrack = null;
        this.micSender = null;
        this.micTransceiver = null;
        this.micDiagnosticTrack = null;
        this.micDiagnosticContext = null;
        this.micDiagnosticOwnsContext = false;
        this.micDiagnosticAnalyser = null;
        this.micDiagnosticTimer = null;
        this.remoteDiagnosticTrack = null;
        this.remoteDiagnosticContext = null;
        this.remoteDiagnosticAnalyser = null;
        this.remoteDiagnosticTimer = null;
        this.micRms = 0;
        this.micPeak = 0;
        this.assistantRms = 0;
        this.assistantPeak = 0;
        this.bargeInCandidate = null;
        this.lastInboundAudioStats = null;
        this.speechStartedTotal = 0;
        this.speechStartedWhileAssistantIdle = 0;
        this.speechStartedWhileAssistantSpeaking = 0;
        this.speechStoppedTotal = 0;
        this.assistantOutputClearCount = 0;
        this.falseInterruptCandidateCount = 0;
        this.speechStartedLocalMicRms = 0;
        this.speechStartedLocalMicPeak = 0;
        this.lastSpeechStartedMonotonicMs = null;
        this.observedEventTypes = new Set();
        this.started = false;
        this.closed = false;
        this.greetingSent = false;
        this.remoteAttached = false;
        this.responseHasAudio = false;
        this.userSpeaking = false;
        this.assistantSpeaking = false;
        this.activeResponseId = null;
        this.activeAssistantItemId = null;
        this.activeToolCallId = null;
        this.assistantOwnership = 0;
        this.userInputTurnId = 0;
        this.activeUserInputTurnId = null;
        this.turnIndex = 0;
        this.cancelledResponseIds = new Set();
        this.completedToolCalls = new Set();
        this.pendingLearningTurns = new Map();
        this.responseWatchdog = null;
        this.speechStartedAt = null;
        this.speechEndedAt = null;
        this.firstAudioReceivedAt = null;
        this.interruptionStartedAt = null;
        this.interruptionHandledForSpeech = false;
        this.staleEventsSuppressed = 0;
        this.controlEventSequence = 0;
        this.interruptionControlEventIds = new Set();
        this.interruptionDiagnostics = {
            speech_started_received: false, user_speech_started_received: false,
            assistant_playback_active: false, assistant_was_speaking: false,
            response_generation_active: false, response_cancel_sent: false,
            buffer_clear_sent: false, output_clear_sent: false, truncate_sent: false,
            playback_position_ms: null, old_audio_stopped_ms: null,
            remote_audio_stopped: false, ui_exited_speaking: false,
            stale_events_suppressed: 0, next_turn_started: false
        };
        this.waitingForToolContinuation = false;
        this.remoteTrack = null;
        this.mediaPlaying = false;
        this.mediaRepairAttempted = false;
        this.mediaWatchdog = null;
        this.playStatus = "not_requested";
        this.lastResponseEvent = "none";
        this.lastMediaEvent = "none";
        this.lastToolEvent = "none";
        this.memoryDiagnostics = {
            last_tool: "none", status: "unsupported", memories_used: 0,
            identities_used: 0, tool_latency_ms: null, followup_context: "none"
        };
        this.lastAudioFailure = "none";
        this.startupStage = "not_started";
        this.startupFailureCategory = "none";
        this.startupStatusCode = null;
        this.dataChannelReady = null;
        this.resolveDataChannelReady = null;
        this.rejectDataChannelReady = null;
        this.iceDisconnectTimer = null;
        this.remoteMuteTimer = null;
        this.micMuteTimer = null;
        this.recoveryRequested = false;
        this.reconnectCount = 0;
        this.lastRecoveryReason = "none";
        this.lastProviderFailureCategory = "none";
        this.unexpectedDisconnectCount = 0;
        this.micReplacementCount = 0;
        this.sessionStartedAt = this.performance.now();
        this.turnEvidence = {
            speech_started: false, speech_stopped: false, user_turn_committed: false,
            response_created: false, first_output_received: false
        };
        this.boundPeerStateChange = () => this.handlePeerStateChange();
        this.boundIceStateChange = () => this.handleIceStateChange();
        this.boundMicMute = () => this.handleMicMute();
        this.boundMicUnmute = () => this.handleMicUnmute();
        this.boundMicEnded = () => this.handleMicEnded();
        this.boundRemoteTrackMute = () => this.handleTrackMute();
        this.boundRemoteTrackUnmute = () => this.handleTrackUnmute();
        this.boundRemoteTrackEnded = () => this.handleTrackEnded();
        this.boundMediaPlaying = () => this.handleMediaPlaying("playing");
        this.boundMediaTimeUpdate = () => this.handleMediaPlaying("timeupdate");
        this.boundMediaPause = () => this.handleMediaPause();
        this.boundMediaWaiting = () => this.handleMediaStall("waiting");
        this.boundMediaStalled = () => this.handleMediaStall("stalled");
        this.boundMediaError = () => this.handleMediaFailure("media_error");
        this.boundMediaEnded = () => this.handleMediaFailure("media_ended");
        this.renderer = owner.session?.speech_renderer === "external_nonstreaming_tts"
            || owner.session?.speech_renderer === "external_streaming_tts"
            ? new ExternalNonStreamingRenderer(this) : new RealtimeNativeRenderer(this);
        this.previousRendererKind = previousRendererKind;
        previousRendererKind = this.renderer.kind;
        if (this.renderer.kind === "native") this.claimMedia(owner.elements.realtimeOutput);
    }

    isCurrentCall() { return !this.closed && this.logicalCallGeneration === activeLogicalCallGeneration; }
    claimMedia(audio) { if (audio) mediaOwnerGenerations.set(audio, this.logicalCallGeneration); }
    ownsMedia(audio) { return Boolean(audio) && mediaOwnerGenerations.get(audio) === this.logicalCallGeneration; }
    releaseMedia(audio) { if (this.ownsMedia(audio)) mediaOwnerGenerations.delete(audio); }
    recordStaleRendererCallback() {
        this.staleRendererCallbackCount += 1;
        this.metric("stale_renderer_callback_count", this.staleRendererCallbackCount);
    }

    recordStartup(stage, success = true, failureCategory = "none", statusCode = null, error = null) {
        this.startupStage = stage;
        this.startupFailureCategory = failureCategory;
        this.startupStatusCode = statusCode;
        if (!this.owner.debugLiveCall) return;
        console.debug("REALTIME_STARTUP", {
            session_id: this.owner.session?.session_id?.slice(-8) || "none",
            stage, success, failure_category: failureCategory,
            status_code: Number.isInteger(statusCode) ? statusCode : "na",
            exception_name: error?.name || "na"
        });
        this.owner.renderDebugPanel?.();
    }

    async start() {
        if (!this.RTCPeerConnectionClass) throw new Error("WebRTC is unavailable.");
        this.owner.recordFrontendStartup?.("realtime_start_entered");
        this.recordStartup("bootstrap_started");
        let bootstrap;
        try {
            if (typeof this.api?.createRealtimeBootstrap !== "function") {
                const error = new TypeError("Realtime bootstrap API is unavailable.");
                error.frontendCategory = "bootstrap_method_missing";
                error.messageCode = "bootstrap_method_missing";
                throw error;
            }
            this.owner.recordFrontendStartup?.("bootstrap_request_about_to_send");
            const bootstrapRequest = this.api.createRealtimeBootstrap(
                this.owner.session.session_id
            );
            this.owner.recordFrontendStartup?.("bootstrap_request_sent");
            bootstrap = await bootstrapRequest;
        } catch (error) {
            this.lastProviderFailureCategory = [
                "provider_rate_limited", "provider_quota_exhausted", "provider_transient"
            ].includes(error?.kind) ? error.kind : "unknown";
            this.recordStartup("bootstrap_failed", false,
                error?.status === 401 || error?.status === 403
                    ? "bootstrap_auth_failed" : "bootstrap_request_failed",
                error?.status, error);
            error.frontendCategory ||= error?.messageCode === "bootstrap_method_missing"
                ? "bootstrap_method_missing" : "bootstrap_request_failed";
            error.realtimeStage = this.startupStage;
            throw error;
        }
        try {
            this.peer = new this.RTCPeerConnectionClass();
        } catch (error) {
            this.recordStartup("peer_connection_failed", false, "peer_connection_failed", null, error);
            error.realtimeStage = this.startupStage;
            throw error;
        }
        this.peer.addEventListener?.("connectionstatechange", this.boundPeerStateChange);
        this.peer.addEventListener?.("iceconnectionstatechange", this.boundIceStateChange);
        this.recordStartup("peer_connection_created");
        this.channel = this.peer.createDataChannel("oai-events");
        this.dataChannelReady = new Promise((resolve, reject) => {
            this.resolveDataChannelReady = resolve;
            this.rejectDataChannelReady = reject;
        });
        this.channel.addEventListener("open", () => this.handleOpen(), { once: true });
        this.channel.addEventListener("message", (event) => this.handleEvent(event));
        this.channel.addEventListener("close", () => this.handleDataChannelFailure());
        this.channel.addEventListener("error", () => this.handleDataChannelFailure());
        this.peer.ontrack = (event) => this.attachRemoteAudio(event);
        this.micTrack = this.owner.stream.getAudioTracks?.()[0]
            || this.owner.stream.getTracks().find((track) => track.kind === "audio") || null;
        if (!this.micTrack) throw new Error("Realtime microphone track unavailable.");
        this.micTrack.addEventListener?.("mute", this.boundMicMute);
        this.micTrack.addEventListener?.("unmute", this.boundMicUnmute);
        this.micTrack.addEventListener?.("ended", this.boundMicEnded);
        await this.configureMicTrack();
        this.micSender = this.peer.addTrack(this.micTrack, this.owner.stream);
        this.recordStartup("local_track_added");
        this.micTransceiver = this.peer.getTransceivers?.().find(
            (transceiver) => transceiver.sender === this.micSender
                || transceiver.sender?.track === this.micTrack
        ) || null;
        this.startMicDiagnostic();
        const offer = await this.peer.createOffer();
        this.recordStartup("offer_created");
        await this.peer.setLocalDescription(offer);
        this.recordStartup("local_description_set");
        this.recordStartup("sdp_exchange_started");
        const answer = await this.fetch("https://api.openai.com/v1/realtime/calls", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${bootstrap.client_secret}`,
                "Content-Type": "application/sdp"
            },
            body: offer.sdp
        });
        if (!answer.ok) {
            const error = new Error("Realtime signaling failed.");
            error.status = answer.status;
            this.recordStartup("sdp_exchange_failed", false, "sdp_provider_rejected",
                answer.status, error);
            error.realtimeStage = this.startupStage;
            throw error;
        }
        this.recordStartup("sdp_exchange_completed");
        try {
            await this.peer.setRemoteDescription({ type: "answer", sdp: await answer.text() });
        } catch (error) {
            this.recordStartup("remote_description_failed", false,
                "remote_description_failed", null, error);
            error.realtimeStage = this.startupStage;
            throw error;
        }
        this.recordStartup("remote_description_set");
        this.micTransceiver = this.micTransceiver || this.peer.getTransceivers?.().find(
            (transceiver) => transceiver.sender?.track === this.micTrack
        ) || null;
        this.debugInputPath();
        let timeoutId;
        try {
            await Promise.race([
                this.dataChannelReady,
                new Promise((_, reject) => {
                    timeoutId = this.clock.setTimeout(() => reject(
                        Object.assign(new Error("Realtime data channel timed out."), {
                            realtimeStage: "data_channel_timeout"
                        })
                    ), DATA_CHANNEL_STARTUP_TIMEOUT_MS);
                })
            ]);
        } catch (error) {
            const category = error.realtimeStage === "data_channel_timeout"
                ? "data_channel_timeout" : "data_channel_failed";
            this.recordStartup(category, false, category, null, error);
            error.realtimeStage = this.startupStage;
            throw error;
        } finally {
            if (timeoutId !== undefined) this.clock.clearTimeout(timeoutId);
        }
    }

    async configureMicTrack() {
        if (!this.micTrack?.applyConstraints) return;
        try {
            await this.micTrack.applyConstraints({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            });
        } catch {
            // The original live capture remains valid when a browser does not
            // support refining one of these optional processing constraints.
        }
    }

    handlePeerStateChange() {
        const state = this.peer?.connectionState || "unknown";
        if (state === "connected") return this.markTransportRecovered();
        if (state === "disconnected") return this.beginIceGrace("network_transient");
        if (state === "failed") this.requestTransportRecovery("peer_failed");
        if (state === "closed" && !this.closed) this.requestTransportRecovery("peer_failed");
        this.owner.renderDebugPanel?.();
    }

    handleIceStateChange() {
        const state = this.peer?.iceConnectionState || "unknown";
        if (["connected", "completed"].includes(state)) return this.markTransportRecovered();
        if (state === "disconnected") return this.beginIceGrace("ice_disconnected");
        if (state === "failed") this.requestTransportRecovery("ice_failed");
        this.owner.renderDebugPanel?.();
    }

    beginIceGrace(reason) {
        if (this.closed || this.iceDisconnectTimer !== null) return;
        this.lastRecoveryReason = reason;
        this.unexpectedDisconnectCount += 1;
        this.metric("unexpected_disconnect_count", this.unexpectedDisconnectCount);
        this.owner.setTransportState?.("reconnecting", "Reconnecting…");
        this.iceDisconnectTimer = this.clock.setTimeout(() => {
            this.iceDisconnectTimer = null;
            const connection = this.peer?.connectionState;
            const ice = this.peer?.iceConnectionState;
            if (connection === "disconnected" || ice === "disconnected") {
                this.requestTransportRecovery(reason);
            }
        }, ICE_DISCONNECT_GRACE_MS);
    }

    markTransportRecovered() {
        if (this.iceDisconnectTimer !== null) this.clock.clearTimeout(this.iceDisconnectTimer);
        this.iceDisconnectTimer = null;
        if (this.owner.transportState === "reconnecting") this.owner.setTransportState?.("connected");
        this.owner.renderDebugPanel?.();
    }

    requestTransportRecovery(reason) {
        if (this.closed || this.recoveryRequested) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            this.handleOfflineHint();
            return;
        }
        const expiresAt = Date.parse(this.owner.session?.expires_at || "");
        if (Number.isFinite(expiresAt) && Date.now() >= expiresAt) {
            this.lastRecoveryReason = "session_expired";
            this.owner.fail("We couldn’t continue the call.");
            return;
        }
        this.recoveryRequested = true;
        this.lastRecoveryReason = reason;
        this.renderer.cancelResponse();
        this.clearResponseWatchdog();
        this.owner.recoverRealtimeTransport?.(reason);
    }

    handleOfflineHint() {
        if (this.closed) return;
        this.lastRecoveryReason = "network_offline";
        this.owner.setTransportState?.("offline", "Reconnecting…");
        this.renderer.cancelResponse();
    }

    handleOnlineHint() {
        if (this.closed) return;
        const healthy = this.peer?.connectionState === "connected"
            && this.channel?.readyState === "open";
        if (healthy) return this.markTransportRecovered();
        if (this.peer?.connectionState === "failed" || this.peer?.iceConnectionState === "failed") {
            return this.requestTransportRecovery("network_transient");
        }
        if (this.channel?.readyState === "closed") return this.requestTransportRecovery("data_channel_closed");
        this.beginIceGrace("network_transient");
    }

    verifyAfterForeground() {
        if (this.closed) return;
        if (this.micTrack?.readyState === "ended") this.handleMicEnded();
        if (this.peer?.connectionState === "failed" || this.peer?.iceConnectionState === "failed") {
            return this.requestTransportRecovery("peer_failed");
        }
        if (this.channel?.readyState !== "open") return this.requestTransportRecovery("data_channel_closed");
        if (this.renderer.kind === "native" && this.remoteTrack?.readyState === "ended") {
            return this.requestTransportRecovery("remote_track_ended");
        }
        if (this.renderer.kind === "native" && this.remoteStream) this.requestRemotePlay("foreground");
    }

    handleMicMute() {
        if (this.closed || this.micMuteTimer !== null) return;
        this.lastRecoveryReason = "microphone_interrupted";
        this.micMuteTimer = this.clock.setTimeout(() => {
            this.micMuteTimer = null;
            if (this.micTrack?.muted) this.replaceMicrophoneTrack();
        }, TRACK_INTERRUPTION_GRACE_MS);
    }

    handleMicUnmute() {
        if (this.micMuteTimer !== null) this.clock.clearTimeout(this.micMuteTimer);
        this.micMuteTimer = null;
    }

    handleMicEnded() {
        if (!this.closed) this.replaceMicrophoneTrack();
    }

    async replaceMicrophoneTrack() {
        if (this.closed || this.replacingMicrophone) return;
        this.replacingMicrophone = true;
        try {
            const stream = await this.owner.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true }, video: false
            });
            const replacement = stream.getAudioTracks?.()[0];
            if (!replacement || this.closed) { stream.getTracks?.().forEach((track) => track.stop()); return; }
            await this.micSender?.replaceTrack?.(replacement);
            const previous = this.micTrack;
            previous?.removeEventListener?.("mute", this.boundMicMute);
            previous?.removeEventListener?.("unmute", this.boundMicUnmute);
            previous?.removeEventListener?.("ended", this.boundMicEnded);
            this.owner.stream?.removeTrack?.(previous);
            previous?.stop?.();
            this.micTrack = replacement;
            this.owner.stream?.addTrack?.(replacement);
            replacement.enabled = !this.owner.muted;
            replacement.addEventListener?.("mute", this.boundMicMute);
            replacement.addEventListener?.("unmute", this.boundMicUnmute);
            replacement.addEventListener?.("ended", this.boundMicEnded);
            this.micReplacementCount += 1;
            this.metric("mic_replacement_count", this.micReplacementCount);
            this.owner.elements.microphoneStatus.textContent = this.owner.muted ? "Microphone muted" : "Microphone on";
        } catch {
            this.requestTransportRecovery("microphone_ended");
        } finally {
            this.replacingMicrophone = false;
        }
    }

    invalidateForRecovery(reason) {
        this.lastRecoveryReason = reason;
        this.renderer.cancelResponse();
        this.assistantOwnership += 1;
    }

    handleOpen() {
        if (this.started) return;
        this.started = true;
        this.recordStartup("data_channel_open");
        this.resolveDataChannelReady?.();
        this.owner.stopRingback(false);
        this.owner.startTimer();
        this.owner.reportOperational?.("call_started", "started");
        this.owner.elements.mute.disabled = false;
        this.owner.elements.speaker.disabled = false;
        this.owner.setState("greeting", "Connecting…");
        if (!this.greetingSent) {
            this.greetingSent = true;
            this.send({
                type: "response.create",
                response: { output_modalities: [this.renderer.kind === "native" ? "audio" : "text"], tool_choice: "none", instructions: "Say exactly: Hello? Do not say anything else." }
            });
            this.armResponseWatchdog();
        }
    }

    attachRemoteAudio(event) {
        if (this.remoteAttached || event.track?.kind !== "audio") return;
        const stream = event.streams?.[0] || new MediaStream([event.track]);
        this.remoteAttached = true;
        this.remoteStream = stream;
        this.remoteTrack = event.track;
        this.recordStartup("remote_audio_track_received");
        const audio = this.owner.elements.realtimeOutput;
        this.claimMedia(audio);
        audio.autoplay = true;
        audio.playsInline = true;
        audio.muted = !this.owner.speakerEnabled;
        audio.volume = 1;
        audio.srcObject = stream;
        event.track.addEventListener?.("mute", this.boundRemoteTrackMute);
        event.track.addEventListener?.("unmute", this.boundRemoteTrackUnmute);
        event.track.addEventListener?.("ended", this.boundRemoteTrackEnded, { once: true });
        audio.addEventListener("playing", this.boundMediaPlaying);
        audio.addEventListener("timeupdate", this.boundMediaTimeUpdate);
        audio.addEventListener("pause", this.boundMediaPause);
        audio.addEventListener("waiting", this.boundMediaWaiting);
        audio.addEventListener("stalled", this.boundMediaStalled);
        audio.addEventListener("error", this.boundMediaError);
        audio.addEventListener("ended", this.boundMediaEnded);
        this.debugRemoteAudio({ track_received: true, audio_srcobject_attached: true });
        this.requestRemotePlay("track_attached");
        this.startRemoteLevelDiagnostic(event.track);
    }

    startRemoteLevelDiagnostic(track) {
        if (!this.owner.debugLiveCall || !this.AudioContextClass || !track) return;
        try {
            this.remoteDiagnosticTrack = track.clone?.() || track;
            this.remoteDiagnosticContext = new this.AudioContextClass();
            this.remoteDiagnosticContext.resume?.().catch?.(() => {});
            const stream = new MediaStream([this.remoteDiagnosticTrack]);
            const source = this.remoteDiagnosticContext.createMediaStreamSource(stream);
            this.remoteDiagnosticAnalyser = this.remoteDiagnosticContext.createAnalyser();
            this.remoteDiagnosticAnalyser.fftSize = 512;
            source.connect(this.remoteDiagnosticAnalyser);
            const samples = new Uint8Array(this.remoteDiagnosticAnalyser.fftSize);
            const sample = () => {
                if (this.closed || !this.remoteDiagnosticAnalyser) return;
                this.remoteDiagnosticAnalyser.getByteTimeDomainData(samples);
                let sum = 0;
                let peak = 0;
                for (const value of samples) {
                    const normalized = (value - 128) / 128;
                    sum += normalized * normalized;
                    peak = Math.max(peak, Math.abs(normalized));
                }
                this.assistantRms = Math.sqrt(sum / samples.length);
                this.assistantPeak = peak;
                this.remoteDiagnosticTimer = this.clock.setTimeout(sample, 50);
            };
            sample();
        } catch {
            if (this.remoteDiagnosticTrack !== track) this.remoteDiagnosticTrack?.stop?.();
            this.remoteDiagnosticTrack = null;
        }
    }

    handleEvent(messageEvent) {
        let event;
        try { event = JSON.parse(messageEvent.data); } catch { return; }
        this.recordEventType(event.type);
        const responseId = event.response_id || event.response?.id || null;
        this.lastResponseEvent = event.type;
        if (event.type === "input_audio_buffer.speech_started") {
            this.handleSpeechStarted();
        } else if (event.type === "input_audio_buffer.speech_stopped") {
            this.handleSpeechStopped();
        } else if (event.type === "input_audio_buffer.committed") {
            this.turnEvidence.user_turn_committed = true;
        } else if (event.type === "conversation.item.input_audio_transcription.completed") {
            const text = typeof event.transcript === "string" ? event.transcript.trim() : "";
            if (text && this.activeUserInputTurnId > 0) {
                this.pendingLearningTurns.set(this.activeUserInputTurnId, text);
                while (this.pendingLearningTurns.size > 32) {
                    this.pendingLearningTurns.delete(this.pendingLearningTurns.keys().next().value);
                }
            }
        } else if (event.type === "response.created") {
            this.handleResponseCreated(event.response);
        } else if (event.type === "response.output_item.added") {
            this.handleOutputItemAdded(event.item);
        } else if (event.type === "response.output_audio.delta") {
            this.handleAudioDelta(responseId);
        } else if (event.type === "response.output_text.delta") {
            this.handleTextDelta(responseId, event.delta);
        } else if (event.type === "response.output_text.done") {
            this.renderer.finishResponse();
        } else if (event.type === "response.output_audio.done") {
            // Generation completion is not playback completion for WebRTC.
        } else if (event.type === "response.done" || event.type === "response.cancelled"
                || event.type === "response.failed") {
            this.handleResponseTerminal(event, responseId);
        } else if (event.type === "response.function_call_arguments.done") {
            this.runTool(event);
        } else if (event.type === "output_audio_buffer.cleared") {
            this.handleAudioCleared();
        } else if (event.type === "output_audio_buffer.stopped") {
            this.handleMediaPlaybackComplete();
        } else if (event.type === "error") {
            if (event.event_id && this.interruptionControlEventIds.delete(event.event_id)) {
                this.debug("REALTIME_INTERRUPT", { control_race_ignored: true });
                return;
            }
            this.lastProviderFailureCategory = this.classifyProviderError(event.error);
            this.metric("provider_error_count", 1);
            this.recoverResponse(this.lastProviderFailureCategory);
        }
    }

    handleSpeechStarted() {
        const now = this.performance.now();
        this.turnEvidence = {
            speech_started: true, speech_stopped: false, user_turn_committed: false,
            response_created: false, first_output_received: false
        };
        const playbackActive = Boolean(this.assistantSpeaking || this.responseHasAudio
            || (this.renderer.kind === "external" && this.renderer.busy));
        const generationActive = Boolean(this.activeResponseId);
        const interrupting = playbackActive || generationActive;
        this.speechStartedTotal += 1;
        this.lastSpeechStartedMonotonicMs = Math.round(now);
        if (playbackActive) this.speechStartedWhileAssistantSpeaking += 1;
        else this.speechStartedWhileAssistantIdle += 1;
        this.debugInputPath();
        if (this.userSpeaking || this.bargeInCandidate) {
            this.debug("REALTIME_BARGE_IN", {
                user_input_turn_id: this.activeUserInputTurnId || "pending",
                duplicate_speech_started: true,
                assistant_output_clear_count: this.assistantOutputClearCount
            });
            return;
        }
        if (interrupting) {
            this.collectInboundAudioStats();
            const candidate = {
                startedAt: now, playbackActive, generationActive,
                micRms: this.micRms, micPeak: this.micPeak,
                assistantRms: this.assistantRms, assistantPeak: this.assistantPeak,
                timer: null
            };
            candidate.timer = this.clock.setTimeout(
                () => this.confirmBargeInCandidate(candidate), BARGE_IN_CONFIRMATION_MS
            );
            this.bargeInCandidate = candidate;
            this.debug("REALTIME_BARGE_IN", {
                candidate_started_ms: Math.round(now), confirmation_ms: BARGE_IN_CONFIRMATION_MS,
                mic_rms: Number(candidate.micRms.toFixed(6)),
                mic_peak: Number(candidate.micPeak.toFixed(6)),
                assistant_rms: Number(candidate.assistantRms.toFixed(6)),
                assistant_peak: Number(candidate.assistantPeak.toFixed(6))
            });
            return;
        }
        this.beginUserSpeech(now, playbackActive, generationActive);
    }

    beginUserSpeech(now, playbackActive, generationActive) {
        const interrupting = playbackActive || generationActive;
        this.userInputTurnId += 1;
        this.owner.countOperational?.("turn_started_count");
        this.activeUserInputTurnId = this.userInputTurnId;
        this.userSpeaking = true;
        this.speechStartedAt = now;
        this.speechStartedLocalMicRms = this.micRms;
        this.speechStartedLocalMicPeak = this.micPeak;
        this.clearResponseWatchdog();
        this.owner.setState("user_speaking", "Listening");
        this.interruptionDiagnostics = {
            speech_started_received: true,
            user_speech_started_received: true,
            assistant_playback_active: playbackActive,
            assistant_was_speaking: playbackActive,
            response_generation_active: generationActive,
            response_cancel_sent: false, buffer_clear_sent: false, output_clear_sent: false,
            truncate_sent: false, playback_position_ms: this.playbackPositionMs(),
            old_audio_stopped_ms: null, remote_audio_stopped: false, ui_exited_speaking: true,
            stale_events_suppressed: this.staleEventsSuppressed,
            next_turn_started: true
        };
        if (interrupting && !this.interruptionHandledForSpeech) {
            this.interruptionHandledForSpeech = true;
            this.handleRealtimeInterruption({ playbackActive, generationActive });
        }
        this.debug("REALTIME_BARGE_IN", {
            user_input_turn_id: this.activeUserInputTurnId,
            speech_started_ms: Math.round(now),
            ui_listening_ms: Math.round(this.performance.now()),
            local_mic_rms: Number(this.speechStartedLocalMicRms.toFixed(6)),
            local_mic_peak: Number(this.speechStartedLocalMicPeak.toFixed(6))
        });
        this.debug("REALTIME_INTERRUPT", { ...this.interruptionDiagnostics, ui_exited_speaking: true });
        this.debug("REALTIME_TURN", { turn_index: this.turnIndex + 1, speech_started: true });
    }

    candidateHasNearFieldSpeech(candidate) {
        return candidate.micRms >= BARGE_IN_MIC_RMS_FLOOR
            || candidate.micPeak >= BARGE_IN_MIC_PEAK_FLOOR;
    }

    async collectInboundAudioStats() {
        if (!this.owner.debugLiveCall || typeof this.peer?.getStats !== "function") return;
        try {
            const stats = await this.peer.getStats();
            for (const report of stats.values()) {
                if (report.type !== "inbound-rtp" || report.kind !== "audio") continue;
                this.lastInboundAudioStats = {
                    packets_received: report.packetsReceived ?? null,
                    packets_lost: report.packetsLost ?? null,
                    jitter: report.jitter ?? null,
                    concealed_samples: report.concealedSamples ?? null,
                    jitter_buffer_delay: report.jitterBufferDelay ?? null,
                    jitter_buffer_emitted_count: report.jitterBufferEmittedCount ?? null
                };
                this.debug("REALTIME_WEBRTC_STATS", this.lastInboundAudioStats);
                break;
            }
        } catch { /* diagnostics never affect media */ }
    }

    confirmBargeInCandidate(candidate) {
        if (this.bargeInCandidate !== candidate || !this.candidateHasNearFieldSpeech(candidate)) return false;
        this.clock.clearTimeout(candidate.timer);
        this.bargeInCandidate = null;
        this.beginUserSpeech(candidate.startedAt, candidate.playbackActive, candidate.generationActive);
        this.debug("REALTIME_BARGE_IN", {
            user_actually_confirmed_speech: true,
            confirmation_delay_ms: Math.max(0, Math.round(this.performance.now() - candidate.startedAt)),
            probable_echo_interrupt: false
        });
        return true;
    }

    handleSpeechStopped() {
        const now = this.performance.now();
        this.turnEvidence.speech_stopped = true;
        this.speechStoppedTotal += 1;
        if (this.bargeInCandidate) {
            const candidate = this.bargeInCandidate;
            if (this.confirmBargeInCandidate(candidate)) {
                return this.finishUserSpeech(now);
            }
            this.clock.clearTimeout(candidate.timer);
            this.bargeInCandidate = null;
            this.falseInterruptCandidateCount += 1;
            this.debug("REALTIME_BARGE_IN", {
                user_actually_confirmed_speech: false,
                probable_echo_interrupt: true,
                speech_started_duration_ms: Math.max(0, Math.round(now - candidate.startedAt)),
                mic_rms: Number(candidate.micRms.toFixed(6)),
                mic_peak: Number(candidate.micPeak.toFixed(6)),
                assistant_rms: Number(candidate.assistantRms.toFixed(6)),
                assistant_peak: Number(candidate.assistantPeak.toFixed(6)),
                false_interrupt_candidate_count: this.falseInterruptCandidateCount
            });
            return;
        }
        this.finishUserSpeech(now);
    }

    finishUserSpeech(now) {
        const speechDurationMs = this.speechStartedAt === null
            ? null : Math.max(0, Math.round(now - this.speechStartedAt));
        this.userSpeaking = false;
        this.interruptionHandledForSpeech = false;
        this.turnIndex += 1;
        this.speechEndedAt = now;
        this.firstAudioReceivedAt = null;
        this.owner.setState("processing", "Thinking");
        this.armResponseWatchdog();
        this.debug("REALTIME_BARGE_IN", {
            user_input_turn_id: this.activeUserInputTurnId,
            speech_stopped_ms: Math.round(now),
            speech_started_duration_until_speech_stopped: speechDurationMs,
            false_interrupt_candidate_count: this.falseInterruptCandidateCount,
            assistant_output_clear_count: this.assistantOutputClearCount
        });
        this.debug("REALTIME_TURN", {
            turn_index: this.turnIndex,
            speech_stopped: true,
            speech_duration_ms: speechDurationMs,
            silence_before_commit_ms: 1400
        });
    }

    handleResponseCreated(response) {
        const responseId = response?.id || null;
        this.turnEvidence.response_created = true;
        if (responseId && this.cancelledResponseIds.has(responseId)) return this.recordStaleEvent();
        if (this.activeResponseId && responseId && this.activeResponseId !== responseId) {
            this.markResponseCancelled(this.activeResponseId);
        }
        this.activeResponseId = responseId;
        this.renderer.startResponse(responseId);
        this.assistantOwnership += 1;
        this.mediaRepairAttempted = false;
        if (this.waitingForToolContinuation) {
            this.waitingForToolContinuation = false;
            this.debug("REALTIME_TOOL", { continuation_started: true });
        }
        this.armResponseWatchdog();
        this.debug("REALTIME_TURN", { turn_index: this.turnIndex, response_created_ms: Math.round(this.performance.now()) });
        this.debug("REALTIME_BARGE_IN", {
            user_input_turn_id: this.activeUserInputTurnId,
            next_response_created_ms: Math.round(this.performance.now())
        });
    }

    handleOutputItemAdded(item) {
        if (item?.type === "message" && item?.role === "assistant") {
            this.activeAssistantItemId = item.id || null;
        }
    }

    handleAudioDelta(responseId) {
        if (this.userSpeaking || (responseId && this.cancelledResponseIds.has(responseId))
                || (responseId && this.activeResponseId && responseId !== this.activeResponseId)) {
            this.recordStaleEvent();
            return;
        }
        this.responseHasAudio = true;
        this.turnEvidence.first_output_received = true;
        if (this.firstAudioReceivedAt === null) {
            this.firstAudioReceivedAt = this.performance.now();
            this.reportSpeechLatency("model_audio_first_received_ms", this.firstAudioReceivedAt);
            this.debug("REALTIME_TURN", { turn_index: this.turnIndex, first_audio_ms: Math.round(this.firstAudioReceivedAt) });
        }
        this.armRemoteAudioWatchdog(REMOTE_AUDIO_START_MS, "remote_audio_not_playing");
        if (this.mediaPlaying && this.remoteTrackHealthy()) this.confirmMediaPlayback();
    }

    handleTextDelta(responseId, delta) {
        if (this.renderer.kind !== "external") return;
        if (this.userSpeaking || (responseId && this.cancelledResponseIds.has(responseId))
                || (responseId && this.activeResponseId && responseId !== this.activeResponseId)) {
            return this.recordStaleEvent();
        }
        this.reportSpeechLatency("speech_end_to_response_text_ms", this.performance.now());
        this.turnEvidence.first_output_received = true;
        this.renderer.enqueueText(delta);
    }

    handleResponseTerminal(event, responseId) {
        const status = event.response?.status || (event.type === "response.failed" ? "failed" :
            event.type === "response.cancelled" ? "cancelled" : "completed");
        const stale = Boolean(responseId && (this.cancelledResponseIds.has(responseId)
            || (this.activeResponseId && responseId !== this.activeResponseId)));
        if (stale) return this.recordStaleEvent();
        if (status === "failed") {
            this.lastProviderFailureCategory = "response_failed";
            this.owner.countOperational?.("turn_failed_count");
            this.pendingLearningTurns.delete(this.activeUserInputTurnId);
            return this.recoverResponse("response_failed");
        }
        this.clearResponseWatchdog();
        if (status === "completed" && this.renderer.kind === "external") this.renderer.finishResponse();
        if (responseId === this.activeResponseId || !responseId) this.activeResponseId = null;
        // A WebRTC response can be fully generated while its server-managed
        // output buffer is still audible. Preserve that fact so the next
        // native speech-start always clears unheard audio.
        if (status !== "completed") this.responseHasAudio = false;
        if (!this.assistantSpeaking) this.clearRemoteAudioWatchdog();
        if (status === "cancelled" && this.userSpeaking) {
            this.debug("REALTIME_INTERRUPT", { cancel_acknowledged: true });
            return;
        }
        if (this.activeToolCallId) return;
        if (!this.responseHasAudio && !this.assistantSpeaking
                && !(this.renderer.kind === "external" && this.renderer.busy)) {
            this.owner.setState("listening", this.owner.muted ? "Muted" : "Listening");
        }
        this.debug("REALTIME_TURN", { turn_index: this.turnIndex, response_done_ms: Math.round(this.performance.now()) });
        if (status === "completed") {
            this.owner.countOperational?.("turn_completed_count");
            const text = this.pendingLearningTurns.get(this.activeUserInputTurnId);
            if (text) {
                this.pendingLearningTurns.delete(this.activeUserInputTurnId);
                this.api.learnRealtimeMemoryTurn?.(
                    this.owner.session.session_id, this.activeUserInputTurnId, text
                ).catch?.(() => {});
            }
        }
    }

    handleRealtimeInterruption({ playbackActive, generationActive }) {
        const interruptedId = this.activeResponseId;
        if (interruptedId) this.markResponseCancelled(interruptedId);
        this.interruptionStartedAt = this.performance.now();
        this.assistantOwnership += 1;
        if (generationActive && interruptedId) {
            this.sendInterruptionControl("response.cancel");
            this.interruptionDiagnostics.response_cancel_sent = true;
        }
        if (playbackActive) {
            if (this.renderer.kind === "native") this.sendInterruptionControl("output_audio_buffer.clear");
            this.assistantOutputClearCount += 1;
            this.interruptionDiagnostics.buffer_clear_sent = true;
            this.interruptionDiagnostics.output_clear_sent = true;
        }
        this.renderer.cancelResponse();
        // With WebRTC, OpenAI manages playback position and clear truncates the
        // server-managed buffer. conversation.item.truncate is for clients that
        // manage playback timing themselves, so no guessed timestamp is sent.
        this.activeResponseId = null;
        this.responseHasAudio = false;
        this.assistantSpeaking = false;
        this.mediaPlaying = false;
        this.clearRemoteAudioWatchdog();
        this.debug("REALTIME_INTERRUPT", {
            ...this.interruptionDiagnostics,
            assistant_item_id_safe: this.safeId(this.activeAssistantItemId),
            ui_exited_speaking: true
        });
        this.debug("REALTIME_BARGE_IN", {
            user_input_turn_id: this.activeUserInputTurnId,
            cancel_sent_ms: generationActive && interruptedId
                ? Math.round(this.performance.now()) : null,
            output_clear_sent_ms: playbackActive ? Math.round(this.performance.now()) : null
        });
    }

    handleAudioCleared() {
        if (this.interruptionStartedAt === null) return;
        const elapsed = Math.max(0, Math.round(this.performance.now() - this.interruptionStartedAt));
        this.interruptionDiagnostics.old_audio_stopped_ms = elapsed;
        this.interruptionDiagnostics.remote_audio_stopped = true;
        this.metric("interruption_audio_stop_ms", elapsed);
        this.debug("REALTIME_INTERRUPT", { ...this.interruptionDiagnostics, remote_audio_stopped: true });
        this.interruptionStartedAt = null;
        this.activeAssistantItemId = null;
    }

    playbackPositionMs() {
        const currentTime = Number(this.owner.elements.realtimeOutput?.currentTime);
        return Number.isFinite(currentTime) && currentTime >= 0 ? Math.round(currentTime * 1000) : null;
    }

    recordStaleEvent() {
        this.staleEventsSuppressed += 1;
        this.interruptionDiagnostics.stale_events_suppressed = this.staleEventsSuppressed;
        this.debug("REALTIME_INTERRUPT", { ...this.interruptionDiagnostics });
    }

    markResponseCancelled(responseId) {
        if (!responseId) return;
        this.cancelledResponseIds.add(responseId);
        while (this.cancelledResponseIds.size > 32) {
            this.cancelledResponseIds.delete(this.cancelledResponseIds.values().next().value);
        }
    }

    sendInterruptionControl(type) {
        this.controlEventSequence += 1;
        const eventId = `wb_interrupt_${this.controlEventSequence}`;
        this.interruptionControlEventIds.add(eventId);
        while (this.interruptionControlEventIds.size > 8) {
            this.interruptionControlEventIds.delete(this.interruptionControlEventIds.values().next().value);
        }
        this.send({ event_id: eventId, type });
    }

    async runTool(event) {
        if (!event.call_id || this.completedToolCalls.has(event.call_id)) return;
        const ownership = this.assistantOwnership;
        const parentResponseId = event.response_id || this.activeResponseId;
        this.activeToolCallId = event.call_id;
        this.lastToolEvent = `received:${event.name}`;
        this.clearResponseWatchdog();
        const startedAt = this.performance.now();
        this.debug("REALTIME_TOOL", { tool_name: event.name, call_id_safe: this.safeId(event.call_id), tool_call_received: true, execution_started: true });
        let args = {};
        try { args = JSON.parse(event.arguments || "{}"); } catch { /* backend validates */ }
        let result;
        let toolTimedOut = false;
        try {
            result = await this.withTimeout(
                this.api.executeRealtimeTool(this.owner.session.session_id, event.call_id, event.name, args),
                TOOL_STALL_MS
            );
            result = result.result;
        } catch (error) {
            toolTimedOut = error?.message === "realtime_tool_stalled";
            result = { status: error?.message === "realtime_tool_stalled" ? "error" : "error", uncertain: true };
        }
        this.owner.countOperational?.("memory_route_count");
        if (result?.status === "supported" || result?.status === "conflicted") {
            this.owner.countOperational?.("memory_supported_count");
        } else if (result?.status === "unsupported") {
            this.owner.countOperational?.("memory_unsupported_count");
        } else if (toolTimedOut) {
            this.owner.countOperational?.("memory_timeout_count");
        } else {
            this.owner.countOperational?.("memory_error_count");
        }
        const safeDiagnostics = result?.diagnostics || {};
        this.memoryDiagnostics = {
            last_tool: event.name === "get_legacy_identity_context" ? "identity" : "memory",
            status: result?.status === "conflicted" ? "conflict"
                : (["supported", "unsupported", "error"].includes(result?.status)
                    ? result.status : "error"),
            memories_used: Number.isInteger(result?.memory_count) ? result.memory_count : 0,
            identities_used: Number.isInteger(result?.identity_count) ? result.identity_count : 0,
            tool_latency_ms: Number.isInteger(safeDiagnostics.total_tool_ms)
                ? safeDiagnostics.total_tool_ms : null,
            followup_context: result?.followup_context === "active" ? "active" : "none"
        };
        this.owner.renderDebugPanel?.();
        if (this.completedToolCalls.has(event.call_id)) return;
        this.completedToolCalls.add(event.call_id);
        while (this.completedToolCalls.size > 128) {
            this.completedToolCalls.delete(this.completedToolCalls.values().next().value);
        }
        const obsolete = ownership !== this.assistantOwnership
            || (parentResponseId && this.cancelledResponseIds.has(parentResponseId));
        this.send({
            type: "conversation.item.create",
            item: {
                type: "function_call_output", call_id: event.call_id,
                output: JSON.stringify(obsolete ? { status: "cancelled" } : result)
            }
        });
        this.activeToolCallId = null;
        if (!obsolete) {
            this.waitingForToolContinuation = true;
            this.send({ type: "response.create", response: { output_modalities: [this.renderer.kind === "native" ? "audio" : "text"], tool_choice: "none" } });
            this.armResponseWatchdog();
        }
        const elapsed = Math.round(this.performance.now() - startedAt);
        this.metric("tool_call_complete_ms", elapsed);
        this.debug("REALTIME_TOOL", {
            tool_name: event.name, call_id_safe: this.safeId(event.call_id), execution_ms: elapsed,
            result_sent: true, continuation_requested: !obsolete
        });
        this.lastToolEvent = obsolete ? "result_discarded" : "audio_continuation_requested";
    }

    withTimeout(promise, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = this.clock.setTimeout(() => reject(new Error("realtime_tool_stalled")), timeoutMs);
            Promise.resolve(promise).then(
                (value) => { this.clock.clearTimeout(timer); resolve(value); },
                (error) => { this.clock.clearTimeout(timer); reject(error); }
            );
        });
    }

    armResponseWatchdog() {
        this.clearResponseWatchdog();
        const ownership = this.assistantOwnership;
        const startedAt = this.performance.now();
        this.responseWatchdog = this.clock.setTimeout(() => {
            if (ownership !== this.assistantOwnership || this.closed || this.userSpeaking) return;
            const elapsed = Math.round(this.performance.now() - startedAt);
            this.debug("REALTIME_STALL", {
                state: this.owner.state, active_response_id_safe: this.safeId(this.activeResponseId),
                active_tool_call: Boolean(this.activeToolCallId), elapsed_ms: elapsed, recovered: true
            });
            this.recoverResponse("realtime_response_stalled");
        }, RESPONSE_STALL_MS);
    }

    clearResponseWatchdog() {
        if (this.responseWatchdog !== null) this.clock.clearTimeout(this.responseWatchdog);
        this.responseWatchdog = null;
    }

    classifyProviderError(error = {}) {
        const code = String(error.code || error.type || "").toLowerCase();
        if (code.includes("quota") || code.includes("billing") || code.includes("insufficient")) return "provider_quota_exhausted";
        if (code.includes("rate") || code.includes("429")) return "provider_rate_limited";
        if (code.includes("expired")) return "session_expired";
        if (code.includes("timeout") || code.includes("server") || code.includes("overloaded")) return "provider_transient";
        return "unknown";
    }

    recoverResponse(reason) {
        const toolWasActive = Boolean(this.activeToolCallId);
        if (this.activeResponseId) this.markResponseCancelled(this.activeResponseId);
        this.send({ type: "response.cancel" });
        this.send({ type: "output_audio_buffer.clear" });
        this.assistantOwnership += 1;
        this.activeResponseId = null;
        this.activeToolCallId = null;
        this.waitingForToolContinuation = false;
        this.responseHasAudio = false;
        this.assistantSpeaking = false;
        this.mediaPlaying = false;
        this.renderer.cancelResponse();
        this.clearRemoteAudioWatchdog();
        this.clearResponseWatchdog();
        if (!this.closed) this.owner.setState("listening", "Something interrupted that response.");
        if (reason === "external_tts_failed") this.metric("external_tts_failure_count", 1);
        if (["realtime_response_stalled", "response_failed"].includes(reason)) this.metric("response_failure_count", 1);
        this.debug("REALTIME_RECOVERY", {
            reason, last_provider_event: this.lastResponseEvent,
            speech_started: this.turnEvidence.speech_started,
            speech_stopped: this.turnEvidence.speech_stopped,
            user_turn_committed: this.turnEvidence.user_turn_committed,
            response_created: this.turnEvidence.response_created,
            tool_active: toolWasActive,
            first_output_received: this.turnEvidence.first_output_received,
            elapsed_response_ms: this.speechEndedAt === null ? null
                : Math.max(0, Math.round(this.performance.now() - this.speechEndedAt)),
            peer_state: this.peer?.connectionState || "unknown",
            ice_state: this.peer?.iceConnectionState || "unknown",
            data_channel_state: this.channel?.readyState || "missing",
            provider_failure_category: this.lastProviderFailureCategory
        });
        this.metric(reason, 1);
        this.owner.countOperational?.("turn_recovered_count");
        if (reason === "external_tts_failed") this.owner.countOperational?.("external_tts_failure_count");
        if (["realtime_response_stalled", "response_failed"].includes(reason)) {
            this.owner.countOperational?.("response_failure_count");
        }
    }

    handleTransportFailure() {
        if (this.closed || !this.started) return;
        this.requestTransportRecovery("network_transient");
    }

    handleDataChannelFailure() {
        const error = new Error("Realtime data channel failed.");
        this.recordStartup("data_channel_failed", false, "data_channel_failed", null, error);
        this.rejectDataChannelReady?.(error);
        if (!this.started) {
            this.close();
            this.owner.fail("The realtime call data channel could not start. Please start a new call.");
            return;
        }
        this.requestTransportRecovery("data_channel_closed");
    }

    send(event) {
        if (this.channel?.readyState === "open") this.channel.send(JSON.stringify(event));
    }

    reportSpeechLatency(name, at) {
        if (this.speechEndedAt !== null) this.metric(name, Math.max(0, Math.round(at - this.speechEndedAt)));
    }

    metric(name, value) {
        document.dispatchEvent(new CustomEvent("waffleberry:realtimemetric", { detail: { name, value } }));
    }

    async requestRemotePlay(reason) {
        const audio = this.owner.elements.realtimeOutput;
        if (!audio || !this.remoteStream || !this.isCurrentCall() || !this.ownsMedia(audio)) return false;
        this.playStatus = "requested";
        this.lastMediaEvent = `play_requested:${reason}`;
        this.debugRemoteAudio({ play_requested: true });
        try {
            await Promise.resolve(audio.play());
            this.playStatus = "resolved";
            this.lastMediaEvent = "play_resolved";
            this.debugRemoteAudio({ play_resolved: true });
            return true;
        } catch (error) {
            this.playStatus = "rejected";
            this.lastMediaEvent = "play_rejected";
            this.lastAudioFailure = `play_rejected:${error?.name || "Error"}`;
            this.debugRemoteAudio({ play_rejected: true, dom_exception_name: error?.name || "Error" });
            return false;
        }
    }

    handleMediaPlaying(eventName) {
        if (!this.isCurrentCall() || !this.ownsMedia(this.owner.elements.realtimeOutput)) {
            return this.recordStaleRendererCallback();
        }
        this.lastMediaEvent = eventName;
        this.mediaPlaying = true;
        this.debugInputPath();
        this.debugRemoteAudio({ playing_event_received: eventName === "playing" });
        if (!this.responseHasAudio || this.userSpeaking || !this.remoteTrackHealthy()) return;
        this.confirmMediaPlayback();
    }

    confirmMediaPlayback() {
        this.clearRemoteAudioWatchdog();
        this.clearResponseWatchdog();
        this.assistantSpeaking = true;
        this.owner.setState("speaking", "Speaking");
        this.reportSpeechLatency("audible_playback_ms", this.performance.now());
        this.debug("REALTIME_BARGE_IN", {
            user_input_turn_id: this.activeUserInputTurnId,
            next_audio_started_ms: Math.round(this.performance.now())
        });
    }

    handleMediaPause() {
        if (!this.isCurrentCall() || !this.ownsMedia(this.owner.elements.realtimeOutput)) return;
        this.lastMediaEvent = "pause";
        this.mediaPlaying = false;
        this.assistantSpeaking = false;
        this.debugRemoteAudio({ audio_paused: true });
        this.clearRemoteAudioWatchdog();
        if (this.responseHasAudio && !this.userSpeaking) this.armRemoteAudioWatchdog(REMOTE_AUDIO_STALL_MS, "remote_audio_stalled");
    }

    handleMediaStall(eventName) {
        if (!this.isCurrentCall() || !this.ownsMedia(this.owner.elements.realtimeOutput)) return;
        this.lastMediaEvent = eventName;
        this.mediaPlaying = false;
        this.assistantSpeaking = false;
        if (!this.userSpeaking) this.owner.setState("processing", "Thinking");
        this.debugRemoteAudio({
            waiting_event_received: eventName === "waiting",
            stalled_event_received: eventName === "stalled"
        });
        this.clearRemoteAudioWatchdog();
        this.armRemoteAudioWatchdog(REMOTE_AUDIO_STALL_MS, "remote_audio_stalled");
    }

    handleMediaPlaybackComplete() {
        this.lastMediaEvent = "output_audio_buffer_stopped";
        this.responseHasAudio = false;
        this.assistantSpeaking = false;
        this.activeAssistantItemId = null;
        this.clearRemoteAudioWatchdog();
        if (!this.userSpeaking && !this.activeToolCallId) {
            this.owner.setState("listening", this.owner.muted ? "Muted" : "Listening");
        }
    }

    handleTrackMute() {
        if (!this.isCurrentCall()) return this.recordStaleRendererCallback();
        this.lastMediaEvent = "track_muted";
        this.mediaPlaying = false;
        this.assistantSpeaking = false;
        this.lastRecoveryReason = "remote_track_muted";
        if (!this.userSpeaking) this.owner.setState("processing", "Reconnecting…");
        if (this.remoteMuteTimer !== null) this.clock.clearTimeout(this.remoteMuteTimer);
        this.remoteMuteTimer = this.clock.setTimeout(() => {
            this.remoteMuteTimer = null;
            if (this.remoteTrack?.muted) this.requestTransportRecovery("remote_track_muted");
        }, TRACK_INTERRUPTION_GRACE_MS);
        this.debugRemoteAudio({ track_muted: true });
    }

    handleTrackUnmute() {
        if (!this.isCurrentCall()) return this.recordStaleRendererCallback();
        if (this.remoteMuteTimer !== null) this.clock.clearTimeout(this.remoteMuteTimer);
        this.remoteMuteTimer = null;
        this.lastMediaEvent = "track_unmuted";
        this.debugRemoteAudio({ track_muted: false });
        if (this.responseHasAudio) this.armRemoteAudioWatchdog(REMOTE_AUDIO_START_MS, "remote_audio_not_playing");
    }

    handleTrackEnded() {
        if (!this.isCurrentCall()) return this.recordStaleRendererCallback();
        this.lastMediaEvent = "track_ended";
        this.lastAudioFailure = "remote_track_ended";
        this.debugRemoteAudio({ ended_event_received: true });
        this.requestTransportRecovery("remote_track_ended");
    }

    handleMediaFailure(reason) {
        if (!this.isCurrentCall() || !this.ownsMedia(this.owner.elements.realtimeOutput)) return;
        this.lastMediaEvent = reason;
        this.lastAudioFailure = reason;
        this.debugRemoteAudio({ ended_event_received: reason === "media_ended" });
        this.recoverMediaFailure(reason);
    }

    remoteTrackHealthy() {
        return Boolean(this.remoteTrack && this.remoteTrack.kind === "audio"
            && this.remoteTrack.readyState !== "ended" && this.remoteTrack.enabled !== false
            && this.remoteTrack.muted !== true && this.owner.elements.realtimeOutput?.paused === false
            && this.owner.elements.realtimeOutput?.muted !== true
            && this.owner.elements.realtimeOutput?.volume > 0);
    }

    armRemoteAudioWatchdog(timeoutMs, reason) {
        if (this.assistantSpeaking || this.userSpeaking || this.mediaWatchdog !== null) return;
        this.mediaWatchdog = this.clock.setTimeout(() => {
            this.mediaWatchdog = null;
            if (!this.responseHasAudio || this.userSpeaking || this.assistantSpeaking) return;
            if (!this.mediaRepairAttempted) {
                this.mediaRepairAttempted = true;
                this.repairRemoteAudio(reason);
                return;
            }
            this.recoverMediaFailure(reason);
        }, timeoutMs);
    }

    clearRemoteAudioWatchdog() {
        if (this.mediaWatchdog !== null) this.clock.clearTimeout(this.mediaWatchdog);
        this.mediaWatchdog = null;
    }

    async repairRemoteAudio(reason) {
        const audio = this.owner.elements.realtimeOutput;
        this.lastAudioFailure = reason;
        if (audio.srcObject !== this.remoteStream) audio.srcObject = this.remoteStream;
        audio.autoplay = true;
        audio.playsInline = true;
        audio.muted = !this.owner.speakerEnabled;
        audio.volume = 1;
        const played = await this.requestRemotePlay("bounded_repair");
        if (!played) return this.recoverMediaFailure("remote_audio_play_rejected");
        this.armRemoteAudioWatchdog(REMOTE_AUDIO_START_MS, reason);
    }

    recoverMediaFailure(reason) {
        this.lastAudioFailure = reason;
        this.responseHasAudio = false;
        this.assistantSpeaking = false;
        this.mediaPlaying = false;
        this.clearRemoteAudioWatchdog();
        this.clearResponseWatchdog();
        if (!this.closed) this.owner.setState("listening", "I couldn’t play that response. Please try again.");
        this.metric(reason, 1);
    }

    debugRemoteAudio(extra = {}) {
        this.debug("REALTIME_REMOTE_AUDIO", {
            track_received: Boolean(this.remoteTrack),
            track_id_safe: this.safeId(this.remoteTrack?.id),
            track_ready_state: this.remoteTrack?.readyState || "missing",
            track_muted: this.remoteTrack?.muted ?? null,
            track_enabled: this.remoteTrack?.enabled ?? null,
            streams_count: this.remoteStream ? 1 : 0,
            audio_srcobject_attached: this.owner.elements.realtimeOutput?.srcObject === this.remoteStream,
            audio_paused: this.owner.elements.realtimeOutput?.paused ?? null,
            audio_muted: this.owner.elements.realtimeOutput?.muted ?? null,
            audio_volume: this.owner.elements.realtimeOutput?.volume ?? null,
            ...extra
        });
        this.owner.renderDebugPanel?.();
    }

    diagnostics() {
        return {
            engine: "realtime", renderer: this.renderer.kind,
            voice: this.owner.session?.effective_voice || "unknown",
            remote_track: this.remoteTrack?.readyState || "missing",
            remote_track_muted: this.remoteTrack?.muted ?? null,
            assistant_rms: Number(this.assistantRms.toFixed(6)),
            assistant_peak: Number(this.assistantPeak.toFixed(6)),
            audio_element: this.assistantSpeaking ? "playing" : "paused",
            play_status: this.playStatus,
            active_response_id_safe: this.safeId(this.activeResponseId),
            last_response_event: this.lastResponseEvent,
            last_media_event: this.lastMediaEvent,
            last_tool_event: this.lastToolEvent,
            last_audio_failure: this.lastAudioFailure,
            connection_state: this.peer?.connectionState || "unknown",
            ice_state: this.peer?.iceConnectionState || "unknown",
            signaling_state: this.peer?.signalingState || "unknown",
            data_channel_state: this.channel?.readyState || "missing",
            mic_track_state: this.micTrack?.readyState || "missing",
            reconnect_count: this.reconnectCount,
            last_recovery_reason: this.lastRecoveryReason,
            last_provider_failure_category: this.lastProviderFailureCategory,
            session_age_ms: Math.max(0, Math.round(this.performance.now() - this.sessionStartedAt)),
            stale_event_count: this.staleEventsSuppressed,
            external_queue_depth: this.renderer.kind === "external"
                ? this.renderer.synthesisQueue.length + this.renderer.readyQueue.length : 0,
            external_generation: this.renderer.kind === "external" ? this.renderer.generation : null,
            startup_stage: this.startupStage,
            realtime_input: this.inputDiagnostics(),
            observed_event_types: [...this.observedEventTypes].sort(),
            interruption: { ...this.interruptionDiagnostics },
            inbound_audio_stats: this.lastInboundAudioStats,
            memory: { ...this.memoryDiagnostics }
        };
    }

    recordEventType(type) {
        if (!this.owner.debugLiveCall || typeof type !== "string") return;
        this.observedEventTypes.add(type);
        while (this.observedEventTypes.size > 64) {
            this.observedEventTypes.delete(this.observedEventTypes.values().next().value);
        }
        this.debug("REALTIME_EVENT_TYPE", { type });
        this.owner.renderDebugPanel?.();
    }

    inputDiagnostics() {
        const track = this.micTrack;
        const senderTrack = this.micSender?.track || null;
        const settings = track?.getSettings?.() || {};
        return {
            mic_track_ready_state: track?.readyState || "missing",
            mic_track_enabled: track?.enabled ?? null,
            mic_track_muted: track?.muted ?? null,
            mic_track_label_present: Boolean(track?.label),
            mic_stream_active: this.owner.stream?.active ?? null,
            sender_exists: Boolean(this.micSender),
            sender_track_matches_mic: Boolean(track && senderTrack === track),
            sender_track_enabled: senderTrack?.enabled ?? null,
            sender_track_ready_state: senderTrack?.readyState || "missing",
            sender_track_id_safe: this.safeId(senderTrack?.id),
            transceiver_direction: this.micTransceiver?.direction || "unknown",
            transceiver_current_direction: this.micTransceiver?.currentDirection || "unknown",
            peer_connection_state: this.peer?.connectionState || "unknown",
            ice_connection_state: this.peer?.iceConnectionState || "unknown",
            echo_cancellation: settings.echoCancellation ?? null,
            noise_suppression: settings.noiseSuppression ?? null,
            auto_gain_control: settings.autoGainControl ?? null,
            echo_cancellation_supported: this.owner.mediaDevices?.getSupportedConstraints?.()
                ?.echoCancellation ?? null,
            noise_suppression_supported: this.owner.mediaDevices?.getSupportedConstraints?.()
                ?.noiseSuppression ?? null,
            channel_count: settings.channelCount ?? null,
            sample_rate: settings.sampleRate ?? null,
            mic_rms: Number(this.micRms.toFixed(6)),
            mic_peak: Number(this.micPeak.toFixed(6)),
            speech_started_total: this.speechStartedTotal,
            speech_started_while_assistant_idle: this.speechStartedWhileAssistantIdle,
            speech_started_while_assistant_speaking: this.speechStartedWhileAssistantSpeaking,
            speech_stopped_total: this.speechStoppedTotal,
            user_input_turn_id: this.activeUserInputTurnId,
            speech_started_local_mic_rms: Number(this.speechStartedLocalMicRms.toFixed(6)),
            speech_started_local_mic_peak: Number(this.speechStartedLocalMicPeak.toFixed(6)),
            assistant_output_clear_count: this.assistantOutputClearCount,
            false_interrupt_candidate_count: this.falseInterruptCandidateCount,
            last_speech_started_monotonic_ms: this.lastSpeechStartedMonotonicMs
        };
    }

    debugInputPath() {
        if (!this.owner.debugLiveCall) return;
        this.debug("REALTIME_INPUT", this.inputDiagnostics());
        this.owner.renderDebugPanel?.();
    }

    startMicDiagnostic() {
        if (!this.AudioContextClass || !this.micTrack) return;
        try {
            this.micDiagnosticTrack = this.micTrack.clone?.() || this.micTrack;
            this.micDiagnosticContext = this.owner.getAudioContext?.() || new this.AudioContextClass();
            this.micDiagnosticOwnsContext = this.micDiagnosticContext !== this.owner.audioContext;
            this.micDiagnosticContext.resume?.().catch?.(() => {});
            const stream = new MediaStream([this.micDiagnosticTrack]);
            const source = this.micDiagnosticContext.createMediaStreamSource(stream);
            this.micDiagnosticAnalyser = this.micDiagnosticContext.createAnalyser();
            this.micDiagnosticAnalyser.fftSize = 512;
            source.connect(this.micDiagnosticAnalyser);
            const samples = new Uint8Array(this.micDiagnosticAnalyser.fftSize);
            const sample = () => {
                if (this.closed || !this.micDiagnosticAnalyser) return;
                this.micDiagnosticAnalyser.getByteTimeDomainData(samples);
                let sum = 0;
                let peak = 0;
                for (const value of samples) {
                    const normalized = (value - 128) / 128;
                    sum += normalized * normalized;
                    peak = Math.max(peak, Math.abs(normalized));
                }
                this.micRms = Math.sqrt(sum / samples.length);
                this.micPeak = peak;
                if (this.bargeInCandidate) {
                    this.bargeInCandidate.micRms = Math.max(
                        this.bargeInCandidate.micRms, this.micRms
                    );
                    this.bargeInCandidate.micPeak = Math.max(
                        this.bargeInCandidate.micPeak, this.micPeak
                    );
                }
                this.debugInputPath();
                this.micDiagnosticTimer = this.clock.setTimeout(sample, 25);
            };
            sample();
        } catch {
            if (this.micDiagnosticTrack !== this.micTrack) this.micDiagnosticTrack?.stop?.();
            this.micDiagnosticTrack = null;
        }
    }

    safeId(value) {
        return typeof value === "string" && value ? value.slice(-8) : "none";
    }

    debug(event, detail) {
        if (!this.owner.debugLiveCall) return;
        console.debug(event, {
            session_id: this.owner.session?.session_id,
            logical_call_generation: this.logicalCallGeneration,
            media_owner_generation: mediaOwnerGenerations.get(this.owner.elements.realtimeOutput) || null,
            previous_renderer: this.previousRendererKind,
            current_renderer: this.renderer.kind,
            effective_voice: this.owner.session?.effective_voice || "unknown",
            output_modality: this.renderer.kind === "native" ? "audio" : "text",
            external_renderer_closed: this.renderer.kind === "external" ? this.renderer.closed : null,
            stale_renderer_callback_count: this.staleRendererCallbackCount,
            ...detail
        });
    }

    setSpeaker(enabled) {
        if (this.owner.elements.realtimeOutput) this.owner.elements.realtimeOutput.muted = !enabled;
        if (this.renderer.kind === "external" && this.renderer.audio) this.renderer.audio.muted = !enabled;
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        this.renderer.close();
        this.clearResponseWatchdog();
        this.clearRemoteAudioWatchdog();
        for (const timer of [this.iceDisconnectTimer, this.remoteMuteTimer, this.micMuteTimer]) {
            if (timer !== null) this.clock.clearTimeout(timer);
        }
        this.iceDisconnectTimer = null;
        this.remoteMuteTimer = null;
        this.micMuteTimer = null;
        if (this.micDiagnosticTimer !== null) this.clock.clearTimeout(this.micDiagnosticTimer);
        if (this.remoteDiagnosticTimer !== null) this.clock.clearTimeout(this.remoteDiagnosticTimer);
        this.micDiagnosticTimer = null;
        this.remoteDiagnosticTimer = null;
        if (this.micDiagnosticTrack !== this.micTrack) this.micDiagnosticTrack?.stop?.();
        if (this.micDiagnosticOwnsContext) this.micDiagnosticContext?.close?.();
        if (this.remoteDiagnosticTrack !== this.remoteTrack) this.remoteDiagnosticTrack?.stop?.();
        this.remoteDiagnosticContext?.close?.();
        this.micDiagnosticTrack = null;
        this.micDiagnosticContext = null;
        this.micDiagnosticOwnsContext = false;
        this.micDiagnosticAnalyser = null;
        this.remoteDiagnosticTrack = null;
        this.remoteDiagnosticContext = null;
        this.remoteDiagnosticAnalyser = null;
        this.peer?.removeEventListener?.("connectionstatechange", this.boundPeerStateChange);
        this.peer?.removeEventListener?.("iceconnectionstatechange", this.boundIceStateChange);
        this.micTrack?.removeEventListener?.("mute", this.boundMicMute);
        this.micTrack?.removeEventListener?.("unmute", this.boundMicUnmute);
        this.micTrack?.removeEventListener?.("ended", this.boundMicEnded);
        this.remoteTrack?.removeEventListener?.("mute", this.boundRemoteTrackMute);
        this.remoteTrack?.removeEventListener?.("unmute", this.boundRemoteTrackUnmute);
        this.remoteTrack?.removeEventListener?.("ended", this.boundRemoteTrackEnded);
        this.metric("call_duration_ms", Math.max(0, Math.round(this.performance.now() - this.sessionStartedAt)));
        try { this.channel?.close(); } catch { /* already closed */ }
        try { this.peer?.close(); } catch { /* already closed */ }
        const audio = this.owner.elements.realtimeOutput;
        if (audio) {
            audio.removeEventListener?.("playing", this.boundMediaPlaying);
            audio.removeEventListener?.("timeupdate", this.boundMediaTimeUpdate);
            audio.removeEventListener?.("pause", this.boundMediaPause);
            audio.removeEventListener?.("waiting", this.boundMediaWaiting);
            audio.removeEventListener?.("stalled", this.boundMediaStalled);
            audio.removeEventListener?.("error", this.boundMediaError);
            audio.removeEventListener?.("ended", this.boundMediaEnded);
        }
        if (this.ownsMedia(audio)) {
            audio.pause?.();
            audio.srcObject = null;
            this.releaseMedia(audio);
        }
        if (activeLogicalCallGeneration === this.logicalCallGeneration) activeLogicalCallGeneration = 0;
        this.peer = null;
        this.channel = null;
        this.remoteStream = null;
        this.remoteTrack = null;
    }
}

window.WaffleBerryRealtimeLiveCall = Object.freeze({
    RESPONSE_STALL_MS, TOOL_STALL_MS, REMOTE_AUDIO_START_MS,
    REMOTE_AUDIO_STALL_MS, ExternalPhraseAssembler,
    RealtimeNativeRenderer, ExternalNonStreamingRenderer,
    RealtimeLiveCallController
});
})();
