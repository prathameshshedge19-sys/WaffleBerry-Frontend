"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("chat.html");
const script = read("js/chat.js");
const styles = read("css/style.css");
const voiceBlock = script.match(
    /\/\* Phase 9\.1: local browser-only voice recording\. \*\/[\s\S]*?\/\* End Phase 9\.1 local voice recording\. \*\//
)?.[0] || "";

test("composer exposes an accessible microphone button", () => {
    assert.match(html, /id="voiceRecordButton"/);
    assert.match(html, /aria-label="Record voice message"/);
    assert.match(styles, /\.voice-record-button/);
});

test("every recording action is a non-submit button", () => {
    for (const id of [
        "voiceRecordButton",
        "voiceStopButton",
        "voiceCancelButton",
        "voiceDeleteButton"
    ]) {
        assert.match(
            html,
            new RegExp(`id="${id}"[\\s\\S]{0,120}type="button"|type="button"[\\s\\S]{0,120}id="${id}"`),
            id
        );
    }
});

test("microphone permission requests audio-only constraints", () => {
    assert.match(voiceBlock, /getUserMedia\(\{\s*audio:\s*\{/);
    assert.match(voiceBlock, /echoCancellation:\s*true/);
    assert.match(voiceBlock, /noiseSuppression:\s*true/);
    assert.doesNotMatch(voiceBlock, /video\s*:/);
});

test("MediaRecorder and mediaDevices are feature detected", () => {
    assert.match(voiceBlock, /!navigator\.mediaDevices\s*\?\.getUserMedia/);
    assert.match(voiceBlock, /typeof window\.MediaRecorder/);
});

test("recording selects the first supported MIME type", () => {
    for (const type of [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus"
    ]) {
        assert.match(script, new RegExp(type.replace(";", "\\;")));
    }
    assert.match(voiceBlock, /MediaRecorder[\s\S]*\.isTypeSupported\(type\)/);
    assert.match(voiceBlock, /new window\.MediaRecorder\(\s*stream\s*\)/);
});

test("a named sixty-second recording maximum is enforced", () => {
    assert.match(script, /const MAX_VOICE_RECORDING_SECONDS = 60;/);
    assert.match(voiceBlock, /duration >=\s*MAX_VOICE_RECORDING_SECONDS[\s\S]*stopVoiceRecording\(\)/);
    assert.match(html, /00:00 \/ 01:00/);
});

test("timer updates during recording and is always cleared", () => {
    assert.match(voiceBlock, /window\.setInterval\(/);
    assert.match(voiceBlock, /window\.clearInterval\(/);
    assert.match(voiceBlock, /formatVoiceDuration/);
});

test("stopping releases every microphone track", () => {
    assert.match(voiceBlock, /stream\?\.getTracks\(\)\.forEach\([\s\S]*track\.stop\(\)/);
    assert.match(voiceBlock, /function stopVoiceRecording[\s\S]*finally \{[\s\S]*releaseVoiceMicrophone\(\)/);
});

test("cancelling discards chunks and releases the microphone", () => {
    assert.match(script, /voiceCancelButton\?\.addEventListener\([\s\S]*discard:\s*true/);
    assert.match(voiceBlock, /stopResult === "discard"[\s\S]*voiceRecorderState\.chunks = \[\]/);
    assert.match(voiceBlock, /function discardVoiceRecording[\s\S]*stopVoiceRecording\(\{ discard: true \}\)/);
});

test("recording URLs are revoked on deletion or replacement", () => {
    assert.match(voiceBlock, /URL\.revokeObjectURL\(/);
    assert.match(voiceBlock, /function deleteVoiceRecording\(\)[\s\S]*revokeVoiceObjectUrl\(\)/);
    assert.match(voiceBlock, /finishStoppedVoiceRecording[\s\S]*revokeVoiceObjectUrl\(\)[\s\S]*URL\.createObjectURL/);
});

test("conversation changes discard context-bound recordings", () => {
    assert.match(script, /function selectConversation[\s\S]*voiceRecorderState\.contextId[\s\S]*discardVoiceRecording\(\)/);
    assert.match(script, /function createNewConversationFromControl\(\)[\s\S]*discardVoiceRecording\(\)/);
});

test("recording controls do not clear typed composer content", () => {
    assert.doesNotMatch(voiceBlock, /chatInput\.(?:value|textContent)\s*=\s*["']{2}/);
    assert.match(script, /const content =\s*chatInput\?\.value\.trim\(\)/);
});

test("voice upload remains isolated from JSON and chat streaming paths", () => {
    assert.doesNotMatch(voiceBlock, /apiRequest|streamChatMessage|fetch\(|FormData|XMLHttpRequest/);
    assert.match(html, /is not uploaded yet/);
});

test("transcription is explicit and never automatically sends", () => {
    assert.match(html, /id="voiceTranscribeButton"/);
    assert.match(voiceBlock, /async function transcribeReadyVoiceRecording/);
    assert.doesNotMatch(voiceBlock, /transcribeReadyVoiceRecording[\s\S]*sendMessage\(/);
});

test("permission and recorder errors have safe user-facing copy", () => {
    assert.match(voiceBlock, /case "NotAllowedError"/);
    assert.match(voiceBlock, /case "NotFoundError"/);
    assert.match(voiceBlock, /case "NotReadableError"/);
    assert.match(voiceBlock, /case "AbortError"/);
    assert.match(html, /id="voiceRecordingError"[\s\S]*role="alert"/);
});

test("mobile drawer lifecycle remains present", () => {
    assert.match(script, /openConversationDrawer/);
    assert.match(script, /closeConversationDrawer/);
    assert.match(script, /conversationDrawerBackdrop\?\.addEventListener/);
    assert.match(styles, /\.conversation-drawer\.is-open/);
});

test("existing text send and streaming behavior remains present", () => {
    assert.match(script, /chatForm\?\.addEventListener\(\s*"submit",\s*sendMessage/);
    assert.match(script, /await streamChatMessage\(/);
    assert.match(script, /appendStreamDelta\(/);
    assert.match(html, /id="sendButton"[\s\S]*type="submit"/);
});

test("voice controls are accessible and motion-safe", () => {
    assert.match(html, /aria-label="Play voice message preview"/);
    assert.match(html, /aria-label="Stop voice recording"/);
    assert.match(html, /aria-label="Cancel voice recording"/);
    assert.match(html, /aria-label="Delete voice recording"/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*voice-recording-pulse[\s\S]*animation:\s*none/);
});
