"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const chat = read("chat.html");
const chatScript = read("js/chat.js");
const call = read("live-call.html");
const script = read("js/live-call.js");
const api = read("js/api.js");
const styles = read("css/style.css");

test("Live Call entry is separate and existing chat controls remain", () => {
    assert.match(chat, /id="liveCallButton"[\s\S]*Live Call/);
    assert.match(chat, /aria-label="Start a Live Call"/);
    assert.match(chat, /data-open-voice-settings/);
    assert.match(chat, /id="voiceRecordButton"/);
    assert.match(chatScript, /Play Berry voice/);
});

test("selected Legacy and conversation are handed from Chat to Live Call after hydration", () => {
    assert.match(chatScript, /function updateLiveCallLink\(\)/);
    assert.match(chatScript, /parameters\.set\("legacyId", selectedLegacy\.id\)/);
    assert.match(chatScript, /parameters\.set\("conversationId", String\(state\.activeConversationId\)\)/);
    assert.match(chatScript, /selectedLegacy = await window\.WaffleBerryLegacyState[\s\S]*\.ensurePersisted\(selectedLegacy\.id\)[\s\S]*updateLiveCallLink\(\)/);
    assert.match(chatScript, /state\.activeConversationId =[\s\S]*conversationId;[\s\S]*updateLiveCallLink\(\)/);
    assert.match(chatScript, /liveCallButtons\.forEach\([\s\S]*button\.href = href/);
    assert.match(chatScript, /liveCallContextReady = Boolean\(selectedLegacy\?\.backendLegacyId\);[\s\S]*updateLiveCallLink\(\)/);
});

test("Live Call resolves authoritative Aaji context before creating its session", () => {
    assert.match(script, /async function resolveLiveCallLegacy\(\)/);
    assert.match(script, /get\("legacyId"\)/);
    assert.match(script, /hydratePersisted\("active"\)/);
    assert.match(script, /select\(requestedLegacyId\)/);
    assert.match(script, /if \(!legacy\?\.backendLegacyId \|\| legacy\.status === "archived"\) return null/);
    assert.match(script, /const legacy = await resolveLiveCallLegacy\(\)/);
    assert.match(script, /element\.textContent = legacy\.displayName/);
    assert.match(script, /this\.elements\.relationship\.textContent = this\.legacy\.relationship/);
    assert.match(script, /createLiveCallSession\([\s\S]*this\.legacy\.backendLegacyId/);
    assert.match(script, /this\.api\.createLiveCallSession\(\s*this\.legacy\.backendLegacyId\s*\)/);
});

test("invalid context fails safely and return navigation retains the same scope", () => {
    assert.match(script, /if \(!requestedLegacyId\) return null/);
    assert.match(script, /Object\.prototype\.hasOwnProperty\.call\(options, "legacy"\)/);
    assert.match(script, /if \(!this\.legacy\?\.backendLegacyId\)/);
    assert.match(script, /This Companion is not available for Live Call/);
    assert.match(script, /parameters\.set\("conversationId", String\(conversationId\)\)/);
    assert.match(script, /link\.href = `chat\.html\$\{query\}`/);
    assert.match(chatScript, /get\("conversationId"\)/);
});

test("dedicated call screen is branded and accessible", () => {
    assert.match(call, /Waffle Berry/);
    assert.match(call, /data-companion-name/);
    assert.match(call, /id="liveCallRelationship"/);
    assert.match(call, /role="status" aria-live="assertive"/);
    assert.match(call, /role="timer"/);
    assert.match(call, /aria-label="Mute microphone" aria-pressed="false"/);
    assert.doesNotMatch(call, /id="liveCallTalkButton"|>Speak<|>Finish</);
    assert.match(call, /id="liveCallSpeakerButton"[\s\S]*aria-label="Turn speaker off"[\s\S]*aria-pressed="true"/);
    assert.match(call, /aria-label="End call"/);
    assert.match(call, /Return to chat/);
});

test("premium call stage keeps Legacy identity and state visuals authoritative", () => {
    assert.match(call, /class="live-call-ambient"/);
    assert.match(call, /waffle-berry-mascot\.png/);
    assert.match(call, /data-companion-name/);
    assert.match(call, /id="liveCallRelationship"/);
    assert.match(styles, /body\[data-call-state="listening"\][\s\S]*liveCallBreathe/);
    assert.match(styles, /body\[data-call-state="processing"\][\s\S]*liveCallThink/);
    assert.match(styles, /body\[data-call-state="speaking"\][\s\S]*liveCallVoice/);
    assert.match(styles, /data-microphone-muted="true"/);
    assert.match(styles, /data-call-state="ended"/);
});

test("speaker toggle controls current and future Berry playback only", () => {
    assert.match(script, /toggleSpeaker\(\)/);
    assert.match(script, /this\.playback\.muted = !this\.speakerEnabled/);
    assert.match(script, /Turn speaker off/);
    assert.match(script, /Turn speaker on/);
    assert.doesNotMatch(script, /setSinkId|audiooutput|Bluetooth/);
});

test("automatic speech detection provides immediate idempotent barge-in", () => {
    assert.match(script, /\["listening", "speaking", "user_speaking"\]\.includes\(this\.state\)/);
    assert.match(script, /if \(this\.state === "speaking"\) this\.interruptPlayback\(\)/);
    assert.match(script, /this\.playback\.pause\(\)/);
    assert.match(script, /this\.playback\.src = ""/);
    assert.match(script, /sendEvent\("interrupt", \{ turn_id: interruptedTurnId \}\)/);
    assert.match(script, /VAD_BARGE_IN_THRESHOLD = 0\.09/);
    assert.match(script, /this\.activeTurnId = null/);
    assert.match(script, /this\.playbackUrl === url/);
});

test("barge-in preserves mute, speaker, cleanup and normal turn pipeline", () => {
    assert.match(script, /this\.state === "speaking"\) this\.interruptPlayback/);
    assert.match(script, /this\.recorder \|\| this\.muted \|\| this\.vadSuspended/);
    assert.match(script, /this\.playback\.muted = !this\.speakerEnabled/);
    assert.match(script, /stopTurnMedia\(\)/);
    assert.match(script, /sendEvent\("audio\.commit"/);
});

test("compact Live Call settings reuse voice preference and safe session options", () => {
    assert.match(call, /id="liveCallSettingsButton"[\s\S]*aria-label="Live Call settings"/);
    assert.match(call, /id="liveCallSettingsDialog"[\s\S]*aria-modal="true"/);
    assert.match(call, /Natural[\s\S]*Gentle[\s\S]*Expressive/);
    assert.match(call, /Short[\s\S]*Balanced[\s\S]*Detailed/);
    assert.match(script, /apiRequest\("\/user\/voice-preference"/);
    assert.match(script, /Voice updated\. It will be used on your next call/);
    assert.match(script, /sendEvent\("session\.settings"/);
    assert.match(script, /natural", "gentle", "expressive/);
    assert.match(script, /short", "balanced", "detailed/);
    assert.doesNotMatch(call, /OpenAI|Sarvam|provider|model|temperature/i);
});

test("settings dialog preserves call lifecycle and accessibility", () => {
    assert.match(script, /showModal\(\)/);
    assert.match(script, /trapSettingsFocus\(event\)/);
    assert.match(script, /event\.key !== "Tab"/);
    assert.match(script, /event\.preventDefault\(\); controller\.closeSettings\(\)/);
    assert.match(script, /settingsButton\.focus\(\)/);
    assert.match(script, /closeSettings\(true\)/);
    assert.match(script, /Your call can continue/);
    assert.match(styles, /\.live-call-settings-dialog/);
    assert.match(styles, /body\.dark-mode \.live-call-settings-panel/);
    assert.match(styles, /max-height: 86dvh/);
});

test("turn-based audio loop reuses MediaRecorder and the versioned socket", () => {
    assert.match(script, /new this\.MediaRecorderClass\(this\.stream/);
    assert.match(script, /sendEvent\("audio\.chunk"/);
    assert.match(script, /sendEvent\("audio\.commit"/);
    assert.match(script, /setState\("processing", "Thinking"/);
    assert.match(script, /setState\("speaking", "Speaking"/);
    assert.match(script, /addEventListener\("ended", finish/);
    assert.match(script, /setState\("listening"/);
});

test("turn concurrency, stale events, mute and end cleanup are guarded", () => {
    assert.match(script, /this\.transportState !== "connected" \|\| !this\.stream/);
    assert.match(script, /if \(message\.turn_id !== this\.activeTurnId\) return/);
    assert.match(script, /this\.muted \|\| this\.vadSuspended/);
    assert.match(script, /stopTurnMedia\(\)/);
    assert.match(script, /this\.playback\.pause\(\)/);
});

test("emotional delivery remains invisible and does not alter call UI behavior", () => {
    assert.doesNotMatch(call, /Emotion detected|Comfort mode|mood/i);
    assert.doesNotMatch(script, /Emotion detected|Comfort mode|sentiment|mood history/i);
    assert.match(script, /setState\("speaking", "Speaking"/);
    assert.match(script, /setState\("listening"/);
    assert.match(script, /this\.playback\.pause\(\)/);
    assert.match(chatScript, /Play Berry voice/);
});

test("explicit state machine and actual-call-only timer are established", () => {
    for (const state of [
        "idle", "connecting", "connected", "greeting", "listening", "user_speaking", "processing",
        "speaking", "ending", "ended", "error"
    ]) assert.match(script, new RegExp(`"${state}"`));
    assert.match(call, /id="liveCallTimer"[\s\S]*>00:00</);
    assert.match(script, /startTimer\(\)[\s\S]*if \(this\.connectedAt\) return[\s\S]*this\.connectedAt = Date\.now\(\)[\s\S]*if \(this\.timerId === null\)[\s\S]*setInterval/);
    assert.match(script, /stopTimer\(\)[\s\S]*clearInterval/);
});

test("transport resilience is bounded and preserves the logical call", () => {
    assert.match(script, /TRANSPORT_STATES[\s\S]*"reconnecting"[\s\S]*"offline"[\s\S]*"failed"/);
    assert.match(script, /RECONNECT_DELAYS_MS = Object\.freeze\(\[500, 1000, 2000, 4000\]\)/);
    assert.match(script, /base \* \(0\.85 \+ this\.random\(\) \* 0\.3\)/);
    assert.match(script, /reconnectAttempt >= RECONNECT_DELAYS_MS\.length/);
    assert.match(script, /startTimer\(\)[\s\S]*if \(this\.connectedAt\) return/);
    assert.match(script, /this\.muted \? "Muted" : "Listening/);
    assert.match(script, /this\.playback\.muted = !this\.speakerEnabled/);
    assert.match(script, /this\.session\.conversation_style/);
});

test("heartbeat, offline recovery and intentional end have safe lifecycle guards", () => {
    assert.match(script, /HEARTBEAT_INTERVAL_MS = 20000/);
    assert.match(script, /HEARTBEAT_TIMEOUT_MS = 8000/);
    assert.match(script, /sendEvent\("heartbeat\.ping", \{ heartbeat_id: heartbeatId \}\)/);
    assert.match(script, /message\.type === "heartbeat\.pong"/);
    assert.match(script, /window\.addEventListener\("offline"/);
    assert.match(script, /window\.addEventListener\("online"/);
    assert.match(script, /this\.intentionalEnd = true[\s\S]*this\.clearReconnectTimer\(\)/);
    assert.match(script, /event\?\.code === 4401/);
});

test("turn recovery prevents duplicates and bounds disconnected recording", () => {
    assert.match(script, /message\.last_completed_turn_id === this\.activeTurnId/);
    assert.match(script, /message\.active_turn_id/);
    assert.match(script, /if \(message\.turn_id !== this\.activeTurnId\) return/);
    assert.match(script, /RECORDING_DISCONNECT_GRACE_MS = 5000/);
    assert.match(script, /this\.discardRecording = true[\s\S]*this\.recorder\.stop\(\)/);
    assert.match(script, /this\.transportState !== "connected"/);
    assert.match(script, /this\.playbackUrl === url/);
});

test("network status is user-facing and accessibility announcements remain active", () => {
    assert.match(script, /"Reconnecting"/);
    assert.match(script, /"Connection unstable"/);
    assert.match(script, /"Connection lost…"/);
    assert.match(script, /"The call connection was lost\. Please start a new call\."/);
    assert.match(call, /role="status" aria-live="assertive"/);
    assert.doesNotMatch(script, /Socket retry|HTTP 502|WebSocket disconnected/);
});

test("microphone permission, mute and cleanup are safe", () => {
    assert.match(script, /getUserMedia\(\{[\s\S]*audio:[\s\S]*echoCancellation: true[\s\S]*noiseSuppression: true/);
    assert.match(script, /NotAllowedError[\s\S]*Microphone access is needed for Live Call/);
    assert.match(script, /getAudioTracks\(\)\.forEach[\s\S]*track\.enabled = !this\.muted/);
    assert.match(script, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
    assert.match(script, /pagehide[\s\S]*cleanupForNavigation/);
    assert.match(script, /waffleberry:signout[\s\S]*cleanupForNavigation/);
});

test("end call is idempotent and cleans transport plus backend session", () => {
    assert.match(script, /if \(this\.endPromise\) return this\.endPromise/);
    assert.match(script, /setState\("ending"/);
    assert.match(script, /sendEvent\("session\.end"\)/);
    assert.match(script, /socket\?\.close\(\)/);
    assert.match(script, /endLiveCallSession\(this\.session\.session_id\)/);
    assert.match(script, /finishEnded\(\)/);
    assert.match(script, /stopVad\(\)/);
    assert.match(script, /this\.navigate\(returnUrl\)/);
});

test("browser VAD ignores noise and uses conservative centralized turn boundaries", () => {
    assert.match(script, /VAD_SPEECH_THRESHOLD = 0\.035/);
    assert.match(script, /VAD_SPEECH_START_MS = 150/);
    assert.match(script, /VAD_SILENCE_COMMIT_MS = 850/);
    assert.match(script, /VAD_MINIMUM_SPEECH_MS = 300/);
    assert.match(script, /VAD_MAXIMUM_TURN_MS = 60000/);
    assert.match(script, /rms >= threshold/);
    assert.match(script, /now - this\.lastSpeechAt >= VAD_SILENCE_COMMIT_MS/);
    assert.match(script, /this\.lastSpeechAt - this\.speechStartedAt < VAD_MINIMUM_SPEECH_MS/);
    assert.match(script, /this\.finishAutomaticTurn\(Date\.now\(\), true\)/);
});

test("fast response pipeline reports VAD latency and plays ordered phrases immediately", () => {
    assert.match(script, /vad_silence_ms: this\.pendingVadSilenceMs/);
    assert.match(script, /message\.chunk_index \?\? 0/);
    assert.match(script, /this\.receivedAudioChunks\.has\(key\)/);
    assert.match(script, /this\.responseAudio\.push[\s\S]*this\.playResponse\(message\.turn_id\)/);
    assert.match(script, /addEventListener\("playing"[\s\S]*sendEvent\("latency\.playback_started", \{ turn_id: turnId \}\)/);
    assert.match(script, /if \(this\.responseAudio\.length\) return this\.playResponse\(turnId\)/);
    assert.match(script, /if \(this\.responseCompleted\) this\.finishResponse\(turnId\)/);
});

test("microphone chunks stream during speech and VAD commit remains authoritative", () => {
    assert.match(script, /dataavailable[\s\S]*sendLiveAudioChunk\(event\.data, turnId, start, mimeType\)/);
    assert.match(script, /this\.recorder\.start\(250\)/);
    assert.match(script, /sendLiveAudioChunk\(blob, turnId, start, fallbackMime\)[\s\S]*chunkSize = 48 \* 1024[\s\S]*sendEvent\("audio\.chunk"/);
    assert.match(script, /commitRecording\(fallbackMime\)[\s\S]*await this\.audioChunkSendChain[\s\S]*sendEvent\("audio\.commit"/);
    assert.match(script, /vad_silence_ms: this\.pendingVadSilenceMs/);
    assert.match(script, /createScriptProcessor\(4096, 1, 1\)/);
    assert.match(script, /input\.length \* 24000 \/ inputRate/);
    assert.match(script, /sendEvent\("transcription\.audio", \{ turn_id: turnId/);
    assert.match(script, /stopStreamingTranscription\(\)[\s\S]*onaudioprocess = null/);
});

test("realtime STT commit precedes fallback MediaRecorder finalization", () => {
    const finish = script.slice(script.indexOf("finishAutomaticTurn("), script.indexOf("stopVad()"));
    assert.match(finish, /sendEvent\("transcription\.commit"/);
    assert.match(finish, /recorder\.requestData\?\.\(\)/);
    assert.ok(finish.indexOf('sendEvent("transcription.commit"') < finish.indexOf("this.recorder.stop()"));
    assert.match(script, /commitRecording\(fallbackMime\)[\s\S]*await this\.audioChunkSendChain[\s\S]*sendEvent\("audio\.commit"/);
});

test("PCM diagnostics prove chunks leave the browser before commit", () => {
    assert.match(script, /pcm_capture_started: false/);
    assert.match(script, /pcm_input_sample_rate: null/);
    assert.match(script, /pcm_output_sample_rate: 24000/);
    assert.match(script, /const sent = this\.sendEvent\("transcription\.audio"/);
    assert.match(script, /timing\.pcm_chunks_sent \+= 1/);
    assert.match(script, /timing\.pcm_bytes_sent \+= bytes\.byteLength/);
    assert.match(script, /processor\.onaudioprocess =[\s\S]*sendEvent\("transcription\.audio"/);
    assert.match(script, /finishAutomaticTurn[\s\S]*stopStreamingTranscription\(\)[\s\S]*sendEvent\("transcription\.commit"/);
});

test("MediaRecorder finalization stages are diagnostic and do not redefine speech end", () => {
    assert.match(script, /mediarecorder_stop_called/);
    assert.match(script, /mediarecorder_final_dataavailable/);
    assert.match(script, /fallback_blob_finalized/);
    assert.match(script, /silence_to_recorder_stop_ms: elapsed\("vad_silence_commit", "mediarecorder_stop_called"\)/);
    assert.match(script, /recorder_stop_to_final_data_ms: elapsed\("mediarecorder_stop_called", "mediarecorder_final_dataavailable"\)/);
});

test("VAD refreshes the authoritative speech-end mark through the final voiced sample", () => {
    assert.match(script, /this\.lastVoiceDetectedAt = this\.performance\.now\(\)[\s\S]*this\.recorder\?\.state === "recording"[\s\S]*timing\.marks\.vad_last_voice_detected = this\.lastVoiceDetectedAt/);
    const finish = script.slice(
        script.indexOf("    finishAutomaticTurn(now = Date.now(), maximumReached = false)"),
        script.indexOf("stopVad()")
    );
    assert.match(finish, /sendEvent\("transcription.commit"/);
    assert.doesNotMatch(finish, /await|dataavailable/);
    assert.ok(finish.indexOf('sendEvent("transcription.commit"') < finish.indexOf("this.recorder.stop()"));
});

test("partial transcripts stay invisible and only final transcript advances truth", () => {
    assert.doesNotMatch(script, /message\.type === "transcription\.partial"/);
    assert.match(script, /message\.type === "transcription\.final"[\s\S]*setState\("processing", "Thinking"\)/);
    assert.doesNotMatch(call, /partial transcript|transcription\.partial/i);
});

test("streaming PCM starts from the first playable chunk in strict order", () => {
    assert.match(script, /message\.streaming && message\.mime_type === "audio\/L16"/);
    assert.match(script, /getInt16\(index \* 2, true\) \/ 32768/);
    assert.match(script, /Math\.max\(this\.audioContext\.currentTime \+ 0\.02, this\.pcmNextStart\)/);
    assert.match(script, /this\.pcmNextStart = startAt \+ buffer\.duration/);
    assert.match(script, /source\.start\(startAt\)/);
    assert.match(script, /latency\.frontend_first_playable_chunk/);
});

test("client perceived latency begins at last detected voice rather than commit", () => {
    assert.match(script, /this\.lastVoiceDetectedAt = this\.performance\.now\(\)/);
    assert.match(script, /vad_last_voice_detected: this\.lastVoiceDetectedAt/);
    assert.match(script, /speech_end_to_realtime_commit_ms: elapsed\("vad_last_voice_detected", "realtime_commit_sent"\)/);
    assert.match(script, /speech_end_to_fallback_commit_ms: elapsed\("vad_last_voice_detected", "fallback_commit_sent"\)/);
    assert.match(script, /client_end_of_speech_to_audible_ms: elapsed\("vad_last_voice_detected", "first_audible_playback"\)/);
});

test("realtime and fallback commits have distinct clocks and early events stay active", () => {
    assert.match(script, /this\.activeTurnId = this\.recordingTurnId;[\s\S]*realtime_commit_sent[\s\S]*sendEvent\("transcription\.commit"/);
    assert.match(script, /fallback_commit_sent[\s\S]*sendEvent\("audio\.commit"/);
    assert.match(script, /latency\.commit_received[\s\S]*realtime_commit_received_ack[\s\S]*fallback_commit_received_ack/);
    assert.doesNotMatch(script, /audio_commit_sent/);
});

test("scheduled Web Audio is not falsely reported as audible", () => {
    const playback = script.slice(script.indexOf("async playPcmChunk(message)"), script.indexOf("clearPcmPlayback()", script.indexOf("async playPcmChunk(message)")));
    assert.ok(playback.indexOf('markTurnTiming(message.turn_id, "audio_scheduled")')
        < playback.indexOf("this.clock.setTimeout"));
    assert.match(playback, /this\.clock\.setTimeout\([\s\S]*markTurnTiming\(message\.turn_id, "first_audible_playback"\)/);
    assert.doesNotMatch(playback.slice(0, playback.indexOf("this.clock.setTimeout")), /latency\.playback_started/);
});

test("AudioContext resume delay and HTMLAudio playing are measured at browser-observable milestones", () => {
    assert.match(script, /audio_context_resume_started[\s\S]*await this\.resumeAudioContext\(\)[\s\S]*audio_context_resumed/);
    assert.match(script, /audio_context_resume_ms: elapsed\("audio_context_resume_started", "audio_context_resumed"\)/);
    assert.match(script, /addEventListener\("canplay"[\s\S]*first_audio_chunk_decodable/);
    assert.match(script, /addEventListener\("playing"[\s\S]*html_audio_playing[\s\S]*first_audible_playback/);
});

test("client latency uses only performance.now durations and reports streaming fallbacks", () => {
    const reportStart = script.indexOf("\n    reportClientLatency(turnId)");
    const report = script.slice(reportStart, script.indexOf("\n    handleTurnEvent(message)", reportStart));
    assert.match(script, /this\.performance = options\.performance \|\| window\.performance/);
    assert.match(report, /Math\.round\(to - from\)/);
    assert.doesNotMatch(report, /Date\.now|latency: trace|server.*timestamp/i);
    assert.doesNotMatch(report, /vad_last_voice_detected:|audio_commit_sent:/);
    assert.match(report, /streaming_stt_active:[\s\S]*streaming_stt_fallback_reason:[\s\S]*streaming_tts_active:[\s\S]*streaming_tts_fallback_reason:/);
});

test("streaming playback is cleared by barge-in, speaker off, end and stale turns", () => {
    assert.match(script, /interruptPlayback\(\)[\s\S]*this\.clearPcmPlayback\(\)/);
    assert.match(script, /toggleSpeaker\(\)[\s\S]*!this\.speakerEnabled[\s\S]*this\.clearPcmPlayback\(\)/);
    assert.match(script, /stopTurnMedia\(\)[\s\S]*this\.clearPcmPlayback\(\)/);
    assert.match(script, /playPcmChunk\(message\)[\s\S]*message\.turn_id !== this\.activeTurnId/);
    assert.match(script, /clearPcmPlayback\(\)[\s\S]*source\.stop\(\)[\s\S]*this\.pcmSources\.clear\(\)/);
    assert.match(script, /scheduleReconnect\(\)[\s\S]*this\.clearPcmPlayback\(\)[\s\S]*this\.responseAudio = \[\]/);
});

test("complete-blob speech remains the provider-neutral playback fallback", () => {
    assert.match(script, /else \{[\s\S]*this\.responseAudio\.push[\s\S]*this\.playResponse\(message\.turn_id\)/);
    assert.match(script, /playResponse\(turnId\)[\s\S]*new Blob[\s\S]*this\.createAudioPlayback\(url\)/);
    assert.match(script, /createAudioPlayback\(url\)[\s\S]*this\.primedMediaElement \|\| new this\.AudioClass\(url\)/);
});

test("greeting is automatic once and failure returns to listening", () => {
    assert.match(script, /message\.type === "greeting\.started"/);
    assert.match(script, /message\.type === "greeting\.audio"/);
    assert.match(script, /message\.type === "greeting\.completed"/);
    assert.match(script, /message\.type === "greeting\.failed"/);
    assert.match(script, /if \(!message\.greeting_completed\)/);
    assert.match(script, /finishGreeting\(\)[\s\S]*setState\("listening"/);
    assert.match(script, /addEventListener\("playing"[\s\S]*sendEvent\("latency\.greeting_playback_started"\)/);
});

test("initial startup uses a quiet local ringback without delaying session work", () => {
    assert.match(script, /RINGBACK_GAIN = 0\.025/);
    assert.match(script, /this\.setState\("connecting", "Connecting"\)[\s\S]*this\.prepareAudioOutput\(\);[\s\S]*getUserMedia[\s\S]*createLiveCallSession/);
    assert.match(script, /prepareAudioOutput\(\)[\s\S]*resumeAudioContext\(\)\.then[\s\S]*handleAudioOutputReady\(\)/);
    assert.match(script, /createOscillator\(\)/);
    assert.match(script, /\[440, 480\]/);
    assert.doesNotMatch(script, /RINGBACK_ON_MS|RINGBACK_OFF_MS|soundCadence/);
    assert.match(script, /this\.ringbackOscillators = \[440, 480\]\.map[\s\S]*oscillator\.start\(\)/);
    assert.doesNotMatch(script, /ringback[\s\S]{0,80}(fetch|apiRequest)/i);
});

test("Connecting has an overlapping minimum before silent greeting preparation", () => {
    assert.match(script, /MINIMUM_CONNECTING_MS = 2700/);
    assert.match(script, /setTimeout\(\(\) => \{[\s\S]*this\.ringbackMinimumElapsed = true[\s\S]*this\.completeInitialConnection\(\)[\s\S]*MINIMUM_CONNECTING_MS/);
    assert.match(script, /playGreeting\(message\)[\s\S]*this\.state === "connecting"[\s\S]*this\.pendingGreeting = message;[\s\S]*return/);
    assert.match(script, /message\.type === "greeting\.completed"[\s\S]*!this\.greetingPlayback && !this\.pendingGreeting/);
});

test("slow greeting starts immediately after arrival without an added delay", () => {
    assert.match(script, /completeInitialConnection\(\)[\s\S]*this\.setState\("greeting", "Starting call"\)[\s\S]*this\.playGreeting\(pendingGreeting\)/);
    assert.doesNotMatch(script, /playGreeting\(message\)[\s\S]{0,900}setTimeout/);
});

test("startup work begins in parallel with the minimum ringback timer", () => {
    assert.match(script, /this\.startRingback\(\);[\s\S]*getUserMedia[\s\S]*initializeVad\(\)[\s\S]*createLiveCallSession[\s\S]*connectTransport\(\)/);
    assert.doesNotMatch(script, /await this\.startRingback/);
});

test("ringback is initial-only, speaker-aware, and never used for reconnect", () => {
    assert.match(script, /if \(this\.ringbackStarted \|\| !this\.speakerEnabled \|\| this\.intentionalEnd\) return/);
    assert.match(script, /this\.ringbackStarted = true/);
    assert.match(script, /toggleSpeaker\(\)[\s\S]*if \(!this\.speakerEnabled\) \{[\s\S]*this\.stopRingback\(false\)/);
    assert.doesNotMatch(script, /scheduleReconnect\(\)[\s\S]{0,700}startRingback\(/);
    assert.doesNotMatch(script, /connectTransport\(resume = false\)[\s\S]{0,700}startRingback\(/);
});

test("ringback stops before greeting playback and on every terminal startup path", () => {
    assert.match(script, /completeInitialConnection\(\)[\s\S]*await this\.stopRingback\(false, true\)[\s\S]*setState\("greeting", "Starting call"\)/);
    assert.match(script, /stopRingback\(discardPendingGreeting = true, fadeOut = false\)[\s\S]*linearRampToValueAtTime[\s\S]*RINGBACK_FADE_OUT_MS/);
    assert.match(script, /finishGreeting\(\)[\s\S]*this\.stopRingback\(\)[\s\S]*setState\("listening"/);
    assert.match(script, /performEnd\(\)[\s\S]*this\.stopRingback\(\)/);
    assert.match(script, /fail\(message\)[\s\S]*this\.stopRingback\(\)/);
    assert.match(script, /cleanupForNavigation\(\)[\s\S]*this\.stopRingback\(\)/);
    assert.match(script, /pagehide[\s\S]*cleanupForNavigation/);
    assert.match(script, /stopRingback\(discardPendingGreeting = true, fadeOut = false\)[\s\S]*clearTimeout\(this\.ringbackMinimumTimer\)[\s\S]*this\.pendingGreeting = null/);
});

test("startup preparation remains truthful and accessible without Thinking", () => {
    assert.match(script, /beginGreeting\(\)[\s\S]*setState\("greeting", "Starting call"\)/);
    assert.match(script, /playGreeting\(message\)[\s\S]*setState\("greeting", "Speaking"\)/);
    assert.match(script, /finishGreeting\(\)[\s\S]*setState\("listening", this\.muted \? "Muted" : "Listening"\)/);
    assert.doesNotMatch(script, /beginGreeting\(\)[\s\S]{0,180}Thinking/);
    assert.match(call, /id="liveCallStatus"[\s\S]*role="status" aria-live="assertive"/);
    assert.match(script, /await this\.stopRingback\(false, true\)[\s\S]*setState\("greeting", "Starting call"\)/);
});

test("call timer remains zero through Connecting and silent Starting call", () => {
    assert.match(call, /id="liveCallTimer"[\s\S]*>00:00</);
    assert.doesNotMatch(script, /startRingback\(\)[\s\S]{0,500}startTimer\(\)/);
    assert.doesNotMatch(script, /connected\(message = \{\}, resumed = false\)[\s\S]{0,700}this\.connectedAt = Date\.now\(\)/);
    assert.doesNotMatch(script, /beginGreeting\(\)[\s\S]{0,220}startTimer\(\)/);
});

test("timer starts once at greeting playback or usable-call fallback", () => {
    assert.match(script, /playGreeting\(message\)[\s\S]*this\.greetingPlayback = true;[\s\S]*this\.startTimer\(\);[\s\S]*setState\("greeting", "Speaking"\)/);
    assert.match(script, /finishGreeting\(\)[\s\S]*this\.startTimer\(\)[\s\S]*setState\("listening"/);
    assert.match(script, /reconcileTurn\(message, resumed\)[\s\S]*this\.startTimer\(\)/);
    assert.match(script, /startTimer\(\)[\s\S]*if \(this\.connectedAt\) return/);
});

test("reconnect preserves elapsed time while failure and End Call stop the timer", () => {
    const reconnectSource = script.match(/    scheduleReconnect\(\) \{([\s\S]*?)\n    \}\n\n    clearReconnectTimer/)[1];
    assert.doesNotMatch(reconnectSource, /stopTimer\(\)|connectedAt\s*=/);
    assert.doesNotMatch(script, /connected\(message = \{\}, resumed = false\)[\s\S]{0,700}connectedAt = null/);
    assert.match(script, /fail\(message\)[\s\S]*this\.stopTimer\(\)/);
    assert.match(script, /performEnd\(\)[\s\S]*this\.stopTimer\(\)/);
    assert.match(script, /stopTimer\(\)[\s\S]*clearInterval[\s\S]*this\.connectedAt = null/);
});

test("mute, settings and reconnect safely gate automatic capture", () => {
    assert.match(script, /this\.vadSuspended \|\| this\.muted/);
    assert.match(script, /openSettings\(\)[\s\S]*this\.vadSuspended = true/);
    assert.match(script, /closeSettings\(force = false\)[\s\S]*this\.vadSuspended = false/);
    assert.match(script, /this\.state === "greeting" && message\.greeting_completed/);
    assert.match(script, /this\.transportState !== "connected"/);
});

test("versioned WebSocket contract keeps credentials out of URLs", () => {
    assert.match(script, /const EVENT_VERSION = 1/);
    assert.match(script, /waffleberry\.live-call\.v1/);
    assert.match(script, /`auth\.\$\{this\.session\.transport_token\}`/);
    assert.doesNotMatch(api, /transport_token.*searchParams|searchParams.*transport_token/);
    assert.match(api, /protocol === "https:" \? "wss:" : "ws:"/);
});

test("Live Call styles cover touch, focus, mobile, Night Mode and reduced motion", () => {
    assert.match(styles, /\.live-call-entry[\s\S]*min-height: 44px/);
    assert.match(styles, /\.live-call-control:focus-visible/);
    assert.match(styles, /body\.dark-mode\.live-call-page/);
    assert.match(styles, /@media \(max-width: 650px\)[\s\S]*\.live-call-card/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.live-call-entry/);
    assert.match(styles, /min-height: 100dvh/);
    assert.match(styles, /env\(safe-area-inset-bottom\)/);
    assert.match(styles, /@media \(max-height: 650px\) and \(orientation: landscape\)/);
});

test("premium call status removes the generic pink bullet and technical ellipses", () => {
    assert.doesNotMatch(call, /live-call-state-dot/);
    assert.doesNotMatch(styles, /\.live-call-state-dot/);
    assert.doesNotMatch(script, /Berry is speaking|Listening…|Thinking…|Connecting…|Reconnecting…/);
    assert.match(styles, /\.live-call-status[\s\S]*text-align: center/);
    assert.match(styles, /color: var\(--text-soft/);
});

test("authoritative states drive calm visible call labels", () => {
    assert.match(script, /setState\("connecting", "Connecting"\)/);
    assert.match(script, /setState\("listening", this\.muted \? "Muted" : "Listening"\)/);
    assert.match(script, /setState\("user_speaking", "Listening to you"\)/);
    assert.match(script, /setState\("processing", "Thinking"\)/);
    assert.match(script, /setState\("speaking", "Speaking"\)/);
    assert.match(script, /setTransportState\("reconnecting", "Reconnecting"\)/);
    assert.match(script, /setState\("ended", "Call ended"\)/);
    assert.match(styles, /body\[data-call-state="processing"\] \.live-call-status::after/);
    assert.match(styles, /body\[data-call-state="user_speaking"\] \.live-call-orbit-one/);
});

test("status remains accessible and motion-safe", () => {
    assert.match(call, /id="liveCallStatus"[\s\S]*role="status" aria-live="assertive"/);
    assert.match(call, /role="timer" aria-label="Call duration"/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.live-call-status[\s\S]*animation: none !important/);
});
