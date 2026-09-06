import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const soundscape = await readFile(new URL("../js/legarya-soundscape.js", import.meta.url), "utf8");
const homepage = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("homepage uses one lifecycle state and retries ambience from broad user gestures", () => {
  assert.match(soundscape, /void activate\(2\.4\)\.then\(\(started\) =>/);
  assert.match(soundscape, /\["pointerdown", "touchstart", "click", "keydown"\]\.forEach/);
  assert.match(soundscape, /if \(activationPromise\) \{/);
  assert.match(soundscape, /audioContext\.resume\(\)/);
  assert.match(soundscape, /const audioState = \{/);
  assert.match(soundscape, /audioState\.ambienceState = "running"/);
  assert.match(soundscape, /audioState\.unlockState = isSoundEnabled\(\) && !started \? "required" : "unlocked"/);
});

test("homepage exposes the awaken cue and keeps one versioned soundscape asset", () => {
  assert.match(homepage, /js\/legarya-soundscape\.js\?v=3\.6/);
  assert.match(homepage, /data-soundscape-awaken/);
  assert.match(soundscape, /if \(audioContext \|\| !AudioContextClass\) return Boolean\(audioContext\);/);
  assert.match(soundscape, /audioState\.soundEnabledByUser = false/);
  assert.match(soundscape, /storePreference\(false\)/);
  assert.match(soundscape, /installFirstInteractionListeners\(\)/);
});

test("homepage mute, unmute, and preserved speech integrations remain explicit", () => {
  assert.match(soundscape, /audioState\.soundEnabledByUser \? "Mute sound" : "Turn sound on"/);
  assert.match(soundscape, /window\.dispatchEvent\(new Event\("legarya-sound-muted"\)\)/);
  assert.match(soundscape, /window\.addEventListener\("rya-energy-arc",/);
  assert.match(soundscape, /window\.addEventListener\("legarya-rya-speech",/);
});

test("homepage bubble timing is independent from mobile audio unlock listeners", () => {
  assert.match(soundscape, /function showAwakenBubble\(\)/);
  assert.match(soundscape, /}, 2600\);/);
  assert.match(soundscape, /hideAwakenBubble\(\);/);
  assert.match(soundscape, /installFirstInteractionListeners\(\)/);
  assert.match(soundscape, /activate\(2\.4, \{ fromGesture: true \}\)/);
  assert.match(soundscape, /activate\(1\.8, \{ fromGesture: true \}\)/);
  assert.match(soundscape, /audioContext\.resume\(\)/);
});

test("homepage awaken bubble is centered, tappable, and keeps the shared unlock path", () => {
  assert.match(homepage, /<button class="soundscape-awaken" type="button" data-soundscape-awaken/);
  assert.match(homepage, /aria-label="Tap to awaken Rya"/);
  assert.match(soundscape, /if \(control\.contains\(event\.target\)\) return;/);
  assert.match(soundscape, /activate\(2\.4, \{ fromGesture: true \}\)/);
});

test("homepage avoids audio for muted users and keeps one audio graph", () => {
  assert.match(soundscape, /if \(!isSoundEnabled\(\) \|\| !awakenCue\) return;/);
  assert.match(soundscape, /if \(audioContext \|\| !AudioContextClass\) return Boolean\(audioContext\);/);
  assert.match(soundscape, /audioState\.unlockListenersInstalled/);
  assert.match(soundscape, /persistentSources = new Set\(\)/);
});
