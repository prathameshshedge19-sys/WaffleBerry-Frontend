"use strict";

(function initializeChatPage() {
const {
    STORAGE_KEYS,
    ApiError,
    apiRequest,
    clearStoredSession,
    getFriendlyChatError,
    getMessageSpeech,
    transcribeAudio,
    streamChatMessage,
    supportsResponseStreaming
} = window.WaffleBerryApi;
const companionIdentity =
    window.WaffleBerryCompanionIdentity;
let selectedLegacy = companionIdentity.getLegacy();

companionIdentity.applyToDocument();
const liveCallButtons = Array.from(
    document.querySelectorAll("[data-live-call-entry]")
);
let liveCallContextReady = false;
const liveCallOverlay = document.getElementById("liveCallOverlay");
let inPageLiveCall = null;
let liveCallOpen = false;
let liveCallTrigger = null;
let titleBeforeLiveCall = document.title;

function updateLiveCallLink() {
    if (!liveCallButtons.length) return;
    const parameters = new URLSearchParams();
    if (selectedLegacy?.id) parameters.set("legacyId", selectedLegacy.id);
    if (state.activeConversationId) {
        parameters.set("conversationId", String(state.activeConversationId));
    }
    const query = parameters.toString();
    const href = `live-call.html${query ? `?${query}` : ""}`;
    liveCallButtons.forEach((button) => {
        button.href = href;
        button.setAttribute(
            "aria-disabled",
            String(!liveCallContextReady)
        );
    });
}

liveCallButtons.forEach((button) => {
    button.setAttribute("aria-disabled", "true");
    button.addEventListener("click", (event) => {
        event.preventDefault();
        if (!liveCallContextReady || liveCallOpen) return;
        openInPageLiveCall(button);
    });
});

function resetLiveCallView() {
    document.getElementById("liveCallControls").hidden = false;
    document.getElementById("liveCallEnded").hidden = true;
    document.getElementById("liveCallTimer").textContent = "00:00";
    document.getElementById("liveCallStatus").textContent = "Connecting";
    document.getElementById("liveCallMicrophoneStatus").textContent = "Preparing microphone…";
    const mute = document.getElementById("liveCallMuteButton");
    const speaker = document.getElementById("liveCallSpeakerButton");
    mute.disabled = true;
    mute.setAttribute("aria-pressed", "false");
    mute.setAttribute("aria-label", "Mute microphone");
    mute.lastElementChild.textContent = "Mute";
    speaker.disabled = true;
    speaker.setAttribute("aria-pressed", "true");
    speaker.setAttribute("aria-label", "Turn speaker off");
    speaker.lastElementChild.textContent = "Speaker on";
}

function closeInPageLiveCall() {
    liveCallOverlay.hidden = true;
    chatWebsite.inert = false;
    chatWebsite.removeAttribute("aria-hidden");
    document.body.classList.remove("live-call-overlay-open");
    document.title = titleBeforeLiveCall;
    inPageLiveCall = null;
    liveCallOpen = false;
    window.liveCallController = null;
    if (window.location.hash === "#live-call") window.history.back();
    liveCallTrigger?.focus();
    liveCallTrigger = null;
}

function prepareInPageLiveCall() {
    if (inPageLiveCall || !selectedLegacy?.backendLegacyId) return inPageLiveCall;
    inPageLiveCall = window.WaffleBerryLiveCall.mountLiveCall({
        legacy: selectedLegacy,
        onEnded: closeInPageLiveCall
    });
    window.liveCallController = inPageLiveCall;
    return inPageLiveCall;
}

function openInPageLiveCall(trigger) {
    if (!liveCallOverlay || !selectedLegacy?.backendLegacyId) return;
    prepareInPageLiveCall();
    if (!inPageLiveCall) return;
    liveCallOpen = true;
    liveCallTrigger = trigger;
    titleBeforeLiveCall = document.title;
    resetLiveCallView();
    liveCallOverlay.querySelectorAll("[data-companion-name]").forEach((element) => {
        element.textContent = selectedLegacy.displayName;
    });
    liveCallOverlay.hidden = false;
    chatWebsite.inert = true;
    chatWebsite.setAttribute("aria-hidden", "true");
    document.body.classList.add("live-call-overlay-open");
    document.title = `${selectedLegacy.displayName} | Live Call | Waffle Berry`;
    window.history.pushState({ liveCall: true }, "", `${window.location.pathname}${window.location.search}#live-call`);
    inPageLiveCall.start();
    document.getElementById("liveCallEndButton").focus({ preventScroll: true });
}

window.addEventListener("popstate", () => {
    if (inPageLiveCall) inPageLiveCall.end();
});
document.getElementById("liveCallReturnToChat")?.addEventListener("click", () => {
    inPageLiveCall?.end();
});

const STREAM_INACTIVITY_TIMEOUT_MS = 45000;
const NON_STREAMING_TIMEOUT_MS = 60000;
const MAX_VOICE_RECORDING_SECONDS = 60;
const PREFERRED_AUDIO_MIME_TYPES = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
];

const chatForm =
    document.getElementById("chatForm");
const chatInput =
    document.getElementById("chatInput");
const chatMessages =
    document.getElementById("chatMessages");
const clearChatButton =
    document.getElementById(
        "clearChatButton"
    );
const newChatButton =
    document.getElementById(
        "newChatButton"
    );
const conversationList =
    document.getElementById(
        "conversationList"
    );
const conversationDrawer =
    document.getElementById(
        "conversationDrawer"
    );
const conversationDrawerBackdrop =
    document.getElementById(
        "conversationDrawerBackdrop"
    );
const chatLayout =
    document.querySelector(".chat-layout");
const chatWindow =
    document.querySelector(".chat-window");
const chatWebsite =
    document.getElementById("website");
const mobileDrawerOpenButton =
    document.getElementById(
        "mobileDrawerOpenButton"
    );
const mobileDrawerCloseButton =
    document.getElementById(
        "mobileDrawerCloseButton"
    );
const mobileConversationTitle =
    document.getElementById(
        "mobileConversationTitle"
    );
const mobileNewChatButton =
    document.getElementById(
        "mobileNewChatButton"
    );
const mobileDeleteChatButton =
    document.getElementById(
        "mobileDeleteChatButton"
    );
const mobileThemeButton =
    document.getElementById(
        "mobileThemeButton"
    );
const conversationTitle =
    document.getElementById(
        "conversationTitle"
    );
const chatStatus =
    document.getElementById("chatStatus");
const sendButton =
    document.getElementById("sendButton");
const voiceRecordButton =
    document.getElementById(
        "voiceRecordButton"
    );
const voiceRecorderPanel =
    document.getElementById(
        "voiceRecorderPanel"
    );
const voiceRecordingActive =
    document.getElementById(
        "voiceRecordingActive"
    );
const voiceRecordingStatus =
    document.getElementById(
        "voiceRecordingStatus"
    );
const voiceRecordingTimer =
    document.getElementById(
        "voiceRecordingTimer"
    );
const voiceStopButton =
    document.getElementById(
        "voiceStopButton"
    );
const voiceCancelButton =
    document.getElementById(
        "voiceCancelButton"
    );
const voiceRecordingPreview =
    document.getElementById(
        "voiceRecordingPreview"
    );
const voicePreviewAudio =
    document.getElementById(
        "voicePreviewAudio"
    );
const voicePreviewDuration =
    document.getElementById(
        "voicePreviewDuration"
    );
const voiceDeleteButton =
    document.getElementById(
        "voiceDeleteButton"
    );
const voiceTranscribeButton =
    document.getElementById(
        "voiceTranscribeButton"
    );
const voiceTranscriptionStatus =
    document.getElementById(
        "voiceTranscriptionStatus"
    );
const voiceRecordingError =
    document.getElementById(
        "voiceRecordingError"
    );
const voiceLiveStatus =
    document.getElementById(
        "voiceLiveStatus"
    );
const messageSpeechStatus =
    document.getElementById(
        "messageSpeechStatus"
    );

const state = {
    conversations: [],
    activeConversationId: null,
    createConversationPromise: null,
    historyRequestId: 0,
    renderedMessageIds: new Set(),
    typingConversationId: null,
    pendingConversationId: null,
    messageRequestController: null,
    messageRequestId: 0,
    isLoadingMessages: false,
    isSending: false,
    isDeleting: false,
    isComposing: false
};
const mobileChatMedia =
    window.matchMedia?.(
        "(max-width: 768px)"
    );
let drawerReturnFocus = null;

/* Phase 9.1: local browser-only voice recording. */
const voiceRecorderState = {
    phase: "idle",
    recorder: null,
    stream: null,
    chunks: [],
    timerId: null,
    startedAt: 0,
    durationSeconds: 0,
    objectUrl: null,
    blob: null,
    contextId: null,
    permissionRequestId: 0,
    stopResult: "save",
    stopErrorMessage: "",
    transcriptionPhase: "idle",
    transcriptionRequestId: 0,
    transcriptionController: null,
    successTimerId: null,
    maximumReached: false
};

const messageSpeechState = {
    phase: "idle",
    activeMessageId: null,
    audio: null,
    requestController: null,
    requestId: 0,
    currentTime: 0,
    duration: Number.NaN,
    audioCleanup: null,
    cache: new Map()
};
const MAX_MESSAGE_SPEECH_CACHE = 6;

const VOICE_BUTTON_ICONS = Object.freeze({
    microphone: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5Zm-5.5-4a1 1 0 0 1 2 0V12a3.5 3.5 0 0 0 7 0v-.5a1 1 0 1 1 2 0V12a5.5 5.5 0 0 1-4.5 5.41V20h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.59A5.5 5.5 0 0 1 6.5 12v-.5Z"/></svg>`,
    stop: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>`,
    loading: `<span class="voice-button-spinner" aria-hidden="true"></span>`
});

const SPEECH_BUTTON_ICONS = Object.freeze({
    idle: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7L8 5Z"/></svg>`,
    loading: `<span class="message-speech-spinner" aria-hidden="true"></span>`,
    playing: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z"/></svg>`,
    paused: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7L8 5Z"/></svg>`,
    finished: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5V2l-4 4 4 4V7a5 5 0 1 1-4.58 7H5.26A7 7 0 1 0 12 5Z"/></svg>`,
    error: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5V2L8 6l4 4V7a5 5 0 1 1-4.58 7H5.26A7 7 0 1 0 12 5Z"/></svg>`
});


function formatVoiceDuration(seconds) {
    const safeSeconds = Math.min(
        MAX_VOICE_RECORDING_SECONDS,
        Math.max(0, Math.floor(seconds))
    );
    const minutes = String(
        Math.floor(safeSeconds / 60)
    ).padStart(2, "0");
    const remainder = String(
        safeSeconds % 60
    ).padStart(2, "0");
    return `${minutes}:${remainder}`;
}


function currentVoiceDuration() {
    if (!voiceRecorderState.startedAt) {
        return voiceRecorderState.durationSeconds;
    }

    return Math.min(
        MAX_VOICE_RECORDING_SECONDS,
        Math.floor(
            (Date.now() -
                voiceRecorderState.startedAt) /
                1000
        )
    );
}


function stopVoiceTimer() {
    window.clearInterval(
        voiceRecorderState.timerId
    );
    voiceRecorderState.timerId = null;
}


function stopVoiceSuccessTimer() {
    window.clearTimeout(
        voiceRecorderState.successTimerId
    );
    voiceRecorderState.successTimerId = null;
}


function announceVoiceStatus(message) {
    if (voiceLiveStatus) {
        voiceLiveStatus.textContent = message;
    }
}


function stopEveryVoiceTrack(stream) {
    stream?.getTracks().forEach(
        (track) => track.stop()
    );
}


function releaseVoiceMicrophone() {
    stopEveryVoiceTrack(
        voiceRecorderState.stream
    );
    voiceRecorderState.stream = null;
}


function revokeVoiceObjectUrl() {
    if (voiceRecorderState.objectUrl) {
        URL.revokeObjectURL(
            voiceRecorderState.objectUrl
        );
        voiceRecorderState.objectUrl = null;
    }

    if (voicePreviewAudio) {
        voicePreviewAudio.pause();
        voicePreviewAudio.removeAttribute("src");
        voicePreviewAudio.load();
    }
}


function cancelVoiceTranscription() {
    stopVoiceSuccessTimer();
    voiceRecorderState.transcriptionRequestId += 1;
    voiceRecorderState
        .transcriptionController
        ?.abort();
    voiceRecorderState.transcriptionController =
        null;
    voiceRecorderState.transcriptionPhase =
        "idle";
}


function resetVoiceTranscription() {
    cancelVoiceTranscription();
    if (voiceTranscriptionStatus) {
        voiceTranscriptionStatus.textContent = "";
    }
}


function voiceTranscriptionErrorMessage(error) {
    if (error?.status === 401) {
        return "Your session has expired. Please sign in again.";
    }
    if (error?.kind === "audio_format_unsupported") {
        return "This recording format is not supported. Try recording again.";
    }
    if (error?.kind === "audio_too_large") {
        return "The recording is too large.";
    }
    if ([
        "transcription_rate_limited",
        "transcription_timeout",
        "transcription_provider_unavailable",
        "network",
        "connection_error"
    ].includes(error?.kind)) {
        return "Your recording could not be transcribed. You can try again or type your message.";
    }
    if (error?.kind === "audio_empty") {
        return "No speech was captured. Try speaking closer to the microphone.";
    }
    return "Your recording could not be transcribed. You can try again or type your message.";
}


function updateVoiceTranscriptionUi() {
    const phase =
        voiceRecorderState.transcriptionPhase;

    if (voiceRecorderPanel) {
        voiceRecorderPanel.dataset.transcriptionPhase = phase;
    }

    if (voiceTranscribeButton) {
        voiceTranscribeButton.disabled =
            voiceRecorderState.phase !== "ready" ||
            !voiceRecorderState.blob ||
            ["processing", "completed"].includes(
                phase
            );
        voiceTranscribeButton.textContent =
            phase === "processing"
                ? "Transcribing..."
                : phase === "completed"
                    ? "Voice added"
                    : phase === "error"
                        ? "Retry transcription"
                        : "Transcribe";
    }

    if (voiceTranscriptionStatus) {
        voiceTranscriptionStatus.textContent =
            phase === "processing"
                ? "Transcribing..."
                : phase === "completed"
                    ? "Voice added. Review and send when ready."
                    : voiceTranscriptionStatus
                        .textContent;
    }
}


function voiceErrorMessage(error) {
    switch (error?.name) {
        case "NotAllowedError":
            return "Microphone access was blocked. Enable it in your browser settings and try again.";
        case "NotFoundError":
            return "No microphone was detected.";
        case "NotReadableError":
            return "The microphone is currently unavailable or being used by another application.";
        case "AbortError":
            return "Microphone access was interrupted. Please try again.";
        default:
            return "Recording could not start. Please try again.";
    }
}


function updateVoiceRecorderUi() {
    const phase = voiceRecorderState.phase;
    const isActive = [
        "requesting",
        "recording",
        "stopping"
    ].includes(phase);

    if (voiceRecorderPanel) {
        voiceRecorderPanel.hidden =
            phase === "idle";
        voiceRecorderPanel.dataset.voicePhase = phase;
    }

    if (voiceRecordingActive) {
        voiceRecordingActive.hidden =
            !isActive;
    }

    if (voiceRecordingPreview) {
        voiceRecordingPreview.hidden =
            phase !== "ready";
    }

    if (voiceRecordingError) {
        voiceRecordingError.hidden =
            phase !== "error";
    }

    if (voiceRecordButton) {
        voiceRecordButton.hidden =
            phase === "ready";
        voiceRecordButton.disabled =
            phase === "requesting" ||
            phase === "stopping";
        voiceRecordButton.classList.toggle(
            "is-recording",
            phase === "recording"
        );
        voiceRecordButton.setAttribute(
            "aria-label",
            phase === "requesting"
                ? "Requesting microphone permission"
                : phase === "recording"
                    ? "Stop voice recording"
                    : "Start voice recording"
        );
        voiceRecordButton.setAttribute(
            "aria-pressed",
            phase === "recording" ? "true" : "false"
        );
        voiceRecordButton.title =
            phase === "recording"
                ? "Stop voice recording"
                : phase === "requesting"
                    ? "Requesting microphone permission"
                    : "Start voice recording";
        voiceRecordButton.innerHTML =
            phase === "requesting" || phase === "stopping"
                ? VOICE_BUTTON_ICONS.loading
                : phase === "recording"
                    ? VOICE_BUTTON_ICONS.stop
                    : VOICE_BUTTON_ICONS.microphone;
    }

    if (voiceRecordingStatus) {
        voiceRecordingStatus.textContent =
            phase === "requesting"
                ? "Requesting microphone permission..."
                : phase === "stopping"
                    ? "Finishing recording..."
                    : "Recording";
    }

    if (voiceRecordingTimer) {
        voiceRecordingTimer.textContent =
            `${formatVoiceDuration(
                currentVoiceDuration()
            )} / 01:00`;
    }

    if (voiceStopButton) {
        voiceStopButton.disabled =
            phase !== "recording";
    }

    if (voiceCancelButton) {
        voiceCancelButton.disabled =
            phase === "stopping";
    }

    updateVoiceTranscriptionUi();
}


function showVoiceRecordingError(message) {
    resetVoiceTranscription();
    stopVoiceTimer();
    releaseVoiceMicrophone();
    voiceRecorderState.phase = "error";
    voiceRecorderState.recorder = null;
    voiceRecorderState.chunks = [];
    voiceRecorderState.startedAt = 0;
    voiceRecorderState.contextId = null;

    if (voiceRecordingError) {
        voiceRecordingError.textContent =
            message;
    }

    updateVoiceRecorderUi();
}


function detachVoiceRecorderCallbacks(recorder) {
    if (!recorder) {
        return;
    }

    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
}


function finishStoppedVoiceRecording() {
    const recorder =
        voiceRecorderState.recorder;
    const stopResult =
        voiceRecorderState.stopResult;
    const errorMessage =
        voiceRecorderState.stopErrorMessage;
    const chunks = [
        ...voiceRecorderState.chunks
    ];

    stopVoiceTimer();
    releaseVoiceMicrophone();
    detachVoiceRecorderCallbacks(recorder);
    voiceRecorderState.recorder = null;
    voiceRecorderState.chunks = [];
    voiceRecorderState.startedAt = 0;

    if (stopResult === "discard") {
        resetVoiceTranscription();
        voiceRecorderState.phase = "idle";
        voiceRecorderState.durationSeconds = 0;
        voiceRecorderState.contextId = null;
        updateVoiceRecorderUi();
        announceVoiceStatus("Voice recording cancelled.");
        return;
    }

    if (stopResult === "error") {
        showVoiceRecordingError(
            errorMessage ||
            "Voice recording was interrupted. Please try again."
        );
        return;
    }

    const usableChunks = chunks.filter(
        (chunk) => chunk?.size > 0
    );

    if (!usableChunks.length) {
        showVoiceRecordingError(
            "No speech was captured. Try speaking closer to the microphone."
        );
        return;
    }

    resetVoiceTranscription();
    revokeVoiceObjectUrl();
    const recordedType =
        recorder?.mimeType ||
        usableChunks.find(
            (chunk) => chunk.type
        )?.type ||
        "";
    const blob = new Blob(
        usableChunks,
        recordedType
            ? { type: recordedType }
            : undefined
    );

    if (!blob.size) {
        showVoiceRecordingError(
            "No speech was captured. Try speaking closer to the microphone."
        );
        return;
    }

    voiceRecorderState.blob = blob;
    voiceRecorderState.objectUrl =
        URL.createObjectURL(blob);
    voiceRecorderState.phase = "ready";
    if (voiceRecorderState.maximumReached) {
        announceVoiceStatus(
            "Maximum recording length reached. Recording is ready to transcribe."
        );
    } else {
        announceVoiceStatus(
            "Recording stopped and ready to transcribe."
        );
    }
    voiceRecorderState.maximumReached = false;

    if (voicePreviewAudio) {
        voicePreviewAudio.src =
            voiceRecorderState.objectUrl;
    }

    if (voicePreviewDuration) {
        voicePreviewDuration.textContent =
            `Recording ready · ${formatVoiceDuration(
                voiceRecorderState.durationSeconds
            )}`;
    }

    updateVoiceRecorderUi();
}


function stopVoiceRecording({
    discard = false,
    errorMessage = "",
    maximumReached = false
} = {}) {
    const phase = voiceRecorderState.phase;

    if (phase === "requesting") {
        voiceRecorderState.permissionRequestId += 1;
        voiceRecorderState.phase = discard
            ? "idle"
            : "error";
        voiceRecorderState.contextId = null;

        if (!discard && voiceRecordingError) {
            voiceRecordingError.textContent =
                errorMessage ||
                "Microphone access was interrupted. Please try again.";
        }

        updateVoiceRecorderUi();
        return;
    }

    if (phase === "stopping") {
        if (discard) {
            voiceRecorderState.stopResult =
                "discard";
        }
        return;
    }

    if (phase !== "recording") {
        return;
    }

    voiceRecorderState.durationSeconds =
        Math.min(
            MAX_VOICE_RECORDING_SECONDS,
            Math.max(
                1,
                Math.ceil(
                    (Date.now() -
                        voiceRecorderState.startedAt) /
                        1000
                )
            )
        );
    voiceRecorderState.stopResult = discard
        ? "discard"
        : errorMessage
            ? "error"
            : "save";
    voiceRecorderState.stopErrorMessage =
        errorMessage;
    voiceRecorderState.maximumReached =
        maximumReached;
    voiceRecorderState.phase = "stopping";
    stopVoiceTimer();
    updateVoiceRecorderUi();

    const recorder =
        voiceRecorderState.recorder;

    try {
        if (recorder?.state !== "inactive") {
            recorder.stop();
        } else {
            finishStoppedVoiceRecording();
        }
    } catch {
        voiceRecorderState.stopResult =
            discard ? "discard" : "error";
        voiceRecorderState.stopErrorMessage =
            "Voice recording was interrupted. Please try again.";
        finishStoppedVoiceRecording();
    } finally {
        releaseVoiceMicrophone();
    }
}


function deleteVoiceRecording() {
    resetVoiceTranscription();
    revokeVoiceObjectUrl();
    voiceRecorderState.blob = null;
    voiceRecorderState.durationSeconds = 0;
    voiceRecorderState.contextId = null;
    voiceRecorderState.phase = "idle";
    voiceRecorderState.maximumReached = false;
    updateVoiceRecorderUi();
    voiceRecordButton?.focus();
}


function discardVoiceRecording() {
    resetVoiceTranscription();
    voiceRecorderState.permissionRequestId += 1;

    if ([
        "requesting",
        "recording",
        "stopping"
    ].includes(voiceRecorderState.phase)) {
        stopVoiceRecording({ discard: true });
        return;
    }

    revokeVoiceObjectUrl();
    voiceRecorderState.blob = null;
    voiceRecorderState.chunks = [];
    voiceRecorderState.durationSeconds = 0;
    voiceRecorderState.contextId = null;
    voiceRecorderState.phase = "idle";
    voiceRecorderState.maximumReached = false;
    updateVoiceRecorderUi();
}


function preferredVoiceMimeType() {
    if (
        typeof window.MediaRecorder
            ?.isTypeSupported !== "function"
    ) {
        return "";
    }

    return PREFERRED_AUDIO_MIME_TYPES.find(
        (type) =>
            window.MediaRecorder
                .isTypeSupported(type)
    ) || "";
}


async function startVoiceRecording() {
    if ([
        "requesting",
        "recording",
        "stopping",
        "ready"
    ].includes(voiceRecorderState.phase)) {
        return;
    }

    if (
        !navigator.mediaDevices
            ?.getUserMedia ||
        typeof window.MediaRecorder !==
            "function"
    ) {
        showVoiceRecordingError(
            "Voice recording is not supported by this browser."
        );
        return;
    }

    voiceRecorderState.phase = "requesting";
    voiceRecorderState.contextId =
        state.activeConversationId;
    voiceRecorderState.chunks = [];
    voiceRecorderState.durationSeconds = 0;
    const requestId =
        ++voiceRecorderState.permissionRequestId;
    updateVoiceRecorderUi();
    announceVoiceStatus(
        "Requesting microphone permission."
    );

    try {
        const stream =
            await navigator.mediaDevices
                .getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });

        if (
            requestId !==
                voiceRecorderState
                    .permissionRequestId ||
            voiceRecorderState.phase !==
                "requesting"
        ) {
            stopEveryVoiceTrack(stream);
            return;
        }

        const mimeType =
            preferredVoiceMimeType();
        voiceRecorderState.stream = stream;
        const recorder = mimeType
            ? new window.MediaRecorder(
                stream,
                { mimeType }
            )
            : new window.MediaRecorder(
                stream
            );

        voiceRecorderState.recorder = recorder;
        voiceRecorderState.stopResult = "save";
        voiceRecorderState.stopErrorMessage = "";

        recorder.ondataavailable =
            (event) => {
                if (event.data?.size > 0) {
                    voiceRecorderState
                        .chunks.push(
                            event.data
                        );
                }
            };
        recorder.onstop =
            finishStoppedVoiceRecording;
        recorder.onerror = () => {
            stopVoiceRecording({
                errorMessage:
                    "Voice recording was interrupted. Please try again."
            });
        };

        recorder.start();
        voiceRecorderState.phase = "recording";
        voiceRecorderState.startedAt =
            Date.now();
        updateVoiceRecorderUi();
        announceVoiceStatus(
            "Voice recording started."
        );
        voiceRecorderState.timerId =
            window.setInterval(() => {
                const duration =
                    currentVoiceDuration();
                voiceRecorderState
                    .durationSeconds =
                        duration;
                updateVoiceRecorderUi();

                if (
                    duration >=
                    MAX_VOICE_RECORDING_SECONDS
                ) {
                    stopVoiceRecording({
                        maximumReached: true
                    });
                }
            }, 250);
    } catch (error) {
        detachVoiceRecorderCallbacks(
            voiceRecorderState.recorder
        );
        releaseVoiceMicrophone();
        showVoiceRecordingError(
            voiceErrorMessage(error)
        );
    }
}


