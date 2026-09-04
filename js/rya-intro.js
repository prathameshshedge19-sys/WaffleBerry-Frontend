"use strict";

(() => {
  const ryaNavigationLink = document.querySelector('.site-nav a[href="#rya"]');
  const ryaSection = document.querySelector("#rya");
  const soundControl = document.querySelector("[data-soundscape-toggle]");
  const speech = window.LegaryaRyaSpeech;
  if (!ryaNavigationLink || !ryaSection || !soundControl || !speech) return;

  const SOUND_KEY = "legarya_ambient_enabled";
  const OWNER = "intro";
  const intro = new Audio("assets/audio/rya-intro.mp3?v=2.0");
  intro.preload = "metadata";
  intro.playsInline = true;

  let pending = false;
  let settleFrame = 0;
  let startTimer = 0;
  let fadeFrame = 0;

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

  function cancelScheduling() {
    pending = false;
    clearTimeout(startTimer);
    startTimer = 0;
    if (settleFrame) cancelAnimationFrame(settleFrame);
    settleFrame = 0;
  }

  function fadeVolume(target, duration, onComplete) {
    if (fadeFrame) cancelAnimationFrame(fadeFrame);
    const initial = intro.volume;
    const startedAt = performance.now();
    const step = (now) => {
      const progress = Math.max(0, Math.min(1, (now - startedAt) / duration));
      intro.volume = initial + (target - initial) * progress;
      if (progress < 1) fadeFrame = requestAnimationFrame(step);
      else {
        fadeFrame = 0;
        onComplete?.();
      }
    };
    fadeFrame = requestAnimationFrame(step);
  }

  function finishSpeech() {
    cancelScheduling();
    if (fadeFrame) cancelAnimationFrame(fadeFrame);
    fadeFrame = 0;
    speech.release(OWNER);
  }

  function stopIntro({ fade = true } = {}) {
    cancelScheduling();
    if (intro.paused) {
      finishSpeech();
      return;
    }
    const stop = () => {
      intro.pause();
      intro.currentTime = 0;
      intro.volume = 1;
      finishSpeech();
    };
    if (fade && speech.isActive() && speech.getOwner() === OWNER) fadeVolume(0, 140, stop);
    else stop();
  }

  async function beginAudiblePlayback() {
    startTimer = 0;
    if (!pending || !soundIsEnabled() || document.hidden) {
      stopIntro({ fade: false });
      return;
    }
    pending = false;
    try {
      intro.currentTime = 0;
      if (intro.paused) await intro.play();
      if (!speech.activate(OWNER)) {
        stopIntro({ fade: false });
        return;
      }
      fadeVolume(1, 260);
    } catch {
      stopIntro({ fade: false });
    }
  }

  function waitForScrollToSettle() {
    const startedAt = performance.now();
    let previousY = scrollY;
    let stableFrames = 0;

    const check = (now) => {
      if (!pending) return;
      const movement = Math.abs(scrollY - previousY);
      previousY = scrollY;
      stableFrames = movement < 0.75 ? stableFrames + 1 : 0;
      const elapsed = now - startedAt;
      if ((elapsed > 220 && stableFrames >= 6) || elapsed > 1800) {
        settleFrame = 0;
        startTimer = window.setTimeout(beginAudiblePlayback, 240);
        return;
      }
      settleFrame = requestAnimationFrame(check);
    };

    settleFrame = requestAnimationFrame(check);
  }

  ryaNavigationLink.addEventListener("click", () => {
    if (!soundIsEnabled()) return;
    if (speech.getOwner() && speech.getOwner() !== OWNER) return;
    if (pending || !intro.paused || speech.getOwner() === OWNER) stopIntro({ fade: false });
    else cancelScheduling();
    if (!speech.claim(OWNER)) return;
    pending = true;
    intro.volume = 0;
    intro.currentTime = 0;

    const priming = intro.play();
    if (priming && typeof priming.catch === "function") {
      priming.catch(() => stopIntro({ fade: false }));
    }
    waitForScrollToSettle();
  });

  intro.addEventListener("ended", finishSpeech);
  intro.addEventListener("error", () => stopIntro({ fade: false }));
  window.addEventListener("legarya-sound-muted", () => stopIntro());
  window.addEventListener("pagehide", () => stopIntro({ fade: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopIntro({ fade: false });
  });
})();
