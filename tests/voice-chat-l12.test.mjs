import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const voice = await readFile(new URL("../js/voice-chat.js", import.meta.url), "utf8");
const chat = await readFile(new URL("../js/chat.js", import.meta.url), "utf8");
const legacy = await readFile(new URL("../js/legacy-chat.js", import.meta.url), "utf8");
const html = await readFile(new URL("../chat.html", import.meta.url), "utf8");
const legacyHtml = await readFile(new URL("../legacy-chat.html", import.meta.url), "utf8");

test("voice recording uses browser media APIs and supported mobile formats", () => {
  assert.match(voice, /getUserMedia\(\{ audio: true \}\)/);
  assert.match(voice, /new MediaRecorder/);
  assert.match(voice, /audio\/webm;codecs=opus/);
  assert.match(voice, /audio\/mp4/);
  assert.match(voice, /audio\/ogg;codecs=opus/);
  assert.match(voice, /VOICE_MAX_RECORDING_MS = 300000/);
});

test("meaningful sustained silence stops after ten seconds, not a short pause", () => {
  assert.match(voice, /VOICE_SILENCE_TIMEOUT_MS = 10000/);
  assert.match(voice, /VOICE_MEANINGFUL_FRAMES = 3/);
  assert.match(voice, /noise \* VOICE_NOISE_MULTIPLIER/);
  assert.match(voice, /activityFrames\.filter\(Boolean\)\.length >= VOICE_MEANINGFUL_FRAMES/);
  assert.match(voice, /Date\.now\(\) - lastMeaningfulAt >= VOICE_SILENCE_TIMEOUT_MS/);
});

test("stopping recording automatically transcribes into an editable unsent composer", () => {
  assert.match(voice, /recorder\.addEventListener\("stop"[\s\S]*void transcribe\(/);
  assert.match(voice, /authenticatedFetch\("\/voice\/transcribe"/);
  assert.match(voice, /input\.value = input\.value\.trim\(\)/);
  assert.doesNotMatch(voice, /requestSubmit\(/);
  assert.match(voice, /Transcript ready to review/);
});

test("permission and transcription failures preserve text chat", () => {
  assert.match(voice, /NotAllowedError/);
  assert.match(voice, /NotFoundError/);
  assert.match(voice, /NotReadableError/);
  assert.match(voice, /I couldn\u2019t transcribe that recording\. Try again\./);
});

test("voice origin controls auto-speech while typed turns remain silent", () => {
  assert.match(chat, /input_mode: voiceOrigin \? "voice" : "text"/);
  assert.match(chat, /attachAssistant\(pending, completedMessageId, \{ autoPlay: voiceOrigin \}\)/);
  assert.match(legacy, /input_mode:voiceOrigin\?"voice":"text"/);
  assert.match(legacy, /attachAssistant\(pending,messageId,\{autoPlay:voiceOrigin\}\)/);
});

test("completed messages have manual replay and navigation stops stale speech", () => {
  assert.match(voice, /message-speech-button/);
  assert.match(voice, /message_id: Number\(messageId\)/);
  assert.match(voice, /playing\.audio\.pause\(\)/);
  assert.match(chat, /const loadConversation = async \(id\) => \{\s*window\.LegaryaVoice\?\.stopAll\(\)/);
  assert.match(legacy, /const loadConversation=async id=>\{window\.LegaryaVoice\?\.stopAll\(\)/);
});

test("voice settings expose only Marin and Cedar with accessible controls", () => {
  for (const markup of [html, legacyHtml]) {
    assert.match(markup, /id="microphoneButton"[^>]*aria-label="Start voice input"/);
    assert.match(markup, /id="voiceSettingsButton"/);
    assert.match(markup, /data-voice="marin"/);
    assert.match(markup, /data-voice="cedar"/);
    assert.match(markup, /data-preview-voice="marin"[^>]*aria-label="Preview Marin voice"/);
  }
});