async function transcribeReadyVoiceRecording() {
    if (
        voiceRecorderState.phase !== "ready" ||
        !voiceRecorderState.blob ||
        ["processing", "completed"].includes(
            voiceRecorderState.transcriptionPhase
        )
    ) {
        return;
    }

    const blob = voiceRecorderState.blob;
    const requestId =
        ++voiceRecorderState.transcriptionRequestId;
    const controller = new AbortController();
    voiceRecorderState.transcriptionController =
        controller;
    voiceRecorderState.transcriptionPhase =
        "processing";
    announceVoiceStatus("Transcribing recording.");
    if (voiceTranscriptionStatus) {
        voiceTranscriptionStatus.textContent =
            "Transcribing...";
    }
    updateVoiceTranscriptionUi();

    try {
        const response = await transcribeAudio(
            blob,
            undefined,
            { signal: controller.signal }
        );

        if (
            requestId !==
                voiceRecorderState
                    .transcriptionRequestId ||
            blob !== voiceRecorderState.blob ||
            voiceRecorderState.phase !== "ready" ||
            voiceRecorderState.contextId !==
                state.activeConversationId
        ) {
            return;
        }

        const transcript =
            response.text.trim();
        const existingText =
            chatInput?.value.trimEnd() || "";

        if (chatInput) {
            chatInput.value = existingText
                ? `${existingText}\n\n${transcript}`
                : transcript;
            chatInput.style.height = "auto";
            chatInput.style.height =
                `${Math.min(
                    chatInput.scrollHeight,
                    120
                )}px`;
            chatInput.focus();
            chatInput.setSelectionRange?.(
                chatInput.value.length,
                chatInput.value.length
            );
        }

        voiceRecorderState.transcriptionPhase =
            "completed";
        announceVoiceStatus("Voice added to your message.");
        stopVoiceSuccessTimer();
        voiceRecorderState.successTimerId =
            window.setTimeout(() => {
                if (
                    voiceRecorderState
                        .transcriptionPhase !==
                    "completed"
                ) {
                    return;
                }
                revokeVoiceObjectUrl();
                voiceRecorderState.blob = null;
                voiceRecorderState.durationSeconds = 0;
                voiceRecorderState.contextId = null;
                voiceRecorderState.transcriptionPhase = "idle";
                voiceRecorderState.phase = "idle";
                updateVoiceRecorderUi();
                chatInput?.focus();
            }, 1200);
    } catch (error) {
        if (
            requestId !==
                voiceRecorderState
                    .transcriptionRequestId ||
            error?.kind === "aborted"
        ) {
            return;
        }

        voiceRecorderState.transcriptionPhase =
            "error";
        announceVoiceStatus(
            voiceTranscriptionErrorMessage(error)
        );
        if (voiceTranscriptionStatus) {
            voiceTranscriptionStatus.textContent =
                voiceTranscriptionErrorMessage(
                    error
                );
        }
        if (error?.status === 401) {
            handleAuthenticationError(error);
        }
    } finally {
        if (
            requestId ===
            voiceRecorderState
                .transcriptionRequestId
        ) {
            voiceRecorderState
                .transcriptionController =
                    null;
            updateVoiceTranscriptionUi();
        }
    }
}
/* End Phase 9.1 local voice recording. */

