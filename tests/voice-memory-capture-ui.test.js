"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(
    path.join(__dirname, "..", file), "utf8"
);
const html = read("story-session.html");
const integration = read("js/story-session.js");
const recorderScript = read("js/voice-memory-recorder.js");
const styles = read("css/style.css");

function element() {
    const listeners = {};
    return {
        hidden: false,
        disabled: false,
        dataset: {},
        textContent: "",
        value: "",
        focused: false,
        addEventListener(type, listener) {
            listeners[type] = listener;
        },
        focus() {
            this.focused = true;
        },
        click() {
            return listeners.click?.();
        },
        dispatchEvent(event) {
            return listeners[event.type]?.(event);
        },
        setAttribute(name, value) {
            this[name] = value;
        },
        setSelectionRange() {},
        keydown(key) {
            return listeners.keydown?.({
                key,
                preventDefault() {}
            });
        }
    };
}

function recorderHarness({
    permissionError = null,
    transcribeAudio = async () => ({ text: "Voice transcript" }),
    textareaValue = ""
} = {}) {
    const elements = {
        button: element(), panel: element(), recording: element(),
        ready: element(), transcribing: element(), decision: element(),
        review: element(), reviewDuration: element(), edited: element(),
        characterCount: element(), lengthError: element(),
        recordingLabel: element(), timer: element(),
        readyDuration: element(), stop: element(), cancel: element(),
        transcribe: element(), cancelTranscription: element(),
        again: element(), discard: element(), replace: element(),
        reviewAgain: element(), reviewDiscard: element(),
        append: element(), keep: element(), liveStatus: element(),
        againDialogBackdrop: element(), againDialog: element(),
        confirmAgain: element(), cancelAgain: element()
    };
    const textarea = element();
    textarea.value = textareaValue;
    const track = { stopped: 0, stop() { this.stopped += 1; } };
    const stream = { getTracks: () => [track] };
    let constraints = null;
    class FakeMediaRecorder {
        static isTypeSupported(type) {
            return type === "audio/webm;codecs=opus";
        }
        constructor(receivedStream, options) {
            this.stream = receivedStream;
            this.mimeType = options?.mimeType || "audio/webm";
            this.listeners = {};
        }
        addEventListener(type, listener) {
            this.listeners[type] = listener;
        }
        start() {}
        stop() {
            this.listeners.dataavailable?.({ data: new Blob(["audio"]) });
            this.listeners.stop?.();
        }
    }
    const window = {
        isSecureContext: true,
        MediaRecorder: FakeMediaRecorder,
        setInterval: () => 1,
        clearInterval() {},
        setTimeout(callback) { callback(); },
        addEventListener() {}
    };
    const navigator = {
        mediaDevices: {
            async getUserMedia(value) {
                constraints = value;
                if (permissionError) {
                    throw permissionError;
                }
                return stream;
            }
        }
    };
    const context = vm.createContext({
        window, navigator, Blob, Date, console, Event, AbortController
    });
    vm.runInContext(recorderScript, context);
    const notices = [];
    const controller = window.WaffleBerryVoiceMemoryRecorder.create(
        elements,
        {
            notify: (message) => notices.push(message),
            transcribeAudio,
            textarea
        }
    );
    return {
        controller, elements, track, notices,
        getConstraints: () => constraints,
        api: window.WaffleBerryVoiceMemoryRecorder,
        textarea
    };
}

test("Guided Story exposes accessible recording states and controls", () => {
    assert.match(html, /id="voiceMemoryButton"/);
    assert.match(html, /aria-label="Record your answer"/);
    assert.match(html, /id="voiceMemoryStop"[\s\S]*type="button"/);
    assert.match(html, /id="voiceMemoryCancel"[\s\S]*type="button"/);
    assert.match(html, /id="voiceMemoryAgain"[\s\S]*type="button"/);
    assert.match(html, /id="voiceMemoryDiscard"[\s\S]*type="button"/);
    assert.match(html, /voiceMemoryLiveStatus[\s\S]*aria-live="polite"/);
});

test("recording module has explicit states and a five-minute maximum", () => {
    for (const state of [
        "idle", "requesting_permission", "recording",
        "stopping", "recorded", "transcribing", "transcribed",
        "reviewing_transcript", "error"
    ]) {
        assert.match(recorderScript, new RegExp(`"${state}"`));
    }
    assert.match(recorderScript, /const MAX_RECORDING_SECONDS = 5 \* 60/);
    assert.match(recorderScript, /maximumReached: true/);
});

