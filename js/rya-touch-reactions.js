"use strict";

(() => {
  const soundControl = document.querySelector("[data-soundscape-toggle]");
  const speech = window.LegaryaRyaSpeech;
  if (!soundControl || !speech) return;

  const SOUND_KEY = "legarya_ambient_enabled";
  const OWNER = "touch-reaction";
  const RYA_TOUCH_COOLDOWN_MS = 6000;
  const clips = Array.from({ length: 7 }, (_, index) =>
    `assets/audio/rya-reactions/rya-touch-${String(index + 1).padStart(2, "0")}.mp3`
  );
  const reaction = new Audio();
  reaction.preload = "metadata";
  reaction.playsInline = true;

  let bag = [];
  let lastClip = "";
  let cooldownUntil = 0;
  let fadeFrame = 0;

  const diagnostics = window.__ryaTouchDiagnostics = {
    cooldownMs: RYA_TOUCH_COOLDOWN_MS,
    validTouches: 0,
    plays: 0,
    ignoredCooldown: 0,
    ignoredSpeechLock: 0,
    ignoredMuted: 0,
    playedClips: [],
  };

  function storedValue(storage, key) {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function soundIsEnabled() {
    return storedValue(localStorage, SOUND_KEY) !== "false" && soundControl.dataset.enabled !== "false";
  }

  function shuffle(values) {
    for (let index = values.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    return values;
  }

  function nextClip() {
    if (!bag.length) {
      bag = shuffle([...clips]);
      if (bag.length > 1 && bag[bag.length - 1] === lastClip) {
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
    }
    const selected = bag.pop();
    lastClip = selected;
    return selected;
  }

  function fadeVolume(target, duration) {
    if (fadeFrame) cancelAnimationFrame(fadeFrame);
    const initial = reaction.volume;
    const startedAt = performance.now();
    const step = (now) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
      reaction.volume = initial + (target - initial) * progress;
      if (progress < 1) fadeFrame = requestAnimationFrame(step);
      else fadeFrame = 0;
    };
    fadeFrame = requestAnimationFrame(step);
  }

  function finish() {
    if (fadeFrame) cancelAnimationFrame(fadeFrame);
    fadeFrame = 0;
    speech.release(OWNER);
  }

  function stop() {
    reaction.pause();
    reaction.currentTime = 0;
    reaction.volume = 1;
    finish();
  }

  async function playTouchReaction() {
    diagnostics.validTouches += 1;
    if (!soundIsEnabled()) {
      diagnostics.ignoredMuted += 1;
      return;
    }
    if (performance.now() < cooldownUntil) {
      diagnostics.ignoredCooldown += 1;
      return;
    }
    if (!speech.claim(OWNER)) {
      diagnostics.ignoredSpeechLock += 1;
      return;
    }

    const selected = nextClip();
    reaction.src = selected;
    reaction.volume = 0;
    reaction.currentTime = 0;
    try {
      await reaction.play();
      if (!speech.activate(OWNER)) {
        stop();
        return;
      }
      cooldownUntil = performance.now() + RYA_TOUCH_COOLDOWN_MS;
      diagnostics.plays += 1;
      diagnostics.playedClips.push(selected);
      fadeVolume(1, 180);
    } catch {
      finish();
    }
  }

  window.addEventListener("rya-body-touch", playTouchReaction);
  reaction.addEventListener("ended", finish);
  reaction.addEventListener("error", finish);
  window.addEventListener("legarya-sound-muted", stop);
  window.addEventListener("pagehide", stop);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
})();