/* Phase 9.5: persisted assistant message playback. */
function messageSpeechButtonLabel(phase) {
    return phase === "loading"
        ? "Preparing Berry voice"
        : phase === "playing"
            ? "Pause Berry voice"
            : phase === "paused"
                ? "Resume Berry voice"
                : phase === "finished"
                    ? "Replay Berry voice"
                : phase === "error"
                    ? "Retry Berry voice"
                    : "Play Berry voice";
}


function formatPlaybackTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "--:--";
    }
    const wholeSeconds = Math.floor(seconds);
    const minutes = Math.floor(wholeSeconds / 60);
    const remainder = String(
        wholeSeconds % 60
    ).padStart(2, "0");
    return `${minutes}:${remainder}`;
}


function updateMessageSpeechControls() {
    document
        .querySelectorAll(
            ".message-speech-button"
        )
        .forEach((button) => {
            const messageId = Number(
                button.dataset.messageId
            );
            const isActive =
                messageId ===
                messageSpeechState
                    .activeMessageId;
            const phase = isActive
                ? messageSpeechState.phase
                : "idle";
            const label =
                messageSpeechButtonLabel(
                    phase
                );
            button.dataset.speechState = phase;
            button.disabled =
                phase === "loading";
            button.setAttribute(
                "aria-label",
                label
            );
            button.setAttribute(
                "aria-pressed",
                phase === "playing"
                    ? "true"
                    : "false"
            );
            const text = button.querySelector(
                ".message-speech-button-label"
            );
            if (text) {
                text.textContent = label;
            }
            const icon = button.querySelector(
                ".message-speech-button-icon"
            );
            if (icon) {
                icon.innerHTML =
                    SPEECH_BUTTON_ICONS[phase] ||
                    SPEECH_BUTTON_ICONS.idle;
            }

            const row = button.closest(
                ".message-row"
            );
            row?.classList.toggle(
                "is-speech-active",
                isActive && [
                    "loading",
                    "playing",
                    "paused"
                ].includes(phase)
            );
            const progressRegion =
                row?.querySelector(
                    ".message-speech-progress"
                );
            if (progressRegion) {
                const showProgress =
                    isActive && [
                        "playing",
                        "paused"
                    ].includes(phase);
                progressRegion.hidden =
                    !showProgress;
                const progress =
                    progressRegion.querySelector(
                        "progress"
                    );
                if (progress) {
                    progress.max =
                        messageSpeechState.duration || 1;
                    progress.value = Math.min(
                        messageSpeechState.currentTime,
                        progress.max
                    );
                }
                const timing =
                    progressRegion.querySelector(
                        ".message-speech-time"
                    );
                if (timing) {
                    timing.textContent =
                        `${formatPlaybackTime(
                            messageSpeechState.currentTime
                        )} / ${formatPlaybackTime(
                            messageSpeechState.duration
                        )}`;
                }
            }
        });
}