test("successful recording uses safe constraints, creates a Blob, and releases tracks", async () => {
    const harness = recorderHarness();
    assert.equal(harness.controller.getState(), "idle");
    await harness.controller.start();
    assert.equal(harness.controller.getState(), "recording");
    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.getConstraints())),
        { audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        } }
    );
    assert.equal(harness.controller.stop(), true);
    assert.equal(harness.controller.getState(), "recorded");
    assert.ok(harness.controller.getBlob() instanceof Blob);
    assert.equal(harness.track.stopped, 1);
    assert.equal(harness.elements.again.focused, true);
});

async function readyRecording(harness) {
    await harness.controller.start();
    harness.controller.stop();
    assert.equal(harness.controller.getState(), "recorded");
}

test("recorded state transcribes the actual Blob into an empty textarea", async () => {
    let received;
    const harness = recorderHarness({
        transcribeAudio: async (...args) => {
            received = args;
            return { text: "  मी मुंबईमध्ये शिक्षिका होते.  " };
        }
    });
    await readyRecording(harness);
    assert.equal(harness.elements.transcribe.hidden, false);
    await harness.controller.transcribe();
    assert.equal(received[0], harness.controller.getBlob());
    assert.ok(received[2].signal instanceof AbortSignal);
    assert.equal(harness.textarea.value, "मी मुंबईमध्ये शिक्षिका होते.");
    assert.equal(harness.controller.getState(), "reviewing_transcript");
    assert.equal(harness.textarea.focused, true);
});

test("existing text requires explicit Replace, Append, or Cancel", async () => {
    const replace = recorderHarness({ textareaValue: "Typed answer" });
    await readyRecording(replace);
    await replace.controller.transcribe();
    assert.equal(replace.textarea.value, "Typed answer");
    assert.equal(replace.elements.decision.hidden, false);
    replace.elements.replace.click();
    assert.equal(replace.textarea.value, "Voice transcript");

    const append = recorderHarness({ textareaValue: "Typed answer  " });
    await readyRecording(append);
    await append.controller.transcribe();
    append.elements.append.click();
    assert.equal(append.textarea.value, "Typed answer\n\nVoice transcript");

    const keep = recorderHarness({ textareaValue: "Keep this" });
    await readyRecording(keep);
    await keep.controller.transcribe();
    keep.elements.keep.click();
    assert.equal(keep.textarea.value, "Keep this");
    assert.equal(keep.controller.getTranscriptCandidate(), "Voice transcript");
});

test("successful transcription enters an editable review state", async () => {
    const harness = recorderHarness({
        transcribeAudio: async () => ({ text: "माझी शाळा Mumbai मध्ये होती." })
    });
    await readyRecording(harness);
    await harness.controller.transcribe();
    assert.equal(harness.controller.getState(), "reviewing_transcript");
    assert.equal(harness.elements.review.hidden, false);
    assert.equal(harness.textarea.focused, true);
    assert.equal(harness.controller.isTranscriptEdited(), false);
    assert.equal(harness.elements.edited.hidden, true);

    harness.textarea.value = "माझी शाळा मुंबईमध्ये होती.";
    harness.textarea.dispatchEvent(new Event("input"));
    assert.equal(harness.controller.isTranscriptEdited(), true);
    assert.equal(harness.elements.edited.hidden, false);

    harness.textarea.value = harness.controller.getTranscriptOriginal();
    harness.textarea.dispatchEvent(new Event("input"));
    assert.equal(harness.controller.isTranscriptEdited(), false);
});

test("Record again confirms, preserves text, and replaces only the recording", async () => {
    const harness = recorderHarness();
    await readyRecording(harness);
    await harness.controller.transcribe();
    const answer = harness.textarea.value;
    const oldBlob = harness.controller.getBlob();

    harness.elements.reviewAgain.click();
    assert.equal(harness.elements.againDialogBackdrop.hidden, false);
    harness.elements.cancelAgain.click();
    assert.equal(harness.controller.getState(), "reviewing_transcript");
    assert.equal(harness.controller.getBlob(), oldBlob);

    harness.elements.reviewAgain.click();
    await harness.elements.confirmAgain.click();
    assert.equal(harness.textarea.value, answer);
    assert.equal(harness.controller.getState(), "recording");
    assert.equal(harness.controller.getBlob(), null);
});

