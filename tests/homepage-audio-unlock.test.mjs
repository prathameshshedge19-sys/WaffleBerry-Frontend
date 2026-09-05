import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const soundscape = await readFile(new URL("../js/legarya-soundscape.js", import.meta.url), "utf8");
const homepage = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("homepage attempts ambience on load and retries from broad user gestures", () => {
  assert.match(soundscape, /void activate\(2\.4\)\.then\(\(started\) =>/);
  assert.match(soundscape, /\["pointerdown", "touchstart", "click", "keydown"\]\.forEach/);
  assert.match(soundscape, /if \(activationPromise\) return activationPromise;/);
  assert.match(soundscape, /await audioContext\.resume\(\)/);
  assert.match(soundscape, /awaitingGesture = enabled && !started/);
});

test("homepage keeps one soundscape asset version and guarded audio graph", () => {
  assert.match(homepage, /js\/legarya-soundscape\.js\?v=3\.2/);
  assert.match(soundscape, /if \(audioContext \|\| !AudioContextClass\) return Boolean\(audioContext\);/);
  assert.match(soundscape, /if \(!enabled\) return;/);
  assert.match(soundscape, /storePreference\(enabled\)/);
});