function setMessageSpeechStatus(message = "") {
    if (messageSpeechStatus) {
        messageSpeechStatus.textContent = message;
    }
}


function disposeActiveMessageAudio() {
    if (!messageSpeechState.audio) {
        return;
    }
    messageSpeechState.audioCleanup?.();
    messageSpeechState.audioCleanup = null;
    messageSpeechState.audio.pause();
    messageSpeechState.audio.removeAttribute?.(
        "src"
    );
    messageSpeechState.audio.load?.();
    messageSpeechState.audio = null;
    messageSpeechState.currentTime = 0;
    messageSpeechState.duration = Number.NaN;
}


function stopMessageSpeech({ clearCache = false } = {}) {
    messageSpeechState.requestId += 1;
    messageSpeechState.requestController?.abort();
    messageSpeechState.requestController = null;
    disposeActiveMessageAudio();
    messageSpeechState.phase = "idle";
    messageSpeechState.activeMessageId = null;

    if (clearCache) {
        messageSpeechState.cache.forEach(
            ({ objectUrl }) => {
                URL.revokeObjectURL(objectUrl);
            }
        );
        messageSpeechState.cache.clear();
    }
    setMessageSpeechStatus("");
    updateMessageSpeechControls();
}


function cacheMessageSpeech(messageId, blob) {
    const previous =
        messageSpeechState.cache.get(
            messageId
        );
    if (previous) {
        URL.revokeObjectURL(
            previous.objectUrl
        );
    }
    const entry = {
        blob,
        objectUrl: URL.createObjectURL(blob)
    };
    messageSpeechState.cache.set(
        messageId,
        entry
    );

    while (
        messageSpeechState.cache.size >
        MAX_MESSAGE_SPEECH_CACHE
    ) {
        const oldestMessageId =
            messageSpeechState.cache
                .keys()
                .next().value;
        if (
            oldestMessageId ===
            messageSpeechState.activeMessageId
        ) {
            break;
        }
        const oldest =
            messageSpeechState.cache.get(
                oldestMessageId
            );
        URL.revokeObjectURL(
            oldest.objectUrl
        );
        messageSpeechState.cache.delete(
            oldestMessageId
        );
    }
    return entry;
}


function messageSpeechErrorMessage(error) {
    if (error?.status === 401) {
        return "Your session has expired. Please sign in again.";
    }
    if (error?.kind === "message_not_found") {
        return "This Berry message is no longer available.";
    }
    if ([
        "speech_rate_limited",
        "speech_timeout",
        "speech_provider_unavailable",
        "network"
    ].includes(error?.kind)) {
        return "Berry's voice is temporarily unavailable.";
    }
    return "Berry's voice could not be played. Please try again.";
}