test("Discard recording retains the authoritative answer text", async () => {
    const harness = recorderHarness();
    await readyRecording(harness);
    await harness.controller.transcribe();
    harness.textarea.value += " Extra context.";
    harness.textarea.dispatchEvent(new Event("input"));
    const answer = harness.textarea.value;
    harness.elements.reviewDiscard.click();
    assert.equal(harness.controller.getState(), "idle");
    assert.equal(harness.controller.getBlob(), null);
    assert.equal(harness.controller.getDuration(), 0);
    assert.equal(harness.textarea.value, answer);
});

test("successful save cleanup clears voice state but preserves answer ownership", async () => {
    const harness = recorderHarness();
    await readyRecording(harness);
    await harness.controller.transcribe();
    harness.textarea.value = "Edited final answer";
    harness.textarea.dispatchEvent(new Event("input"));
    harness.controller.completeSave();
    assert.equal(harness.controller.getState(), "idle");
    assert.equal(harness.controller.getBlob(), null);
    assert.equal(harness.controller.getDuration(), 0);
    assert.equal(harness.controller.getTranscriptCandidate(), "");
    assert.equal(harness.controller.getTranscriptOriginal(), "");
    assert.equal(harness.controller.isTranscriptEdited(), false);
    assert.equal(harness.textarea.value, "Edited final answer");
});

test("story save uses only the visible textarea and cleans up after success", () => {
    assert.match(integration, /const content\s*=\s*reply\.value;/);
    assert.match(integration, /requestBerryResponse\(\s*content,\s*messageId\s*\)/);
    assert.match(integration, /if \(!response\)[\s\S]*return;[\s\S]*voiceMemoryRecorder\.completeSave\(\)/);
    assert.match(integration, /pendingAnswer\?\.content === content/);
    assert.doesNotMatch(html, /type="hidden"[^>]*(transcript|answer)/i);
    assert.doesNotMatch(integration, /getTranscriptCandidate\(\).*streamPersistedStory/s);
});

test("combined answers over the backend limit are not silently truncated", async () => {
    const typed = "x".repeat(11995);
    const harness = recorderHarness({ textareaValue: typed });
    await readyRecording(harness);
    await harness.controller.transcribe();
    harness.elements.append.click();
    assert.equal(harness.textarea.value, typed);
    assert.equal(harness.controller.getTranscriptCandidate(), "Voice transcript");
    assert.equal(harness.elements.lengthError.hidden, false);
    assert.equal(harness.notices.at(-1), "Your answer is too long. Shorten it before saving.");
});

test("transcript cleanup preserves Unicode and only normalizes blank lines", () => {
    assert.equal(
        recorderHarness().api.normalizeTranscript(
            "  KJ Somaiya\r\n\r\n\r\nशाळेत 1998.  "
        ),
        "KJ Somaiya\n\nशाळेत 1998."
    );
});

test("automatic multilingual transcripts preserve language, script, names, and facts", async () => {
    const samples = [
        "I studied at KJ Somaiya College in 1998.",
        "मी १९९८ मध्ये KJ Somaiya शाळेत शिकले.",
        "मैं 12 मार्च 2001 को मुंबई गया था।",
        "Mi Pune madhye Fergusson College la shiklo.",
        "Maine kal office mein presentation diya, it went well.",
        "आम्ही Mumbai ला गेलो and met Priya on 5 June 2010.",
        "मैं Delhi में काम करता था and my manager was Anjali.",
        "Aai ने सांगितलं ki Rahul 2024 मध्ये Tata Motors join झाला।"
    ];

    for (const transcript of samples) {
        const harness = recorderHarness({
            transcribeAudio: async () => ({ text: transcript })
        });
        await readyRecording(harness);
        await harness.controller.transcribe();
        assert.equal(harness.textarea.value, transcript);
        assert.equal(harness.controller.getTranscriptOriginal(), transcript);
        assert.equal(harness.controller.isTranscriptEdited(), false);
    }
});

test("voice memory UI has no language selector or script conversion path", () => {
    assert.doesNotMatch(html, /detected language|language selector|language dropdown/i);
    assert.doesNotMatch(html, /<select[^>]*(language|locale)/i);
    assert.doesNotMatch(recorderScript, /translate|transliterate|romanize|devanagari/i);
    assert.doesNotMatch(integration, /language(_code)?\s*:/i);
});

