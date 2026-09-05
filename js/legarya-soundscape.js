"use strict";

(() => {
const control = document.querySelector("[data-soundscape-toggle]");
const awakenCue = document.querySelector("[data-soundscape-awaken]");

function setAwakenCue(visible) {
  if (!awakenCue) return;
  audioState.bubbleVisible = visible;
  awakenCue.hidden = !visible;
}

function hideAwakenBubble() {
  clearTimeout(awakenBubbleTimer);
  setAwakenCue(false);
}

function showAwakenBubble() {
  if (!isSoundEnabled() || !awakenCue) return;
  clearTimeout(awakenBubbleTimer);
  setAwakenCue(true);
  awakenBubbleTimer = window.setTimeout(() => {
    hideAwakenBubble();
  }, 1800);
}
  if (!control) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const STORAGE_KEY = "legarya_ambient_enabled";
  const MASTER_VOLUME = 3.0;
  const AMBIENCE_GAIN = 2.0;
  const RYA_ARC_GAIN = 3.0;
  const SPEECH_DUCK_RATIO = 0.27;
  const ARC_MIN_RETRIGGER_MS = 140;
  const ARC_MAX_VOICES = 3;
  const PLUCK_MIN_DELAY = 6000;
  const PLUCK_MAX_DELAY = 14000;
  const RESONANCE_MIN_DELAY = 16000;
  const RESONANCE_MAX_DELAY = 30000;
  const persistentSources = new Set();
  const transientSources = new Set();
  const arcVoices = new Set();
  let audioContext = null;
  let masterGain = null;
  let ambienceGain = null;
  let arcSparkBuffers = [];
const audioState = {
  soundEnabledByUser: readPreference() !== false,
  audioContextState: "uninitialized",
  ambienceState: "notStarted",
  unlockState: "notNeeded",
  hasInteracted: false,
  activationInFlight: false,
  unlockListenersInstalled: false,
  bubbleVisible: false,
};
let activationPromise = null;
let awakenBubbleTimer = 0;

const isSoundEnabled = () => audioState.soundEnabledByUser;
const isAmbienceRunning = () => audioState.ambienceState === "running";
  let pluckTimer = 0;
  let resonanceTimer = 0;
  let suspendTimer = 0;
  let lastArcAccentAt = -Infinity;
  let speechActive = false;

  function readPreference() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (value === "true") return true;
      if (value === "false") return false;
    } catch {
      // Storage can be unavailable in strict privacy contexts.
    }
    return null;
  }

  function storePreference(value) {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // The control still works for the current page when storage is blocked.
    }
  }

  function updateControl() {
    if (!AudioContextClass) {
      control.dataset.enabled = "false";
      control.dataset.active = "false";
      control.dataset.awaitingGesture = "false";
      control.setAttribute("aria-pressed", "false");
      control.setAttribute("aria-label", "Ambient sound unavailable");
      control.dataset.tooltip = "Sound unavailable";
      setAwakenCue(false);
      return;
    }
    const awaitingGesture = audioState.unlockState === "required";
    control.dataset.enabled = String(audioState.soundEnabledByUser);
    control.dataset.active = String(isAmbienceRunning());
    control.dataset.awaitingGesture = String(awaitingGesture);
    control.setAttribute("aria-pressed", String(audioState.soundEnabledByUser));
    control.setAttribute(
      "aria-label",
      audioState.soundEnabledByUser ? "Mute sound" : "Turn sound on",
    );
    control.dataset.tooltip = awaitingGesture ? "Tap to awaken Rya" : audioState.soundEnabledByUser ? "Mute sound" : "Turn sound on";
  }

  function trackPersistent(source) {
    persistentSources.add(source);
    source.start();
    return source;
  }

  function makeNoiseBuffer(context) {
    const duration = 13.7;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.72 + white * 0.28;
      channel[index] = previous;
    }
    return buffer;
  }

  function makeArcSparkBuffer(context, duration) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    const channel = buffer.getChannelData(0);
    const initialSnapSamples = Math.floor(context.sampleRate * 0.007);
    let previousWhite = 0;
    let crackleGate = 0.12;

    for (let index = 0; index < channel.length; index += 1) {
      const progress = index / channel.length;
      const white = Math.random() * 2 - 1;
      const highFrequencyNoise = white - previousWhite * 0.72;
      previousWhite = white;

      if (Math.random() < 0.0055) crackleGate = 0.55 + Math.random() * 0.45;
      crackleGate += (0.1 - crackleGate) * 0.04;

      const initialSnap = index < initialSnapSamples
        ? (Math.random() * 2 - 1) * Math.exp(-index / (context.sampleRate * 0.0016)) * 0.95
        : 0;
      const randomSpark = Math.random() < 0.0022
        ? (Math.random() * 2 - 1) * (1.2 + Math.random() * 1.4)
        : 0;
      const tail = Math.pow(1 - progress, 1.45);
      const sample = (initialSnap + highFrequencyNoise * crackleGate * 0.34 + randomSpark) * tail;
      channel[index] = Math.max(-1, Math.min(1, sample));
    }

    return buffer;
  }

  function buildSoundscape() {
    if (audioContext || !AudioContextClass) return Boolean(audioContext);

    try {
      audioContext = new AudioContextClass({ latencyHint: "playback" });
      audioState.audioContextState = audioContext.state;
    } catch {
      return false;
    }
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(audioContext.destination);
    ambienceGain = audioContext.createGain();
    ambienceGain.gain.value = speechActive ? AMBIENCE_GAIN * SPEECH_DUCK_RATIO : AMBIENCE_GAIN;
    ambienceGain.connect(masterGain);

    const droneFilter = audioContext.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 460;
    droneFilter.Q.value = 0.48;
    const dronePanner = audioContext.createStereoPanner();
    const tonalBedGain = audioContext.createGain();
    tonalBedGain.gain.value = 0.92;
    droneFilter.connect(tonalBedGain).connect(dronePanner).connect(ambienceGain);

    [
      { frequency: 55, type: "sine", detune: -3.2, gain: 0.075 },
      { frequency: 82.41, type: "triangle", detune: 2.1, gain: 0.055 },
      { frequency: 110, type: "sine", detune: 1.4, gain: 0.038 },
      { frequency: 146.83, type: "triangle", detune: -1.8, gain: 0.027 },
    ].forEach((voice) => {
      const oscillator = audioContext.createOscillator();
      const voiceGain = audioContext.createGain();
      oscillator.type = voice.type;
      oscillator.frequency.value = voice.frequency;
      oscillator.detune.value = voice.detune;
      voiceGain.gain.value = voice.gain;
      oscillator.connect(voiceGain).connect(droneFilter);
      trackPersistent(oscillator);
    });

    const filterBreath = audioContext.createOscillator();
    const filterBreathDepth = audioContext.createGain();
    filterBreath.type = "sine";
    filterBreath.frequency.value = 0.031;
    filterBreathDepth.gain.value = 92;
    filterBreath.connect(filterBreathDepth).connect(droneFilter.frequency);
    trackPersistent(filterBreath);

    const tonalBreath = audioContext.createOscillator();
    const tonalBreathDepth = audioContext.createGain();
    tonalBreath.type = "sine";
    tonalBreath.frequency.value = 0.017;
    tonalBreathDepth.gain.value = 0.075;
    tonalBreath.connect(tonalBreathDepth).connect(tonalBedGain.gain);
    trackPersistent(tonalBreath);

    const droneDrift = audioContext.createOscillator();
    const droneDriftDepth = audioContext.createGain();
    droneDrift.frequency.value = 0.013;
    droneDriftDepth.gain.value = 0.16;
    droneDrift.connect(droneDriftDepth).connect(dronePanner.pan);
    trackPersistent(droneDrift);

    const noise = audioContext.createBufferSource();
    const noiseHighpass = audioContext.createBiquadFilter();
    const noiseLowpass = audioContext.createBiquadFilter();
    const noiseGain = audioContext.createGain();
    const noisePanner = audioContext.createStereoPanner();
    noise.buffer = makeNoiseBuffer(audioContext);
    arcSparkBuffers = Array.from({ length: 7 }, (_, index) =>
      makeArcSparkBuffer(audioContext, 0.14 + index * 0.025)
    );
    noise.loop = true;
    noiseHighpass.type = "highpass";
    noiseHighpass.frequency.value = 105;
    noiseLowpass.type = "lowpass";
    noiseLowpass.frequency.value = 620;
    noiseLowpass.Q.value = 0.3;
    noiseGain.gain.value = 0.0032;
    noise.connect(noiseHighpass).connect(noiseLowpass).connect(noiseGain).connect(noisePanner).connect(ambienceGain);
    trackPersistent(noise);

    const airBreath = audioContext.createOscillator();
    const airBreathDepth = audioContext.createGain();
    airBreath.frequency.value = 0.021;
    airBreathDepth.gain.value = 0.0011;
    airBreath.connect(airBreathDepth).connect(noiseGain.gain);
    trackPersistent(airBreath);

    const airDrift = audioContext.createOscillator();
    const airDriftDepth = audioContext.createGain();
    airDrift.frequency.value = 0.009;
    airDriftDepth.gain.value = 0.24;
    airDrift.connect(airDriftDepth).connect(noisePanner.pan);
    trackPersistent(airDrift);

    return true;
  }

  function holdAndRamp(parameter, target, duration) {
    const now = audioContext.currentTime;
    if (typeof parameter.cancelAndHoldAtTime === "function") parameter.cancelAndHoldAtTime(now);
    else {
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(parameter.value, now);
    }
    parameter.linearRampToValueAtTime(target, now + duration);
  }

  function playArcAccent(detail = {}) {
    if (!isSoundEnabled() || !isAmbienceRunning() || document.hidden || !audioContext || !masterGain || !arcSparkBuffers.length) return;
    if (audioContext.state !== "running" || arcVoices.size >= ARC_MAX_VOICES) return;
    const eventAt = performance.now();
    const sinceLastAccent = eventAt - lastArcAccentAt;
    if (sinceLastAccent < ARC_MIN_RETRIGGER_MS) return;
    lastArcAccentAt = eventAt;

    const strength = Math.min(1, Math.max(0, Number(detail.strength) || 0));
    const length = Math.min(1, Math.max(0, (Number(detail.length) || 0) / 1.9));
    const paths = Math.min(6, Math.max(1, Number(detail.pathCount) || 1));
    const intensity = Math.min(1, 0.55 + Math.max(0, strength - 0.8) * 0.6 + paths * 0.025 + length * 0.08);
    const clusteredGain = sinceLastAccent < 320 ? 0.62 : 1;
    const sparkBuffer = arcSparkBuffers[Math.floor(Math.random() * arcSparkBuffers.length)];
    const playbackRate = 0.88 + Math.random() * 0.24;
    const duration = sparkBuffer.duration / playbackRate;
    const startAt = audioContext.currentTime + 0.006;
    const endAt = startAt + duration;
    const voice = {};
    const envelope = audioContext.createGain();
    const resonanceFilter = audioContext.createBiquadFilter();
    const panner = audioContext.createStereoPanner();
    resonanceFilter.type = "lowpass";
    resonanceFilter.frequency.value = 6200 + intensity * 1400;
    resonanceFilter.Q.value = 0.18;
    panner.pan.value = Math.min(0.68, Math.max(-0.68, (Number(detail.pan) || 0) * 0.42 + Math.random() * 0.18 - 0.09));
    envelope.gain.setValueAtTime(0.0001, startAt);
    const peakGain = RYA_ARC_GAIN * intensity * clusteredGain * (speechActive ? 0.12 : 1);
    envelope.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.0015);
    envelope.gain.exponentialRampToValueAtTime(peakGain * 0.34, startAt + Math.min(0.045, duration * 0.3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);
    envelope.connect(resonanceFilter).connect(panner).connect(masterGain);
    arcVoices.add(voice);

    const noise = audioContext.createBufferSource();
    const noiseFilter = audioContext.createBiquadFilter();
    const noiseLevel = audioContext.createGain();
    noise.buffer = sparkBuffer;
    noise.playbackRate.value = playbackRate;
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 900 + intensity * 500 + Math.random() * 350;
    noiseFilter.Q.value = 0.22;
    noiseLevel.gain.value = 0.019 + intensity * 0.006;
    noise.connect(noiseFilter).connect(noiseLevel).connect(envelope);
    transientSources.add(noise);
    noise.addEventListener("ended", () => {
      transientSources.delete(noise);
      noise.disconnect();
      noiseFilter.disconnect();
      noiseLevel.disconnect();
      envelope.disconnect();
      resonanceFilter.disconnect();
      panner.disconnect();
      arcVoices.delete(voice);
    }, { once: true });
    noise.start(startAt);
  }

  function scheduleResonance() {
    clearTimeout(resonanceTimer);
    if (!isAmbienceRunning() || !isSoundEnabled() || document.hidden || !audioContext) return;
    const delay = RESONANCE_MIN_DELAY + Math.random() * (RESONANCE_MAX_DELAY - RESONANCE_MIN_DELAY);
    resonanceTimer = window.setTimeout(() => {
      playResonance();
      scheduleResonance();
    }, delay);
  }

  function schedulePluck() {
    clearTimeout(pluckTimer);
    if (!isAmbienceRunning() || !isSoundEnabled() || document.hidden || !audioContext) return;
    const delay = PLUCK_MIN_DELAY + Math.random() * (PLUCK_MAX_DELAY - PLUCK_MIN_DELAY);
    pluckTimer = window.setTimeout(() => {
      playPluck();
      schedulePluck();
    }, delay);
  }

  function playPluck() {
    if (!isAmbienceRunning() || !masterGain || audioContext.state !== "running") return;
    const openTones = [110, 146.83, 164.81, 220, 293.66];
    const frequency = openTones[Math.floor(Math.random() * openTones.length)];
    const startAt = audioContext.currentTime + 0.035;
    const duration = 4.2 + Math.random() * 2.8;
    const envelope = audioContext.createGain();
    const warmthFilter = audioContext.createBiquadFilter();
    const panner = audioContext.createStereoPanner();
    warmthFilter.type = "lowpass";
    warmthFilter.frequency.setValueAtTime(1150, startAt);
    warmthFilter.frequency.exponentialRampToValueAtTime(360, startAt + duration);
    warmthFilter.Q.value = 1.15;
    panner.pan.value = Math.random() * 1.1 - 0.55;
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.exponentialRampToValueAtTime(0.022, startAt + 0.045);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    envelope.connect(warmthFilter).connect(panner).connect(ambienceGain);

    const partials = [
      { ratio: 1, level: 0.72, type: "triangle" },
      { ratio: 2.003, level: 0.16, type: "sine" },
    ];
    let remainingPartials = partials.length;
    partials.forEach((partial) => {
      const oscillator = audioContext.createOscillator();
      const partialGain = audioContext.createGain();
      oscillator.type = partial.type;
      oscillator.frequency.value = frequency * partial.ratio;
      oscillator.detune.value = Math.random() * 4 - 2;
      partialGain.gain.value = partial.level;
      oscillator.connect(partialGain).connect(envelope);
      transientSources.add(oscillator);
      oscillator.addEventListener("ended", () => {
        transientSources.delete(oscillator);
        oscillator.disconnect();
        partialGain.disconnect();
        remainingPartials -= 1;
        if (!remainingPartials) {
          envelope.disconnect();
          warmthFilter.disconnect();
          panner.disconnect();
        }
      }, { once: true });
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.1);
    });
  }

  function playResonance() {
    if (!isAmbienceRunning() || !masterGain || audioContext.state !== "running") return;
    const ancientIntervals = [220, 246.94, 293.66, 329.63];
    const baseFrequency = ancientIntervals[Math.floor(Math.random() * ancientIntervals.length)];
    const startAt = audioContext.currentTime + 0.04;
    const duration = 5.5 + Math.random() * 2.8;
    const resonanceGain = audioContext.createGain();
    const panner = audioContext.createStereoPanner();
    panner.pan.value = Math.random() * 0.9 - 0.45;
    resonanceGain.gain.setValueAtTime(0.0001, startAt);
    resonanceGain.gain.exponentialRampToValueAtTime(0.010, startAt + 1.55);
    resonanceGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    resonanceGain.connect(panner).connect(ambienceGain);

    const partials = [
      { ratio: 1, level: 1 },
      { ratio: 2.01, level: 0.24 },
      { ratio: 3.015, level: 0.08 },
    ];
    let remainingPartials = partials.length;
    partials.forEach((partial) => {
      const oscillator = audioContext.createOscillator();
      const partialGain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = baseFrequency * partial.ratio;
      oscillator.detune.value = Math.random() * 5 - 2.5;
      partialGain.gain.value = partial.level;
      oscillator.connect(partialGain).connect(resonanceGain);
      transientSources.add(oscillator);
      oscillator.addEventListener("ended", () => {
        transientSources.delete(oscillator);
        oscillator.disconnect();
        partialGain.disconnect();
        remainingPartials -= 1;
        if (!remainingPartials) {
          resonanceGain.disconnect();
          panner.disconnect();
        }
      }, { once: true });
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.1);
    });
  }

  function activate(fadeDuration = 1.8, { fromGesture = false } = {}) {
    let gestureResumeFailed = false;
    let gestureResumePromise = null;
    if (fromGesture && !document.hidden && isSoundEnabled() && buildSoundscape()) {
      try {
        gestureResumePromise = audioContext.resume();
      } catch {
        gestureResumeFailed = true;
      }
    }
    if (activationPromise) {
      gestureResumePromise?.catch(() => {});
      return activationPromise;
    }
    const attempt = (async () => {
      clearTimeout(suspendTimer);
      if (!isSoundEnabled() || document.hidden || !buildSoundscape()) return false;
      if (isAmbienceRunning() && audioContext.state === "running") return true;
      if (gestureResumeFailed) return false;
      audioState.activationInFlight = true;
      audioState.ambienceState = "starting";
      try {
        await (gestureResumePromise || audioContext.resume());
      } catch {
        audioState.audioContextState = audioContext?.state || "suspended";
        audioState.ambienceState = "notStarted";
        return false;
      }
      audioState.audioContextState = audioContext.state;
      if (!isSoundEnabled() || document.hidden || audioContext.state !== "running") {
        audioState.ambienceState = "notStarted";
        return false;
      }
      audioState.ambienceState = "running";
      audioState.unlockState = "unlocked";
      holdAndRamp(masterGain.gain, MASTER_VOLUME, fadeDuration);
      schedulePluck();
      scheduleResonance();
      updateControl();
      return true;
    })().finally(() => {
      audioState.activationInFlight = false;
    });
    activationPromise = attempt;
    attempt.then(
      () => { if (activationPromise === attempt) activationPromise = null; },
      () => { if (activationPromise === attempt) activationPromise = null; },
    );
    return attempt;
  }

  function deactivate(fadeDuration = 0.65) {
    audioState.ambienceState = "notStarted";
    clearTimeout(pluckTimer);
    clearTimeout(resonanceTimer);
    clearTimeout(suspendTimer);
    if (!audioContext || !masterGain || audioContext.state === "closed") {
      updateControl();
      return;
    }
    holdAndRamp(masterGain.gain, 0, fadeDuration);
    suspendTimer = window.setTimeout(() => {
      if (!isAmbienceRunning() && audioContext?.state === "running") audioContext.suspend().catch(() => {});
    }, fadeDuration * 1000 + 100);
    updateControl();
  }

  function setSpeechDucking(isSpeaking) {
    speechActive = Boolean(isSpeaking);
    if (!audioContext || !ambienceGain || audioContext.state === "closed") return;
    holdAndRamp(
      ambienceGain.gain,
      speechActive ? AMBIENCE_GAIN * SPEECH_DUCK_RATIO : AMBIENCE_GAIN,
      speechActive ? 0.32 : 0.72,
    );
  }

  function removeFirstInteractionListeners() {
    ["pointerdown", "touchstart", "click", "keydown"].forEach((eventName) => {
      document.removeEventListener(eventName, onFirstInteraction, true);
    });
    audioState.unlockListenersInstalled = false;
  }

  function installFirstInteractionListeners() {
    if (audioState.unlockListenersInstalled) return;
    ["pointerdown", "touchstart", "click", "keydown"].forEach((eventName) => {
      document.addEventListener(eventName, onFirstInteraction, true);
    });
    audioState.unlockListenersInstalled = true;
  }

  async function onFirstInteraction(event) {
    if (control.contains(event.target)) return;
    audioState.hasInteracted = true;
    hideAwakenBubble();
    if (!isSoundEnabled()) return;
    audioState.unlockState = "required";
    updateControl();
    if (await activate(2.4, { fromGesture: true })) removeFirstInteractionListeners();
    else updateControl();
  }

  function teardown() {
    audioState.ambienceState = "notStarted";
    audioState.audioContextState = "closed";
    audioState.unlockState = "notNeeded";
    hideAwakenBubble();
    clearTimeout(pluckTimer);
    clearTimeout(resonanceTimer);
    clearTimeout(suspendTimer);
    removeFirstInteractionListeners();
    persistentSources.forEach((source) => {
      try { source.stop(); } catch { /* Already stopped. */ }
      source.disconnect();
    });
    transientSources.forEach((source) => {
      try { source.stop(); } catch { /* Already stopped. */ }
      source.disconnect();
    });
    persistentSources.clear();
    transientSources.clear();
    arcVoices.clear();
    if (audioContext && audioContext.state !== "closed") audioContext.close().catch(() => {});
    audioContext = null;
    masterGain = null;
    ambienceGain = null;
    arcSparkBuffers = [];
  }

  control.addEventListener("click", async () => {
    audioState.hasInteracted = true;
    hideAwakenBubble();
    if (isSoundEnabled()) {
      audioState.soundEnabledByUser = false;
      audioState.unlockState = "notNeeded";
      hideAwakenBubble();
      storePreference(false);
      window.dispatchEvent(new Event("legarya-sound-muted"));
      removeFirstInteractionListeners();
      deactivate(0.65);
      updateControl();
      return;
    }
    audioState.soundEnabledByUser = true;
    audioState.unlockState = "required";
    storePreference(true);
    installFirstInteractionListeners();
    updateControl();
    if (await activate(1.8, { fromGesture: true })) removeFirstInteractionListeners();
    else {
      audioState.unlockState = "required";
      updateControl();
    }
  });

  installFirstInteractionListeners();
  window.addEventListener("rya-energy-arc", (event) => playArcAccent(event.detail));
  window.addEventListener("legarya-rya-speech", (event) => setSpeechDucking(event.detail?.active));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) deactivate(0.6);
    else if (isSoundEnabled() && audioState.hasInteracted) activate(1.5);
  });
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) deactivate(0.25);
    else teardown();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && isSoundEnabled() && audioState.hasInteracted) activate(1.5);
  });

  if (!AudioContextClass) {
    audioState.soundEnabledByUser = false;
    control.disabled = true;
  }
  updateControl();
  if (isSoundEnabled()) {
    audioState.unlockState = "required";
    showAwakenBubble();
    updateControl();
    void activate(2.4).then((started) => {
      audioState.unlockState = isSoundEnabled() && !started ? "required" : "unlocked";
      if (started) removeFirstInteractionListeners();
      updateControl();
    });
  }
})();