async function playCachedMessageSpeech(
    messageId,
    entry,
    requestId
) {
    const audio = new window.Audio(
        entry.objectUrl
    );
    messageSpeechState.audio = audio;
    messageSpeechState.currentTime = 0;
    messageSpeechState.duration = Number.NaN;
    messageSpeechState.phase = "playing";
    updateMessageSpeechControls();
    setMessageSpeechStatus(
        "Playing Berry's voice."
    );

    const handleMetadata = () => {
        if (Number.isFinite(audio.duration)) {
            messageSpeechState.duration =
                audio.duration;
            updateMessageSpeechControls();
        }
    };
    const handleTimeUpdate = () => {
        messageSpeechState.currentTime =
            Number.isFinite(audio.currentTime)
                ? audio.currentTime
                : 0;
        handleMetadata();
    };
    const handleEnded = () => {
            if (
                requestId !==
                    messageSpeechState
                        .requestId ||
                messageId !==
                    messageSpeechState
                        .activeMessageId
            ) {
                return;
            }
            audio.currentTime = 0;
            messageSpeechState.currentTime = 0;
            messageSpeechState.phase = "finished";
            setMessageSpeechStatus(
                "Playback finished."
            );
            updateMessageSpeechControls();
    };
    const handleError = () => {
            if (
                requestId ===
                messageSpeechState.requestId
            ) {
                messageSpeechState.phase = "error";
                setMessageSpeechStatus(
                    "Berry's voice could not be played. Please try again."
                );
                updateMessageSpeechControls();
            }
    };
    audio.addEventListener("loadedmetadata", handleMetadata);
    audio.addEventListener("durationchange", handleMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    messageSpeechState.audioCleanup = () => {
        audio.removeEventListener("loadedmetadata", handleMetadata);
        audio.removeEventListener("durationchange", handleMetadata);
        audio.removeEventListener("timeupdate", handleTimeUpdate);
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("error", handleError);
    };
    await audio.play();
}


async function toggleMessageSpeech(button) {
    const messageId = Number(
        button?.dataset.messageId
    );
    const conversationId =
        normalizeConversationId(
            state.activeConversationId
        );
    if (
        !Number.isInteger(messageId) ||
        !conversationId
    ) {
        return;
    }

    if (
        messageId ===
            messageSpeechState.activeMessageId &&
        messageSpeechState.phase === "playing"
    ) {
        messageSpeechState.audio?.pause();
            messageSpeechState.phase = "paused";
        messageSpeechState.currentTime =
            messageSpeechState.audio?.currentTime || 0;
        setMessageSpeechStatus("Playback paused.");
        updateMessageSpeechControls();
        return;
    }
    if (
        messageId ===
            messageSpeechState.activeMessageId &&
        messageSpeechState.phase === "paused"
    ) {
        try {
            await messageSpeechState.audio?.play();
            messageSpeechState.phase = "playing";
            setMessageSpeechStatus(
                "Playing Berry's voice."
            );
        } catch {
            messageSpeechState.phase = "error";
            setMessageSpeechStatus(
                "Berry's voice could not be played. Please try again."
            );
        }
        updateMessageSpeechControls();
        return;
    }
    if (
        messageId ===
            messageSpeechState.activeMessageId &&
        messageSpeechState.phase === "loading"
    ) {
        return;
    }

    stopMessageSpeech();
    const requestId =
        ++messageSpeechState.requestId;
    messageSpeechState.activeMessageId =
        messageId;
    const cached =
        messageSpeechState.cache.get(
            messageId
        );

    try {
        let entry = cached;
        if (!entry) {
            const controller =
                new AbortController();
            messageSpeechState.requestController =
                controller;
            messageSpeechState.phase = "loading";
            setMessageSpeechStatus(
                "Preparing Berry voice..."
            );
            updateMessageSpeechControls();
            const blob = await getMessageSpeech(
                conversationId,
                messageId,
                {
                    responseFormat: "mp3",
                    signal: controller.signal
                }
            );
            if (
                requestId !==
                    messageSpeechState
                        .requestId ||
                conversationId !==
                    normalizeConversationId(
                        state.activeConversationId
                    )
            ) {
                return;
            }
            entry = cacheMessageSpeech(
                messageId,
                blob
            );
        }
        messageSpeechState.requestController =
            null;
        await playCachedMessageSpeech(
            messageId,
            entry,
            requestId
        );
    } catch (error) {
        if (
            requestId !==
                messageSpeechState.requestId ||
            error?.kind === "aborted"
        ) {
            return;
        }
        messageSpeechState.requestController =
            null;
        messageSpeechState.phase = "error";
        setMessageSpeechStatus(
            messageSpeechErrorMessage(error)
        );
        updateMessageSpeechControls();
        if (error?.status === 401) {
            stopMessageSpeech({
                clearCache: true
            });
            discardVoiceRecording();
            handleAuthenticationError(error);
        }
    }
}


function createMessageSpeechButton(messageId) {
    const button =
        document.createElement("button");
    button.type = "button";
    button.className =
        "message-speech-button";
    button.dataset.messageId =
        String(messageId);
    button.innerHTML = `
        <span class="message-speech-button-icon" aria-hidden="true">
            ${SPEECH_BUTTON_ICONS.idle}
        </span>
        <span class="message-speech-button-label">Play Berry voice</span>
    `;
    button.setAttribute(
        "aria-label",
        "Play Berry voice"
    );
    button.setAttribute(
        "aria-pressed",
        "false"
    );
    return button;
}


function attachMessageSpeechControl(
    row,
    messageId
) {
    const normalizedId = Number(messageId);
    if (
        !row ||
        !Number.isInteger(normalizedId) ||
        row.querySelector(
            ".message-speech-button"
        )
    ) {
        return;
    }
    const actions =
        document.createElement("div");
    actions.className =
        "message-speech-actions voice-player";
    actions.dataset.messageId =
        String(normalizedId);
    row.classList.add("has-speech-control");
    actions.appendChild(
        createMessageSpeechButton(
            normalizedId
        )
    );
    const progress = document.createElement("div");
    progress.className = "message-speech-progress";
    progress.hidden = true;
    progress.innerHTML = `
        <progress value="0" max="1" aria-label="Berry voice playback progress"></progress>
        <span class="message-speech-time">0:00 / --:--</span>
    `;
    actions.appendChild(progress);
    const bubble = row.querySelector(
        ".berry-message"
    );
    if (!bubble) {
        return;
    }
    bubble.appendChild(actions);
    updateMessageSpeechControls();
}
/* End Phase 9.5 persisted assistant message playback. */


function isMobileChat() {
    return Boolean(mobileChatMedia?.matches);
}


function closeConversationDrawer(
    restoreFocus = true
) {
    conversationDrawer?.classList.remove(
        "is-open"
    );
    conversationDrawer?.setAttribute(
        "aria-hidden",
        isMobileChat() ? "true" : "false"
    );
    conversationDrawerBackdrop?.setAttribute(
        "hidden",
        ""
    );
    mobileDrawerOpenButton?.setAttribute(
        "aria-expanded",
        "false"
    );
    document.body.classList.remove(
        "conversation-drawer-open"
    );

    if (restoreFocus && isMobileChat()) {
        drawerReturnFocus?.focus();
    }
}


function openConversationDrawer() {
    if (!isMobileChat()) {
        return;
    }

    drawerReturnFocus =
        document.activeElement;
    conversationDrawer?.classList.add(
        "is-open"
    );
    conversationDrawer?.setAttribute(
        "aria-hidden",
        "false"
    );
    conversationDrawerBackdrop?.removeAttribute(
        "hidden"
    );
    mobileDrawerOpenButton?.setAttribute(
        "aria-expanded",
        "true"
    );
    document.body.classList.add(
        "conversation-drawer-open"
    );
    mobileDrawerCloseButton?.focus();
}


function synchronizeDrawerMode() {
    if (isMobileChat()) {
        chatWebsite?.appendChild(
            conversationDrawer
        );
        conversationDrawer?.setAttribute(
            "role",
            "dialog"
        );
        conversationDrawer?.setAttribute(
            "aria-modal",
            "true"
        );
        closeConversationDrawer(false);
        return;
    }

    if (chatLayout && chatWindow) {
        chatLayout.insertBefore(
            conversationDrawer,
            chatWindow
        );
    }

    conversationDrawer?.removeAttribute(
        "role"
    );
    conversationDrawer?.removeAttribute(
        "aria-modal"
    );
    conversationDrawer?.removeAttribute(
        "aria-hidden"
    );
    conversationDrawer?.classList.remove(
        "is-open"
    );
    conversationDrawerBackdrop?.setAttribute(
        "hidden",
        ""
    );
    document.body.classList.remove(
        "conversation-drawer-open"
    );
}


synchronizeDrawerMode();


function handleAuthenticationError(error) {
    if (
        error instanceof ApiError &&
        error.status === 401
    ) {
        clearStoredSession();
        window.location.replace(
            "login.html"
        );
        return true;
    }

    return false;
}


function setChatStatus(
    message = "",
    type = ""
) {
    if (!chatStatus) {
        return;
    }

    chatStatus.textContent = message;
    chatStatus.classList.toggle(
        "error-state",
        type === "error"
    );
    chatStatus.classList.toggle(
        "loading-state",
        type === "loading"
    );
}


function updateControls() {
    const isCreating =
        Boolean(
            state.createConversationPromise
        );

    if (newChatButton) {
        newChatButton.disabled =
            isCreating;
    }

    if (mobileNewChatButton) {
        mobileNewChatButton.disabled =
            isCreating;
    }

    if (sendButton) {
        sendButton.disabled =
            state.isSending ||
            state.isLoadingMessages ||
            isCreating;
    }

    if (chatInput) {
        chatInput.disabled =
            state.isSending;
    }

    if (clearChatButton) {
        clearChatButton.disabled =
            !state.activeConversationId ||
            state.isDeleting;
    }

    if (mobileDeleteChatButton) {
        mobileDeleteChatButton.disabled =
            !state.activeConversationId ||
            state.isDeleting;
    }
}


function scrollChatToBottom(behavior = "auto") {
    if (chatMessages) {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior
        });
    }
}


function createTypingIndicator() {
    const row =
        document.createElement("div");
    row.id = "typingIndicator";
    row.className =
        "message-row berry-row typing-row";
    row.setAttribute("role", "status");
    row.setAttribute("aria-live", "polite");
    row.setAttribute(
        "aria-label",
        companionIdentity.text(
            "{name} is thinking"
        )
    );

    const avatar =
        document.createElement("img");
    avatar.src =
        "assets/waffle-berry-mascot.png";
    avatar.alt = "";
    avatar.className = "message-avatar";

    const indicator =
        document.createElement("div");
    indicator.className =
        "message berry-message typing-indicator";
    indicator.setAttribute(
        "aria-hidden",
        "true"
    );

    const label =
        document.createElement("span");
    label.className =
        "typing-companion-label";
    label.textContent =
        companionIdentity.text(
            "{name} is thinking"
        );

    const dots =
        document.createElement("span");
    dots.className = "typing-dots";

    for (let index = 0; index < 3; index += 1) {
        dots.appendChild(
            document.createElement("i")
        );
    }

    indicator.append(label, dots);
    row.appendChild(avatar);
    row.appendChild(indicator);
    return row;
}


function showTypingIndicator(conversationId) {
    if (!chatMessages) {
        return;
    }

    hideTypingIndicator();
    state.typingConversationId =
        conversationId;
    chatMessages.appendChild(
        createTypingIndicator()
    );
    scrollChatToBottom("smooth");
}


function hideTypingIndicator(conversationId) {
    if (
        conversationId !== undefined &&
        state.typingConversationId !==
            conversationId
    ) {
        return;
    }

    document
        .getElementById("typingIndicator")
        ?.remove();
    state.typingConversationId = null;
}


function cancelActiveMessageRequest() {
    if (!state.messageRequestController) {
        return;
    }

    state.messageRequestId += 1;
    state.messageRequestController.abort();
    state.messageRequestController = null;
    state.pendingConversationId = null;
    state.isSending = false;
    hideTypingIndicator();
    updateControls();
}


function createStateElement(
    message,
    type,
    retryAction
) {
    const wrapper =
        document.createElement("div");
    wrapper.className =
        `chat-state ${type || ""}`.trim();

    const text =
        document.createElement("p");
    text.textContent = message;
    wrapper.appendChild(text);

    if (retryAction) {
        const retryButton =
            document.createElement("button");
        retryButton.type = "button";
        retryButton.className =
            "state-retry-button";
        retryButton.textContent = "Retry";
        retryButton.addEventListener(
            "click",
            retryAction
        );
        wrapper.appendChild(retryButton);
    }

    return wrapper;
}


function showMessageState(
    message,
    type = "",
    retryAction
) {
    if (!chatMessages) {
        return;
    }

    hideTypingIndicator();
    state.renderedMessageIds.clear();
    chatMessages.replaceChildren(
        createStateElement(
            message,
            type,
            retryAction
        )
    );
}


function showCompanionWelcome() {
    if (!chatMessages) {
        return;
    }

    hideTypingIndicator();
    state.renderedMessageIds.clear();
    const desktopWelcome =
        createBerryMessage(
            companionIdentity
                .welcomeMessage()
        );
    const mobileWelcome =
        document.createElement("div");
    const mobileWelcomeMascot =
        document.createElement("img");
    const mobileWelcomeText =
        document.createElement("p");

    desktopWelcome.classList.add(
        "desktop-chat-welcome"
    );
    mobileWelcome.className =
        "mobile-chat-empty-state";
    mobileWelcomeMascot.src =
        "assets/waffle-berry-mascot.png";
    mobileWelcomeMascot.alt = "";
    mobileWelcomeText.textContent =
        "What would you like to remember today?";
    mobileWelcome.append(
        mobileWelcomeMascot,
        mobileWelcomeText
    );
    chatMessages.replaceChildren(
        desktopWelcome,
        mobileWelcome
    );
    scrollChatToBottom("smooth");
}


function appendInlineError(error) {
    if (!chatMessages) {
        return;
    }

    const errorElement =
        createBerryMessage(
            companionIdentity.personalize(
                getFriendlyChatError(error)
            ),
            { isError: true }
        );
    chatMessages.appendChild(errorElement);
    scrollChatToBottom("smooth");
}


