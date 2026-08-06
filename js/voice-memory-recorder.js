"use strict";

(function exposeVoiceMemoryRecorder() {
const MAX_RECORDING_SECONDS = 5 * 60;
const MAX_TRANSCRIPTION_BYTES = 10 * 1024 * 1024;
const MAX_ANSWER_CHARACTERS = 12000;
const SUPPORTED_TRANSCRIPTION_TYPES = new Set([
    "audio/webm", "audio/mp4", "audio/ogg", "audio/wav",
    "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/x-m4a",
    "audio/m4a", "audio/flac"
]);
const MIME_TYPES = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4"
];
const AUDIO_CONSTRAINTS = Object.freeze({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
});

function formatDuration(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function safeErrorMessage(error) {
    switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
        return "Microphone access was denied. Allow access in your browser settings and try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
        return "No microphone was found.";
    case "NotReadableError":
    case "AbortError":
        return "We couldn't start the recording. Please try again.";
    case "UnsupportedError":
        return "Voice recording is not supported in this browser.";
    default:
        return "We couldn't start the recording. Please try again.";
    }
}

function transcriptionErrorMessage(error) {
    if (error?.status === 401 || error?.kind === "authentication") {
        return "Your session has expired. Please sign in again.";
    }
    if (error?.kind === "audio_too_large") {
        return "The recording is too large. Record a shorter answer and try again.";
    }
    if (error?.kind === "transcription_failed") {
        return "No speech was detected in the recording.";
    }
    return "We couldn't transcribe this recording. Please try again.";
}

function normalizeTranscript(value) {
    return String(value || "")
        .replace(/\r\n?/g, "\n")
        .trim()
        .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n");
}

function create(elements, options = {}) {
    const notify = options.notify || (() => {});
    const transcribeAudio = options.transcribeAudio;
    const textarea = options.textarea;
    const state = {
        phase: "idle",
        recorder: null,
        stream: null,
        chunks: [],
        blob: null,
        startedAt: 0,
        durationSeconds: 0,
        timerId: null,
        permissionRequestId: 0,
        stopResult: "recorded",
        maximumReached: false,
        transcriptCandidate: "",
        transcriptApplied: false,
        transcriptOriginal: "",
        transcriptCurrent: "",
        transcriptEdited: false,
        applyingTranscript: false,
        recordAgainTrigger: null,
        transcriptionController: null,
        transcriptionRequestId: 0
    };

    function announce(message) {
        elements.liveStatus.textContent = "";
        window.setTimeout(() => {
            elements.liveStatus.textContent = message;
        }, 0);
    }

    function setPhase(phase) {
        state.phase = phase;
        elements.panel.dataset.recordingState = phase;
        render();
    }

    function clearTimer() {
        window.clearInterval(state.timerId);
        state.timerId = null;
    }

    function releaseMicrophone(stream = state.stream) {
        stream?.getTracks().forEach((track) => track.stop());
        if (stream === state.stream) {
            state.stream = null;
        }
    }

    function currentDuration() {
        if (!state.startedAt) {
            return state.durationSeconds;
        }
        return Math.min(
            MAX_RECORDING_SECONDS,
            Math.floor((Date.now() - state.startedAt) / 1000)
        );
    }

    function updateTimer() {
        const duration = currentDuration();
        elements.timer.textContent = formatDuration(duration);
        if (
            duration >= MAX_RECORDING_SECONDS &&
            state.phase === "recording"
        ) {
            stop({ maximumReached: true });
        }
    }

    function render() {
        const requesting = state.phase === "requesting_permission";
        const recording = state.phase === "recording";
        const stopping = state.phase === "stopping";
        const recorded = state.phase === "recorded";
        const transcribing = state.phase === "transcribing";
        const transcribed = state.phase === "transcribed";
        const reviewing = state.phase === "reviewing_transcript";
        const hasReadyRecording = recorded || transcribed || reviewing;
        elements.button.hidden = requesting || recording || stopping || hasReadyRecording || transcribing;
        elements.button.disabled = false;
        elements.panel.hidden = !(requesting || recording || stopping || hasReadyRecording || transcribing);
        elements.recording.hidden = !(requesting || recording || stopping);
        elements.ready.hidden = !(recorded || transcribed);
        elements.transcribing.hidden = !transcribing;
        elements.review.hidden = !reviewing;
        elements.decision.hidden = true;
        elements.recordingLabel.textContent = requesting
            ? "Requesting microphone..."
            : stopping ? "Finishing recording..." : "Recording...";
        elements.stop.disabled = !recording;
        elements.cancel.disabled = stopping;
        elements.transcribe.hidden = state.transcriptApplied;
        elements.transcribe.disabled = !hasReadyRecording;
        elements.transcribe.textContent = state.transcriptCandidate
            ? "Use transcript"
            : "Transcribe recording";
        elements.again.disabled = transcribing;
        elements.discard.disabled = transcribing;
        elements.timer.textContent = formatDuration(currentDuration());
        elements.readyDuration.textContent = formatDuration(state.durationSeconds);
        elements.reviewDuration.textContent = formatDuration(state.durationSeconds);
        elements.edited.hidden = !state.transcriptEdited;
    }

    function chooseMimeType() {
        if (typeof window.MediaRecorder?.isTypeSupported !== "function") {
            return "";
        }
        return MIME_TYPES.find((type) =>
            window.MediaRecorder.isTypeSupported(type)
        ) || "";
    }

    function reset({ focus = true } = {}) {
        clearTimer();
        releaseMicrophone();
        state.recorder = null;
        state.chunks = [];
        state.blob = null;
        state.startedAt = 0;
        state.durationSeconds = 0;
        state.maximumReached = false;
        state.transcriptCandidate = "";
        state.transcriptApplied = false;
        state.transcriptOriginal = "";
        state.transcriptCurrent = "";
        state.transcriptEdited = false;
        state.transcriptionController = null;
        setPhase("idle");
        if (focus) {
            elements.button.focus();
        }
    }

    function fail(error) {
        clearTimer();
        releaseMicrophone();
        state.recorder = null;
        state.chunks = [];
        state.startedAt = 0;
        setPhase("error");
        const message = safeErrorMessage(error);
        notify(message);
        announce(message);
        console.warn("Voice memory recording failed.", {
            category: error?.name || "recorder_error",
            state: state.phase
        });
        elements.button.focus();
    }

    function finishStop() {
        clearTimer();
        releaseMicrophone();
        const discard = state.stopResult === "discard";
        const mimeType = state.recorder?.mimeType || "audio/webm";
        state.recorder = null;
        state.startedAt = 0;
        if (discard) {
            reset();
            announce("Voice recording cancelled.");
            return;
        }
        const blob = new Blob(state.chunks, { type: mimeType });
        state.chunks = [];
        if (!blob.size) {
            fail({ name: "EmptyRecordingError" });
            return;
        }
        state.blob = blob;
        state.transcriptCandidate = "";
        state.transcriptApplied = false;
        setPhase("recorded");
        const message = state.maximumReached
            ? "Recording ready. The five-minute maximum was reached."
            : "Voice recording is ready.";
        announce(message);
        if (state.maximumReached) {
            notify("The five-minute recording maximum was reached.");
        }
        elements.again.focus();
    }

    function stop({ discard = false, maximumReached = false } = {}) {
        if (state.phase !== "recording") {
            return false;
        }
        state.durationSeconds = Math.max(1, currentDuration());
        state.stopResult = discard ? "discard" : "recorded";
        state.maximumReached = maximumReached;
        setPhase("stopping");
        clearTimer();
        try {
            state.recorder.stop();
        } catch (error) {
            fail(error);
            return false;
        } finally {
            releaseMicrophone();
        }
        return true;
    }

    async function start() {
        if (!["idle", "error"].includes(state.phase)) {
            return false;
        }
        if (
            !window.isSecureContext ||
            !navigator.mediaDevices?.getUserMedia ||
            typeof window.MediaRecorder !== "function"
        ) {
            fail({ name: "UnsupportedError" });
            return false;
        }
        state.chunks = [];
        state.blob = null;
        state.transcriptCandidate = "";
        state.transcriptApplied = false;
        state.durationSeconds = 0;
        const requestId = ++state.permissionRequestId;
        setPhase("requesting_permission");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { ...AUDIO_CONSTRAINTS }
            });
            if (
                requestId !== state.permissionRequestId ||
                state.phase !== "requesting_permission"
            ) {
                releaseMicrophone(stream);
                return false;
            }
            state.stream = stream;
            const mimeType = chooseMimeType();
            const recorder = mimeType
                ? new window.MediaRecorder(stream, { mimeType })
                : new window.MediaRecorder(stream);
            state.recorder = recorder;
            recorder.addEventListener("dataavailable", (event) => {
                if (event.data?.size) {
                    state.chunks.push(event.data);
                }
            });
            recorder.addEventListener("stop", finishStop, { once: true });
            recorder.addEventListener("error", (event) => {
                fail(event.error || { name: "RecorderError" });
            }, { once: true });
            recorder.start();
            state.startedAt = Date.now();
            setPhase("recording");
            state.timerId = window.setInterval(updateTimer, 1000);
            announce("Voice recording started.");
            elements.stop.focus();
            return true;
        } catch (error) {
            fail(error);
            return false;
        }
    }

    function cancel() {
        if (state.phase === "requesting_permission") {
            state.permissionRequestId += 1;
            reset();
            announce("Voice recording cancelled.");
            return true;
        }
        return stop({ discard: true });
    }

    function discard() {
        if (!["recorded", "transcribed", "reviewing_transcript"].includes(state.phase)) {
            return false;
        }
        reset();
        announce("Voice recording discarded.");
        return true;
    }

    async function beginNewRecording() {
        closeRecordAgainDialog();
        reset({ focus: false });
        return start();
    }

    function recordAgain(event) {
        if (!["recorded", "transcribed", "reviewing_transcript"].includes(state.phase)) {
            return false;
        }
        if (state.phase === "reviewing_transcript") {
            state.recordAgainTrigger = event?.currentTarget || elements.reviewAgain;
            elements.againDialogBackdrop.hidden = false;
            elements.confirmAgain.focus();
            return true;
        }
        return beginNewRecording();
    }

    function showTranscriptDecision() {
        elements.decision.hidden = false;
        elements.replace.focus();
    }

    function updateAnswerState({ userInput = false } = {}) {
        const current = String(textarea?.value || "").replace(/\r\n?/g, "\n");
        state.transcriptCurrent = current;
        if (userInput && state.phase === "reviewing_transcript") {
            state.transcriptEdited = current !== state.transcriptOriginal;
        }
        elements.edited.hidden = !state.transcriptEdited;
        elements.characterCount.textContent = `${current.length.toLocaleString()} / 12,000`;
        const tooLong = current.length > MAX_ANSWER_CHARACTERS;
        elements.lengthError.hidden = !tooLong;
        textarea?.setAttribute?.("aria-invalid", tooLong ? "true" : "false");
    }

    function transcriptResult(mode) {
        if (mode === "replace") {
            return state.transcriptCandidate;
        }
        if (mode === "append") {
            return `${textarea.value.trimEnd()}\n\n${state.transcriptCandidate}`;
        }
        return "";
    }

    function applyTranscript(mode) {
        const transcript = state.transcriptCandidate;
        if (!transcript || !textarea) {
            return false;
        }
        const result = transcriptResult(mode);
        if (!result) {
            return false;
        }
        if (result.length > MAX_ANSWER_CHARACTERS) {
            const message = "Your answer is too long. Shorten it before saving.";
            elements.lengthError.hidden = false;
            notify(message);
            announce(message);
            return false;
        }
        textarea.value = result;
        state.transcriptApplied = true;
        state.transcriptOriginal = result.replace(/\r\n?/g, "\n");
        state.transcriptCurrent = state.transcriptOriginal;
        state.transcriptEdited = false;
        elements.decision.hidden = true;
        setPhase("reviewing_transcript");
        state.applyingTranscript = true;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        state.applyingTranscript = false;
        textarea.focus();
        textarea.setSelectionRange?.(
            textarea.value.length,
            textarea.value.length
        );
        announce("Transcript ready. Review and edit your answer before saving.");
        return true;
    }

    function cancelTranscriptDecision() {
        elements.decision.hidden = true;
        setPhase("transcribed");
        elements.transcribe.focus();
        announce("Existing answer kept. The transcript remains available.");
    }

    function closeRecordAgainDialog({ restoreFocus = false } = {}) {
        elements.againDialogBackdrop.hidden = true;
        if (restoreFocus) {
            state.recordAgainTrigger?.focus();
        }
    }

    function cancelRecordAgain() {
        closeRecordAgainDialog({ restoreFocus: true });
        announce("New recording cancelled. Your current answer and recording were kept.");
    }

    function trapRecordAgainFocus(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            cancelRecordAgain();
            return;
        }
        if (event.key !== "Tab") {
            return;
        }
        const controls = [elements.confirmAgain, elements.cancelAgain];
        const current = controls.indexOf(event.target);
        if (event.shiftKey && current <= 0) {
            event.preventDefault();
            controls.at(-1).focus();
        } else if (!event.shiftKey && current === controls.length - 1) {
            event.preventDefault();
            controls[0].focus();
        }
    }

    async function transcribe() {
        if (!["recorded", "transcribed"].includes(state.phase)) {
            return false;
        }
        if (state.transcriptCandidate) {
            if (textarea?.value.trim()) {
                showTranscriptDecision();
            } else {
                applyTranscript("replace");
            }
            return true;
        }
        if (!(state.blob instanceof Blob) || !state.blob.size) {
            const message = "No completed recording is available.";
            notify(message);
            announce(message);
            return false;
        }
        if (state.blob.size > MAX_TRANSCRIPTION_BYTES) {
            const message = "The recording is too large. Record a shorter answer and try again.";
            notify(message);
            announce(message);
            return false;
        }
        const contentType = state.blob.type
            .split(";", 1)[0]
            .trim()
            .toLowerCase();
        if (!SUPPORTED_TRANSCRIPTION_TYPES.has(contentType)) {
            const message = "This recording format is not supported.";
            notify(message);
            announce(message);
            return false;
        }
        if (typeof transcribeAudio !== "function") {
            const message = "We couldn't transcribe this recording. Please try again.";
            notify(message);
            announce(message);
            return false;
        }
        const blob = state.blob;
        const requestId = ++state.transcriptionRequestId;
        const controller = new AbortController();
        state.transcriptionController = controller;
        setPhase("transcribing");
        announce("Turning your voice into text.");
        try {
            const response = await transcribeAudio(
                blob,
                undefined,
                { signal: controller.signal }
            );
            if (
                requestId !== state.transcriptionRequestId ||
                blob !== state.blob ||
                state.phase !== "transcribing"
            ) {
                return false;
            }
            const transcript = normalizeTranscript(response?.text);
            if (!transcript) {
                const error = new Error("empty transcript");
                error.kind = "transcription_failed";
                throw error;
            }
            state.transcriptCandidate = transcript;
            setPhase("transcribed");
            announce("Transcription completed.");
            if (textarea?.value.trim()) {
                showTranscriptDecision();
            } else {
                applyTranscript("replace");
            }
            return true;
        } catch (error) {
            if (
                requestId !== state.transcriptionRequestId ||
                error?.kind === "aborted" ||
                error?.name === "AbortError"
            ) {
                return false;
            }
            const message = transcriptionErrorMessage(error);
            setPhase("recorded");
            notify(message);
            announce(message);
            elements.transcribe.focus();
            return false;
        } finally {
            if (requestId === state.transcriptionRequestId) {
                state.transcriptionController = null;
            }
        }
    }

    function cancelTranscription() {
        if (state.phase !== "transcribing") {
            return false;
        }
        state.transcriptionRequestId += 1;
        state.transcriptionController?.abort();
        state.transcriptionController = null;
        setPhase("recorded");
        announce("Transcription cancelled.");
        elements.transcribe.focus();
        return true;
    }

    function cleanup() {
        state.permissionRequestId += 1;
        state.transcriptionRequestId += 1;
        state.transcriptionController?.abort();
        state.transcriptionController = null;
        clearTimer();
        if (["recording", "stopping"].includes(state.phase)) {
            state.stopResult = "discard";
        }
        if (state.phase === "recording") {
            try {
                state.recorder?.stop();
            } catch {
                // The page is leaving; cleanup still releases all tracks.
            }
        }
        releaseMicrophone();
        state.chunks = [];
        state.blob = null;
        state.transcriptCandidate = "";
        state.transcriptOriginal = "";
        state.transcriptCurrent = "";
        state.transcriptEdited = false;
        state.phase = "idle";
    }

    function completeSave() {
        const hadVoiceState = Boolean(
            state.blob ||
            state.transcriptCandidate ||
            state.phase !== "idle"
        );
        cleanup();
        reset({ focus: false });
        if (hadVoiceState) {
            announce("Answer saved. Voice recording cleared.");
        }
    }

    elements.button.addEventListener("click", start);
    elements.stop.addEventListener("click", () => stop());
    elements.cancel.addEventListener("click", cancel);
    elements.again.addEventListener("click", recordAgain);
    elements.discard.addEventListener("click", discard);
    elements.reviewAgain.addEventListener("click", recordAgain);
    elements.reviewDiscard.addEventListener("click", discard);
    elements.transcribe.addEventListener("click", transcribe);
    elements.cancelTranscription.addEventListener("click", cancelTranscription);
    elements.replace.addEventListener("click", () => applyTranscript("replace"));
    elements.append.addEventListener("click", () => applyTranscript("append"));
    elements.keep.addEventListener("click", cancelTranscriptDecision);
    elements.confirmAgain.addEventListener("click", beginNewRecording);
    elements.cancelAgain.addEventListener("click", cancelRecordAgain);
    elements.againDialog.addEventListener("keydown", trapRecordAgainFocus);
    textarea?.addEventListener("input", () => {
        updateAnswerState({ userInput: !state.applyingTranscript });
    });
    elements.decision.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            cancelTranscriptDecision();
        }
    });
    window.addEventListener("pagehide", cleanup);
    window.addEventListener("beforeunload", cleanup);
    updateAnswerState();
    render();

    return Object.freeze({
        start,
        stop,
        cancel,
        discard,
        recordAgain,
        transcribe,
        cancelTranscription,
        cleanup,
        completeSave,
        getState: () => state.phase,
        getDuration: () => state.durationSeconds,
        getBlob: () => state.blob,
        getTranscriptCandidate: () => state.transcriptCandidate,
        getTranscriptOriginal: () => state.transcriptOriginal,
        getTranscriptCurrent: () => state.transcriptCurrent,
        isTranscriptEdited: () => state.transcriptEdited
    });
}

window.WaffleBerryVoiceMemoryRecorder = Object.freeze({
    create,
    MAX_RECORDING_SECONDS,
    MAX_TRANSCRIPTION_BYTES,
    MAX_ANSWER_CHARACTERS,
    MIME_TYPES,
    AUDIO_CONSTRAINTS,
    formatDuration,
    normalizeTranscript
});
})();