test("cancellation returns to recorded and retains the Blob", async () => {
    let capturedSignal;
    const harness = recorderHarness({
        transcribeAudio: (_blob, _filename, { signal }) => {
            capturedSignal = signal;
            return new Promise(() => {});
        }
    });
    await readyRecording(harness);
    const blob = harness.controller.getBlob();
    harness.controller.transcribe();
    assert.equal(harness.controller.getState(), "transcribing");
    assert.equal(await harness.controller.transcribe(), false);
    assert.equal(harness.controller.cancelTranscription(), true);
    assert.equal(capturedSignal.aborted, true);
    assert.equal(harness.controller.getState(), "recorded");
    assert.equal(harness.controller.getBlob(), blob);
});

test("transcription failure retains recording for retry", async () => {
    const harness = recorderHarness({
        transcribeAudio: async () => {
            const error = new Error("private provider detail");
            error.kind = "network";
            throw error;
        }
    });
    await readyRecording(harness);
    const blob = harness.controller.getBlob();
    await harness.controller.transcribe();
    assert.equal(harness.controller.getState(), "recorded");
    assert.equal(harness.controller.getBlob(), blob);
    assert.equal(
        harness.notices.at(-1),
        "We couldn't transcribe this recording. Please try again."
    );
});

test("supported MIME selection and browser-default fallback are present", () => {
    for (const type of [
        "audio/webm;codecs=opus", "audio/webm",
        "audio/ogg;codecs=opus", "audio/mp4"
    ]) {
        assert.match(recorderScript, new RegExp(type.replace(";", "\\;")));
    }
    assert.match(recorderScript, /new window\.MediaRecorder\(stream, \{ mimeType \}\)/);
    assert.match(recorderScript, /new window\.MediaRecorder\(stream\)/);
});

test("permission errors are safe and expose the explicit error state", async () => {
    const harness = recorderHarness({
        permissionError: { name: "NotAllowedError" }
    });
    await harness.controller.start();
    assert.equal(harness.controller.getState(), "error");
    assert.match(harness.notices[0], /Microphone access was denied/);
});

test("cancel, discard, duplicate guards, and unload cleanup are implemented", () => {
    assert.match(recorderScript, /if \(state\.phase !== "recording"\)/);
    assert.match(recorderScript, /stop\(\{ discard: true \}\)/);
    assert.match(recorderScript, /function discard\(\)/);
    assert.match(recorderScript, /window\.addEventListener\("pagehide", cleanup\)/);
    assert.match(recorderScript, /window\.addEventListener\("beforeunload", cleanup\)/);
    assert.match(recorderScript, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
});

test("timer, Night Mode, touch targets, and reduced motion remain accessible", () => {
    assert.match(recorderScript, /window\.setInterval\(updateTimer, 1000\)/);
    assert.match(recorderScript, /window\.clearInterval/);
    assert.match(styles, /\.voice-memory-actions button[\s\S]*min-height:\s*44px/);
    assert.match(styles, /body\.dark-mode \.voice-memory-panel/);
    assert.match(styles, /prefers-reduced-motion[\s\S]*\.voice-memory-pulse/);
    assert.match(html, /aria-label="Recording duration"/);
});

test("transcription UI is accessible and bounded before upload", () => {
    assert.match(html, /id="voiceMemoryTranscribe"[\s\S]*Transcribe recording/);
    assert.match(html, /Turning your voice into text/);
    assert.match(html, /Replace existing answer/);
    assert.match(html, /Append transcript/);
    assert.match(html, /aria-label="Cancel transcription"/);
    assert.match(recorderScript, /const MAX_TRANSCRIPTION_BYTES = 10 \* 1024 \* 1024/);
    assert.match(recorderScript, /state\.blob\.size > MAX_TRANSCRIPTION_BYTES/);
    assert.match(recorderScript, /SUPPORTED_TRANSCRIPTION_TYPES/);
    assert.match(recorderScript, /event\.key === "Escape"/);
    assert.match(html, /Transcript ready/);
    assert.match(html, /Review and edit your answer before saving\./);
    assert.match(html, /maxlength="12000"/);
    assert.match(html, /role="dialog"[\s\S]*aria-modal="true"/);
    assert.match(styles, /body\.dark-mode \.voice-memory-dialog/);
});

test("recording remains memory-only and uses the shared transcription helper", () => {
    assert.doesNotMatch(recorderScript, /fetch\(|XMLHttpRequest|FormData|apiRequest/);
    assert.doesNotMatch(recorderScript, /localStorage|sessionStorage|indexedDB|caches\./i);
    assert.doesNotMatch(recorderScript, /OpenAI|Sarvam|saveMemory|extractMemory/i);
    assert.match(integration, /transcribeAudio: api\.transcribeAudio/);
    assert.match(integration, /requestBerryResponse\(\s*content,\s*messageId\s*\)/);
});