function createUserMessage(content) {
    const row =
        document.createElement("div");
    row.className =
        "message-row user-row";

    const message =
        document.createElement("div");
    message.className =
        "message user-message";
    message.textContent = content;

    row.appendChild(message);
    return row;
}


function renderAssistantMarkdown(
    element,
    content
) {
    const source =
        typeof content === "string"
            ? content
            : "";

    if (
        typeof window.marked?.parse !==
            "function" ||
        typeof window.DOMPurify?.sanitize !==
            "function"
    ) {
        element.textContent = source;
        return;
    }

    try {
        const rendered = window.marked.parse(
            source,
            {
                gfm: true,
                breaks: true
            }
        );
        element.innerHTML =
            window.DOMPurify.sanitize(
                rendered,
                {
                    USE_PROFILES: {
                        html: true
                    }
                }
            );

        element
            .querySelectorAll("a[href]")
            .forEach((link) => {
                link.target = "_blank";
                link.rel =
                    "noopener noreferrer";
            });
    } catch {
        element.textContent = source;
        console.error(
            "Assistant Markdown rendering failed."
        );
    }
}


function createBerryMessage(
    content,
    options = {}
) {
    const row =
        document.createElement("div");
    row.className =
        "message-row berry-row";

    if (options.isError) {
        row.classList.add("error-message-row");
        row.setAttribute("role", "alert");
    }

    const avatar =
        document.createElement("img");
    avatar.src =
        "assets/waffle-berry-mascot.png";
    avatar.alt = "";
    avatar.className =
        "message-avatar";

    const message =
        document.createElement("div");
    message.className =
        "message berry-message";
    message.classList.toggle(
        "inline-error-message",
        Boolean(options.isError)
    );

    if (options.isError) {
        message.textContent = content;
    } else {
        renderAssistantMarkdown(
            message,
            content
        );
    }

    row.appendChild(avatar);
    row.appendChild(message);
    return row;
}


function createStreamingBerryMessage() {
    const row = createBerryMessage("");
    const bubble = row.querySelector(
        ".berry-message"
    );

    row.classList.add(
        "streaming-message-row"
    );
    row.setAttribute("aria-live", "off");
    bubble?.classList.add(
        "streaming-message"
    );
    return row;
}


function appendStreamDelta(row, delta) {
    const bubble = row?.querySelector(
        ".berry-message"
    );

    if (bubble) {
        bubble.textContent += delta;
    }
}


function finalizeStreamingMessage(
    row,
    message
) {
    const bubble = row?.querySelector(
        ".berry-message"
    );

    if (!row || !bubble || !message) {
        return;
    }

    row.classList.remove(
        "streaming-message-row"
    );
    bubble.classList.remove(
        "streaming-message"
    );
    renderAssistantMarkdown(
        bubble,
        message.content
    );

    if (message.message_id) {
        row.dataset.messageId = String(
            message.message_id
        );
        state.renderedMessageIds.add(
            Number(message.message_id)
        );
        attachMessageSpeechControl(
            row,
            message.message_id
        );
    }
}


function createMessageElement(message) {
    let element = null;

    if (message?.role === "user") {
        element = createUserMessage(
            message.content
        );
    } else if (message?.role === "assistant") {
        element = createBerryMessage(
            message.content
        );
        if (message?.message_id) {
            attachMessageSpeechControl(
                element,
                message.message_id
            );
        }
    }

    if (element && message?.message_id) {
        element.dataset.messageId =
            String(message.message_id);
    }

    return element;
}


function appendMessage(message) {
    const messageId = Number(
        message?.message_id
    );

    if (
        Number.isInteger(messageId) &&
        state.renderedMessageIds.has(messageId)
    ) {
        return null;
    }

    const element =
        createMessageElement(message);

    if (!element || !chatMessages) {
        return null;
    }

    const stateElement =
        chatMessages.querySelector(
            ".chat-state"
        );

    if (stateElement) {
        chatMessages.replaceChildren();
    }

    chatMessages.appendChild(element);

    if (Number.isInteger(messageId)) {
        state.renderedMessageIds.add(
            messageId
        );
    }

    return element;
}


function normalizeConversationId(value) {
    const normalized = Number(value);
    return Number.isInteger(normalized)
        ? normalized
        : null;
}


function reconcileOptimisticMessage(
    optimisticElement,
    persistedMessage
) {
    const messageId = Number(
        persistedMessage?.message_id
    );

    if (!Number.isInteger(messageId)) {
        return optimisticElement;
    }

    const existingElement =
        chatMessages?.querySelector(
            `[data-message-id="${messageId}"]`
        );

    if (existingElement) {
        if (
            optimisticElement?.isConnected &&
            optimisticElement !== existingElement
        ) {
            optimisticElement.remove();
        }
        state.renderedMessageIds.add(messageId);
        return existingElement;
    }

    if (optimisticElement?.isConnected) {
        optimisticElement.dataset.messageId =
            String(messageId);
        state.renderedMessageIds.add(messageId);
        return optimisticElement;
    }

    return appendMessage(persistedMessage);
}


function renderMessages(messages) {
    if (!chatMessages) {
        return;
    }

    stopMessageSpeech({ clearCache: true });
    chatMessages.replaceChildren();
    state.renderedMessageIds.clear();

    const orderedMessages = [...messages].sort(
        (first, second) => {
            const firstTime =
                Date.parse(first.created_at || 0) ||
                0;
            const secondTime =
                Date.parse(second.created_at || 0) ||
                0;

            return (
                firstTime - secondTime ||
                Number(first.message_id || 0) -
                    Number(second.message_id || 0)
            );
        }
    );

    orderedMessages.forEach((message) => {
        appendMessage(message);
    });

    if (!chatMessages.children.length) {
        showCompanionWelcome();
    }

    scrollChatToBottom();
}


function storeActiveConversationId(id) {
    if (id === null) {
        localStorage.removeItem(
            STORAGE_KEYS
                .ACTIVE_CONVERSATION_ID
        );
        return;
    }

    localStorage.setItem(
        STORAGE_KEYS.ACTIVE_CONVERSATION_ID,
        String(id)
    );
}


function getStoredActiveConversationId() {
    const storedId =
        localStorage.getItem(
            STORAGE_KEYS
                .ACTIVE_CONVERSATION_ID
        );
    const parsedId = Number(storedId);

    return Number.isInteger(parsedId) &&
        parsedId > 0
        ? parsedId
        : null;
}


function getActiveConversation() {
    return state.conversations.find(
        (conversation) =>
            conversation.conversation_id ===
            state.activeConversationId
    );
}


function updateConversationHeader() {
    const title =
        getActiveConversation()?.title ||
        companionIdentity.text(
            "Conversation with {name}"
        );

    if (conversationTitle) {
        conversationTitle.textContent = title;
    }

    if (mobileConversationTitle) {
        mobileConversationTitle.textContent =
            title;
    }
}


function createConversationButton(
    conversation
) {
    const button =
        document.createElement("button");
    button.type = "button";
    button.className =
        "conversation-list-item";
    button.dataset.conversationId =
        String(
            conversation.conversation_id
        );
    button.textContent =
        conversation.title || "New Chat";
    button.title =
        conversation.title || "New Chat";
    button.classList.toggle(
        "active",
        conversation.conversation_id ===
            state.activeConversationId
    );

    button.addEventListener(
        "click",
        () => {
            selectConversation(
                conversation.conversation_id
            );
        }
    );

    return button;
}


function renderConversationList() {
    if (!conversationList) {
        return;
    }

    conversationList.replaceChildren();

    if (!state.conversations.length) {
        conversationList.appendChild(
            createStateElement(
                "No conversations yet.",
                "empty-state"
            )
        );
        return;
    }

    state.conversations.forEach(
        (conversation) => {
            conversationList.appendChild(
                createConversationButton(
                    conversation
                )
            );
        }
    );
}


function sortConversations(conversations) {
    return [...conversations].sort(
        (first, second) => {
            const firstTime =
                Date.parse(
                    first.updated_at || 0
                ) || 0;
            const secondTime =
                Date.parse(
                    second.updated_at || 0
                ) || 0;

            return secondTime - firstTime;
        }
    );
}


async function loadMessageHistory(
    conversationId
) {
    const requestId =
        ++state.historyRequestId;

    state.isLoadingMessages = true;
    updateControls();
    setChatStatus(
        "Loading messages...",
        "loading"
    );
    showMessageState(
        "Loading conversation...",
        "loading-state"
    );

    try {
        const messages =
            await apiRequest(
                `/conversations/${conversationId}/messages`
            );

        if (
            requestId !==
                state.historyRequestId ||
            conversationId !==
                state.activeConversationId
        ) {
            return;
        }

        renderMessages(messages);

        if (
            state.isSending &&
            state.pendingConversationId ===
                conversationId
        ) {
            showTypingIndicator(
                conversationId
            );
        }

        setChatStatus(
            messages.length
                ? "Your conversation is up to date."
                : companionIdentity.text(
                    "Begin your conversation with {name}."
                )
        );
    } catch (error) {
        if (
            requestId !==
            state.historyRequestId
        ) {
            return;
        }

        if (handleAuthenticationError(error)) {
            return;
        }

        if (
            error instanceof ApiError &&
            error.status === 404
        ) {
            await removeMissingConversation(
                conversationId
            );
            return;
        }

        setChatStatus(
            "Messages could not be loaded. Please try again.",
            "error"
        );
        showMessageState(
            "Messages could not be loaded.",
            "error-state",
            () =>
                loadMessageHistory(
                    conversationId
                )
        );
    } finally {
        if (
            requestId ===
            state.historyRequestId
        ) {
            state.isLoadingMessages =
                false;
            updateControls();
        }
    }
}


