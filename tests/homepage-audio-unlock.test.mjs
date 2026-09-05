import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const soundscape = await readFile(new URL("../js/legarya-soundscape.js", import.meta.url), "utf8");
const homepage = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("homepage uses one lifecycle state and retries ambience from broad user gestures", () => {
  assert.match(soundscape, /void activate\(2\.4\)\.then\(\(started\) =>/);
  assert.match(soundscape, /\["pointerdown", "touchstart", "click", "keydown"\]\.forEach/);
  assert.match(soundscape, /if \(activationPromise\) return activationPromise;/);
  assert.match(soundscape, /await audioContext\.resume\(\)/);
  assert.match(soundscape, /const audioState = \{/);
  assert.match(soundscape, /audioState\.ambienceState = "running"/);
  assert.match(soundscape, /audioState\.unlockState = isSoundEnabled\(\) && !started \? "required" : "unlocked"/);
});

test("homepage exposes the awaken cue and keeps one versioned soundscape asset", () => {
  assert.match(homepage, /js\/legarya-soundscape\.js\?v=3\.4/);
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