function selectConversation(
    conversationId,
    options = {}
) {
    const conversation =
        state.conversations.find(
            (item) =>
                item.conversation_id ===
                conversationId
        );

    if (!conversation) {
        return;
    }

    if (
        state.activeConversationId !==
        conversationId
    ) {
        stopMessageSpeech({
            clearCache: true
        });
    }

    if (
        state.activeConversationId !==
            conversationId &&
        !["idle", "error"].includes(
            voiceRecorderState.phase
        )
    ) {
        if (
            state.activeConversationId === null &&
            voiceRecorderState.contextId === null
        ) {
            voiceRecorderState.contextId =
                conversationId;
        } else {
            discardVoiceRecording();
        }
    }

    if (
        state.activeConversationId !==
            conversationId &&
        state.isSending
    ) {
        cancelActiveMessageRequest();
    }

    state.activeConversationId =
        conversationId;
    updateLiveCallLink();
    hideTypingIndicator();
    storeActiveConversationId(
        conversationId
    );
    renderConversationList();
    updateConversationHeader();

    closeConversationDrawer(false);
    updateControls();

    if (options.loadHistory !== false) {
        loadMessageHistory(
            conversationId
        );

        if (
            state.isSending &&
            state.pendingConversationId ===
                conversationId
        ) {
            showTypingIndicator(
                conversationId
            );
        }
    }
}


async function removeMissingConversation(
    conversationId,
    options = {}
) {
    state.conversations =
        state.conversations.filter(
            (conversation) =>
                conversation
                    .conversation_id !==
                conversationId
        );

    if (
        state.activeConversationId ===
        conversationId
    ) {
        state.activeConversationId = null;
        storeActiveConversationId(null);
    }

    renderConversationList();

    if (state.conversations.length) {
        selectConversation(
            state.conversations[0]
                .conversation_id
        );
    } else {
        updateConversationHeader();
        updateControls();
        setChatStatus(
            options.wasDeleted
                ? "Conversation deleted."
                : "That conversation is no longer available.",
            options.wasDeleted
                ? ""
                : "error"
        );
        showMessageState(
            options.wasDeleted
                ? "No conversations yet. Create a new chat to begin."
                : "Create a new chat to continue.",
            "empty-state"
        );
    }
}


function getNewChatRequest() {
    const url =
        new URL(window.location.href);
    const shouldCreate =
        url.searchParams.get("new") === "1";

    if (shouldCreate) {
        url.searchParams.delete("new");
        window.history.replaceState(
            {},
            "",
            `${url.pathname}${url.search}${url.hash}`
        );
    }

    return shouldCreate;
}


async function createConversation() {
    if (state.createConversationPromise) {
        return state.createConversationPromise;
    }

    cancelActiveMessageRequest();

    state.createConversationPromise =
        (async () => {
            updateControls();
            setChatStatus(
                "Creating a new chat...",
                "loading"
            );

            try {
                const conversation =
                    await apiRequest(
                        "/conversations",
                        {
                            method: "POST",
                            body: selectedLegacy?.backendLegacyId
                                ? { legacy_id: selectedLegacy.backendLegacyId }
                                : {}
                        }
                    );

                state.conversations =
                    state.conversations.filter(
                        (item) =>
                            item
                                .conversation_id !==
                            conversation
                                .conversation_id
                    );
                state.conversations.unshift(
                    conversation
                );

                selectConversation(
                    conversation
                        .conversation_id,
                    {
                        loadHistory: false
                    }
                );

                state.historyRequestId += 1;
                showCompanionWelcome();
                setChatStatus(
                    "New chat ready."
                );
                chatInput?.focus();

                return conversation;
            } catch (error) {
                if (
                    handleAuthenticationError(
                        error
                    )
                ) {
                    return null;
                }

                setChatStatus(
                    "A new chat could not be created. Please try again.",
                    "error"
                );
                return null;
            } finally {
                state.createConversationPromise =
                    null;
                updateControls();
            }
        })();

    updateControls();
    return state.createConversationPromise;
}


function createNewConversationFromControl() {
    discardVoiceRecording();
    stopMessageSpeech({ clearCache: true });
    return createConversation();
}


async function loadConversations() {
    if (conversationList) {
        conversationList.replaceChildren(
            createStateElement(
                "Loading conversations...",
                "loading-state"
            )
        );
    }

    try {
        const conversations =
            await apiRequest(
                "/conversations"
            );

        const scopedConversations = selectedLegacy?.backendLegacyId
            ? conversations.filter(
                (conversation) =>
                    conversation.legacy_id === selectedLegacy.backendLegacyId
            )
            : conversations.filter(
                (conversation) => conversation.legacy_id == null
            );
        state.conversations = sortConversations(scopedConversations);
        renderConversationList();

        if (getNewChatRequest()) {
            await createConversation();
            return;
        }

        const requestedConversationId = Number(new URLSearchParams(
            window.location.search
        ).get("conversationId"));
        const storedId = Number.isInteger(requestedConversationId)
                && requestedConversationId > 0
            ? requestedConversationId
            : getStoredActiveConversationId();
        const storedConversation =
            state.conversations.find(
                (conversation) =>
                    conversation
                        .conversation_id ===
                    storedId
            );

        if (storedConversation) {
            selectConversation(
                storedConversation
                    .conversation_id
            );
            return;
        }

        if (state.conversations.length) {
            selectConversation(
                state.conversations[0]
                    .conversation_id
            );
            return;
        }

        state.activeConversationId = null;
        storeActiveConversationId(null);
        updateConversationHeader();
        updateControls();
        setChatStatus(
            "Create a new chat when you're ready."
        );
        showMessageState(
            "No conversations yet. Create a new chat to begin.",
            "empty-state"
        );
    } catch (error) {
        if (handleAuthenticationError(error)) {
            return;
        }

        if (conversationList) {
            conversationList.replaceChildren(
                createStateElement(
                    "Conversations could not be loaded.",
                    "error-state",
                    loadConversations
                )
            );
        }

        setChatStatus(
            "Conversations could not be loaded. Please try again.",
            "error"
        );
        showMessageState(
            "The server is temporarily unavailable.",
            "error-state",
            loadConversations
        );
    }
}


function moveActiveConversationToTop(
    updatedConversation
) {
    const conversation =
        state.conversations.find(
            (item) =>
                item.conversation_id ===
                updatedConversation
                    ?.conversation_id
        );

    if (!conversation) {
        return;
    }

    Object.assign(
        conversation,
        updatedConversation
    );

    state.conversations =
        sortConversations(
            state.conversations
    );
    renderConversationList();

    if (
        conversation.conversation_id ===
        state.activeConversationId
    ) {
        updateConversationHeader();
    }
}


async function sendMessage(event) {
    event.preventDefault();

    if (
        state.isSending ||
        state.isLoadingMessages
    ) {
        return;
    }

    const content =
        chatInput?.value.trim() || "";

    if (!content) {
        return;
    }

    state.isSending = true;
    updateControls();

    if (!state.activeConversationId) {
        const conversation =
            await createConversation();

        if (!conversation) {
            state.isSending = false;
            updateControls();
            chatInput?.focus();
            return;
        }
    }

    const conversationId =
        normalizeConversationId(
            state.activeConversationId
        );
    const requestId =
        ++state.messageRequestId;
    state.pendingConversationId =
        conversationId;
    const optimisticMessage =
        appendMessage({
            role: "user",
            content
        });

    showTypingIndicator(conversationId);
    setChatStatus(
        companionIdentity.text(
            "{name} is responding..."
        ),
        "loading"
    );

    if (chatInput) {
        chatInput.value = "";
        chatInput.style.height = "";
    }

    const requestController =
        new AbortController();
    state.messageRequestController =
        requestController;
    let inactivityTimer = null;
    let didTimeout = false;
    let streamMessage = null;
    let streamCompleted = false;

    function resetInactivityTimer(
        timeoutMs =
            STREAM_INACTIVITY_TIMEOUT_MS
    ) {
        window.clearTimeout(
            inactivityTimer
        );
        inactivityTimer = window.setTimeout(
            () => {
                didTimeout = true;
                requestController.abort();
            },
            timeoutMs
        );
    }

    function isCurrentRequest() {
        return (
            requestId ===
                state.messageRequestId &&
            conversationId ===
                normalizeConversationId(
                    state.activeConversationId
                )
        );
    }

    try {
        if (supportsResponseStreaming()) {
            resetInactivityTimer();

            await streamChatMessage(
                conversationId,
                content,
                {
                    signal:
                        requestController.signal,
                    onEvent: async ({
                        event: eventType,
                        data
                    }) => {
                        resetInactivityTimer();

                        if (!isCurrentRequest()) {
                            requestController.abort();
                            return;
                        }

                        if (eventType === "start") {
                            if (
                                normalizeConversationId(
                                    data.conversation_id
                                ) !== conversationId
                            ) {
                                requestController.abort();
                                return;
                            }

                            if (
                                data.user_message
                            ) {
                                reconcileOptimisticMessage(
                                    optimisticMessage,
                                    data.user_message
                                );
                            }

                            if (data.conversation) {
                                moveActiveConversationToTop(
                                    data.conversation
                                );
                            }
                        } else if (
                            eventType === "delta"
                        ) {
                            hideTypingIndicator(
                                conversationId
                            );

                            if (
                                !streamMessage ||
                                !streamMessage
                                    .isConnected
                            ) {
                                streamMessage =
                                    createStreamingBerryMessage();
                                chatMessages?.appendChild(
                                    streamMessage
                                );
                            }

                            appendStreamDelta(
                                streamMessage,
                                data.text || ""
                            );
                            scrollChatToBottom(
                                "auto"
                            );
                        } else if (
                            eventType === "complete"
                        ) {
                            hideTypingIndicator(
                                conversationId
                            );

                            if (
                                !streamMessage ||
                                !streamMessage
                                    .isConnected
                            ) {
                                streamMessage =
                                    createStreamingBerryMessage();
                                chatMessages?.appendChild(
                                    streamMessage
                                );
                            }

                            finalizeStreamingMessage(
                                streamMessage,
                                data.message
                            );
                            streamCompleted = true;

                            if (data.conversation) {
                                moveActiveConversationToTop(
                                    data.conversation
                                );
                            }

                            setChatStatus(
                                companionIdentity.text(
                                    "{name}’s response is complete."
                                )
                            );
                            scrollChatToBottom();
                        } else if (
                            eventType === "error"
                        ) {
                            throw new ApiError(
                                data.message ||
                                    companionIdentity.text(
                                        "{name}’s response failed."
                                    ),
                                {
                                    kind:
                                        data.code ||
                                        "stream"
                                }
                            );
                        } else {
                            throw new ApiError(
                                "The response stream contained an unexpected event.",
                                { kind: "stream" }
                            );
                        }
                    }
                }
            );

            if (!streamCompleted) {
                throw new ApiError(
                    "The response stream ended unexpectedly.",
                    { kind: "stream" }
                );
            }
        } else {
            resetInactivityTimer(
                NON_STREAMING_TIMEOUT_MS
            );

            const response =
                await apiRequest(
                `/conversations/${conversationId}/messages`,
                {
                    method: "POST",
                    body: { content },
                    signal:
                        requestController.signal
                }
            );

            resetInactivityTimer(
                NON_STREAMING_TIMEOUT_MS
            );

            if (!isCurrentRequest()) {
                return;
            }

            if (response.user_message) {
                reconcileOptimisticMessage(
                    optimisticMessage,
                    response.user_message
                );
            }

            hideTypingIndicator(
                conversationId
            );
            appendMessage(
                response.assistant_message
            );
            scrollChatToBottom();
            setChatStatus(
                "Message saved."
            );

            moveActiveConversationToTop(
                response.conversation
            );
        }
    } catch (error) {
        hideTypingIndicator(conversationId);

        if (!isCurrentRequest()) {
            return;
        }

        streamMessage?.remove();

        if (didTimeout) {
            error = new ApiError(
                companionIdentity.text(
                    "{name} took too long to respond."
                ),
                { kind: "timeout" }
            );
        }

        if (
            error instanceof ApiError &&
            error.status === 404
        ) {
            await removeMissingConversation(
                conversationId
            );
        } else if (
            normalizeConversationId(
                state.activeConversationId
            ) === conversationId
        ) {
            if (!optimisticMessage?.isConnected) {
                appendMessage({
                    role: "user",
                    content
                });
            }
            appendInlineError(error);
            setChatStatus(
                getFriendlyChatError(error),
                "error"
            );
        }

        if (
            error instanceof ApiError &&
            error.status === 401
        ) {
            clearStoredSession();
            window.setTimeout(() => {
                window.location.replace(
                    "login.html"
                );
            }, 1200);
        } else {
            console.error(
                "Chat response request failed.",
                {
                    status:
                        error instanceof ApiError
                            ? error.status
                            : 0,
                    kind:
                        error instanceof ApiError
                            ? error.kind
                            : "unexpected"
                }
            );
        }
    } finally {
        window.clearTimeout(
            inactivityTimer
        );
        if (
            requestId ===
                state.messageRequestId &&
            state.messageRequestController ===
                requestController
        ) {
            state.messageRequestController =
                null;
            state.isSending = false;
            state.pendingConversationId =
                null;
            hideTypingIndicator(
                conversationId
            );
            updateControls();
            chatInput?.focus();
        }
    }
}


async function deleteActiveConversation() {
    if (
        !state.activeConversationId ||
        state.isDeleting
    ) {
        return;
    }

    const confirmed = window.confirm(
        "Delete this conversation and its messages?"
    );

    if (!confirmed) {
        return;
    }

    discardVoiceRecording();
    stopMessageSpeech({ clearCache: true });
    cancelActiveMessageRequest();

    const conversationId =
        state.activeConversationId;
    state.isDeleting = true;
    updateControls();
    setChatStatus(
        "Deleting conversation...",
        "loading"
    );

    try {
        await apiRequest(
            `/conversations/${conversationId}`,
            { method: "DELETE" }
        );

        await removeMissingConversation(
            conversationId,
            { wasDeleted: true }
        );

        if (state.conversations.length) {
            setChatStatus(
                "Conversation deleted."
            );
        }
    } catch (error) {
        if (handleAuthenticationError(error)) {
            return;
        }

        if (
            error instanceof ApiError &&
            error.status === 404
        ) {
            await removeMissingConversation(
                conversationId
            );
        } else {
            setChatStatus(
                "The conversation could not be deleted. Please try again.",
                "error"
            );
        }
    } finally {
        state.isDeleting = false;
        updateControls();
    }
}


chatForm?.addEventListener(
    "submit",
    sendMessage
);

chatInput?.addEventListener(
    "compositionstart",
    () => {
        state.isComposing = true;
    }
);

chatInput?.addEventListener(
    "compositionend",
    () => {
        state.isComposing = false;
    }
);

chatInput?.addEventListener(
    "keydown",
    (event) => {
        if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.isComposing &&
            !state.isComposing
        ) {
            event.preventDefault();
            chatForm?.requestSubmit();
        }
    }
);

chatInput?.addEventListener(
    "input",
    () => {
        chatInput.style.height = "auto";
        chatInput.style.height =
            `${Math.min(
                chatInput.scrollHeight,
                120
            )}px`;
    }
);

newChatButton?.addEventListener(
    "click",
    createNewConversationFromControl
);

chatMessages?.addEventListener(
    "click",
    (event) => {
        const button = event.target.closest(
            ".message-speech-button"
        );
        if (button) {
            toggleMessageSpeech(button);
        }
    }
);

mobileNewChatButton?.addEventListener(
    "click",
    createNewConversationFromControl
);

voiceRecordButton?.addEventListener(
    "click",
    () => {
        if (voiceRecorderState.phase === "recording") {
            stopVoiceRecording();
            return;
        }
        startVoiceRecording();
    }
);

voiceStopButton?.addEventListener(
    "click",
    () => stopVoiceRecording()
);

voiceCancelButton?.addEventListener(
    "click",
    () => stopVoiceRecording({
        discard: true
    })
);

voiceDeleteButton?.addEventListener(
    "click",
    deleteVoiceRecording
);

voiceTranscribeButton?.addEventListener(
    "click",
    transcribeReadyVoiceRecording
);

voicePreviewAudio?.addEventListener(
    "loadedmetadata",
    () => {
        if (
            Number.isFinite(
                voicePreviewAudio.duration
            )
        ) {
            voiceRecorderState
                .durationSeconds =
                Math.min(
                    MAX_VOICE_RECORDING_SECONDS,
                    Math.max(
                        1,
                        Math.round(
                            voicePreviewAudio
                                .duration
                        )
                    )
                );
            voicePreviewDuration.textContent =
                `Recording ready · ${formatVoiceDuration(
                    voiceRecorderState
                        .durationSeconds
                )}`;
        }
    }
);

mobileDrawerOpenButton?.addEventListener(
    "click",
    openConversationDrawer
);

mobileDrawerCloseButton?.addEventListener(
    "click",
    () => closeConversationDrawer()
);

conversationDrawerBackdrop?.addEventListener(
    "click",
    () => closeConversationDrawer()
);

mobileDeleteChatButton?.addEventListener(
    "click",
    deleteActiveConversation
);

mobileThemeButton?.addEventListener(
    "click",
    () => {
        document
            .getElementById("themeToggle")
            ?.click();
    }
);

document.addEventListener(
    "keydown",
    (event) => {
        if (
            event.key === "Escape" &&
            conversationDrawer?.classList.contains(
                "is-open"
            )
        ) {
            closeConversationDrawer();
        }
    }
);

mobileChatMedia?.addEventListener(
    "change",
    synchronizeDrawerMode
);

clearChatButton?.addEventListener(
    "click",
    deleteActiveConversation
);

document.addEventListener(
    "click",
    (event) => {
        if (
            event.target.closest(
                ".logout-button"
            )
        ) {
            discardVoiceRecording();
            stopMessageSpeech({
                clearCache: true
            });
        }
    },
    true
);

document.addEventListener(
    "waffleberry:voicepreferencechange",
    () => stopMessageSpeech({ clearCache: true })
);

window.addEventListener(
    "pagehide",
    () => {
        discardVoiceRecording();
        stopMessageSpeech({ clearCache: true });
        state.messageRequestController?.abort();
        hideTypingIndicator();
    }
);


async function initializeChat() {
    await window.authReady;

    if (
        !window.WaffleBerryApi
            .getStoredAccessToken()
    ) {
        return;
    }

    const requestedLegacyId = new URLSearchParams(
        window.location.search
    ).get("legacyId");
    const hadSelectedLegacy = Boolean(selectedLegacy);
    if (requestedLegacyId && !selectedLegacy) {
        try {
            await window.WaffleBerryLegacyState.hydratePersisted("active");
            await window.WaffleBerryLegacyState.hydratePersisted("archived");
            selectedLegacy = window.WaffleBerryLegacyState.select(requestedLegacyId);
        } catch {
            window.location.replace(
                `companion-home.html?legacyId=${encodeURIComponent(requestedLegacyId)}`
            );
            return;
        }
    }
    if (requestedLegacyId && !selectedLegacy) {
        window.location.replace("legacy-dashboard.html");
        return;
    }
    if (requestedLegacyId && !hadSelectedLegacy && selectedLegacy) {
        window.location.replace(
            `companion-home.html?legacyId=${encodeURIComponent(selectedLegacy.id)}`
        );
        return;
    }
    if (selectedLegacy) {
        selectedLegacy = await window.WaffleBerryLegacyState
            .ensurePersisted(selectedLegacy.id);
        if (!selectedLegacy?.backendLegacyId || selectedLegacy.status === "archived") {
            window.location.replace(
                `companion-home.html?legacyId=${encodeURIComponent(requestedLegacyId || "")}`
            );
            return;
        }
    }

    liveCallContextReady = Boolean(selectedLegacy?.backendLegacyId);
    updateLiveCallLink();

    updateControls();
    updateVoiceRecorderUi();
    await loadConversations();
    window.WaffleBerryNightModeDiscovery
        ?.notifyAuthenticatedContentReady();
}


initializeChat();
})();
