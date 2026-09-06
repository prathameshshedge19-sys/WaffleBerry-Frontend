"use strict";

(() => {
  const VOICE_SILENCE_TIMEOUT_MS = 10000;
  const VOICE_MAX_RECORDING_MS = 300000;
  const VOICE_ANALYSIS_INTERVAL_MS = 100;
  const VOICE_CALIBRATION_MS = 700;
  const VOICE_MIN_RMS = 0.018;
  const VOICE_MAX_RMS = 0.08;
  const VOICE_NOISE_MULTIPLIER = 2.8;
  const VOICE_MEANINGFUL_FRAMES = 3;
  const SUPPORTED_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  const { apiRequest, authenticatedFetch } = window.LegaryaAuthApi;
  const input = document.querySelector("#messageInput");
  const microphone = document.querySelector("#microphoneButton");
  const status = document.querySelector("#chatStatus");
  const settingsButton = document.querySelector("#voiceSettingsButton");
  const dialog = document.querySelector("#voiceSettings");
  if (!input || !microphone) return;

  let state = "idle";
  let chatBusy = false;
  let recorder = null;
  let stream = null;
  let audioContext = null;
  let analyserTimer = null;
  let maximumTimer = null;
  let startedAt = 0;
  let lastMeaningfulAt = 0;
  let voiceDraft = false;
  let selectedVoice = "marin";
  let playing = null;
  let contextVersion = 0;
  const playbackAudio = new Audio();
  window.LegaryaAudioOwnership?.protect(playbackAudio);
  const audioCache = new Map();
  const icons = Object.freeze({
    microphone: '<svg viewBox="0 0 24 24" focusable="false"><rect x="8" y="3" width="8" height="12" rx="4"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg>',
    speaker: '<svg viewBox="0 0 24 24" focusable="false"><path d="M4 10v4h4l5 4V6l-5 4H4Z"></path><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"></path></svg>',
    stop: '<svg viewBox="0 0 24 24" focusable="false"><rect x="7" y="7" width="10" height="10" rx="1.2"></rect></svg>',
    loading: '<svg class="voice-spinner" viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="8"></circle></svg>',
  });
  const setIcon = (element, name) => { const target = element?.querySelector("[data-voice-icon], .voice-icon, span"); if (target) { target.classList.add("voice-icon"); target.innerHTML = icons[name]; } };

  const setStatus = (text = "", error = false) => {
    status.textContent = text;
    status.classList.toggle("error-state", error);
  };

  const renderState = () => {
    const recording = state === "recording";
    const transcribing = state === "transcribing";
    microphone.classList.toggle("is-recording", recording);
    microphone.disabled = chatBusy || transcribing;
    microphone.setAttribute("aria-label", recording ? "Stop recording" : transcribing ? "Transcribing recording" : "Start voice input");
    microphone.title = recording ? "Stop recording" : transcribing ? "Transcribing..." : "Voice input";
    setIcon(microphone, recording ? "stop" : transcribing ? "loading" : "microphone");
    microphone.querySelector("span").textContent = recording ? "■" : transcribing ? "…" : "🎙";
    setIcon(microphone, recording ? "stop" : transcribing ? "loading" : "microphone");
    document.body.dataset.voiceState = state;
  };

  const stopSpeech = () => {
    if (!playing) return;
    playing.audio.pause();
    playing.audio.currentTime = 0;
    playing.button?.classList.remove("is-playing");
    if (playing.button) {
      playing.button.setAttribute("aria-label", "Play voice response");
      playing.button.title = "Play response";
      playing.button.setAttribute("aria-label", playing.button.dataset.hasPlayed ? "Replay response" : "Play response");
      playing.button.title = playing.button.dataset.hasPlayed ? "Replay response" : "Play response";
      setIcon(playing.button, "speaker");
    }
    playing = null;
    document.body.classList.remove("rya-speaking");
  };

  const unlockPlayback = () => {
    if (playbackAudio.dataset.unlocked) return;
    playbackAudio.dataset.unlocked = "true";
    playbackAudio.src = "data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSAAAAAAgICA";
    void playbackAudio.play().then(() => { playbackAudio.pause(); playbackAudio.currentTime = 0; }).catch(() => {});
  };

  const cleanupRecording = () => {
    if (analyserTimer) clearInterval(analyserTimer);
    if (maximumTimer) clearTimeout(maximumTimer);
    analyserTimer = maximumTimer = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (audioContext) void audioContext.close().catch(() => {});
    audioContext = null;
  };

  const stopRecording = () => {
    if (state !== "recording" || !recorder) return;
    state = "transcribing";
    renderState();
    setStatus("Transcribing…");
    recorder.stop();
  };

  const recorderType = () => SUPPORTED_TYPES.find((type) => window.MediaRecorder?.isTypeSupported(type)) || "";

  const transcribe = async (blob, durationMs, mimeType) => {
    const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
    const data = new FormData();
    data.append("audio", blob, `recording.${extension}`);
    data.append("duration_ms", String(Math.round(durationMs)));
    try {
      const response = await authenticatedFetch("/voice/transcribe", { method: "POST", body: data });
      const result = await response.json();
      const transcript = typeof result.text === "string" ? result.text.trim() : "";
      if (!transcript) throw new Error("Empty transcription");
      input.value = input.value.trim() ? `${input.value.trim()} ${transcript}` : transcript;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      voiceDraft = true;
      state = "ready_to_review";
      setStatus("Transcript ready to review.");
      input.focus();
    } catch (error) {
      console.warn("[LegaRya Voice] Transcription failed.", error);
      state = "idle";
      setStatus("I couldn’t transcribe that recording. Try again.", true);
    } finally {
      renderState();
    }
  };

  const beginRecording = async () => {
    stopSpeech();
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatus("Voice input isn’t supported in this browser. You can still type your message.", true);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = recorderType();
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks = [];
      recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener("stop", () => {
        const duration = Date.now() - startedAt;
        const actualType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: actualType });
        cleanupRecording();
        recorder = null;
        void transcribe(blob, duration, actualType);
      }, { once: true });
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();
      await audioContext.resume();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const calibration = [];
      const activityFrames = [];
      startedAt = lastMeaningfulAt = Date.now();
      recorder.start(500);
      state = "recording";
      renderState();
      setStatus("Listening… tap Stop when you’re done.");
      analyserTimer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        const elapsed = Date.now() - startedAt;
        if (elapsed <= VOICE_CALIBRATION_MS) calibration.push(rms);
        const noise = calibration.length ? calibration.reduce((sum, value) => sum + value, 0) / calibration.length : VOICE_MIN_RMS;
        const threshold = Math.min(VOICE_MAX_RMS, Math.max(VOICE_MIN_RMS, noise * VOICE_NOISE_MULTIPLIER));
        activityFrames.push(rms > threshold);
        if (activityFrames.length > 5) activityFrames.shift();
        if (activityFrames.filter(Boolean).length >= VOICE_MEANINGFUL_FRAMES) lastMeaningfulAt = Date.now();
        if (Date.now() - lastMeaningfulAt >= VOICE_SILENCE_TIMEOUT_MS) stopRecording();
      }, VOICE_ANALYSIS_INTERVAL_MS);
      maximumTimer = setTimeout(stopRecording, VOICE_MAX_RECORDING_MS);
    } catch (error) {
      cleanupRecording();
      recorder = null;
      state = "idle";
      renderState();
      const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      const missing = error?.name === "NotFoundError";
      const busy = error?.name === "NotReadableError" || error?.name === "AbortError";
      setStatus(denied ? "Microphone access was denied. Allow it in your browser settings to use voice input."
        : missing ? "No microphone was found. You can still type your message."
        : busy ? "The microphone is unavailable or already in use. Try again."
        : "Voice recording couldn’t start. You can still type your message.", true);
    }
  };

  const fetchAudio = async (path, body, key) => {
    if (audioCache.has(key)) return audioCache.get(key);
    const response = await authenticatedFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const url = URL.createObjectURL(await response.blob());
    audioCache.set(key, url);
    return url;
  };

  const play = async (button, path, body, key, expectedContext = contextVersion) => {
    if (playing?.button === button) return stopSpeech();
    stopSpeech();
    try {
      button?.classList.add("is-loading");
      button?.setAttribute("aria-label", "Loading audio");
      if (button) button.title = "Loading audio";
      setIcon(button, "loading");
      const url = await fetchAudio(path, body, key);
      if (expectedContext !== contextVersion) return;
      const audio = playbackAudio;
      audio.src = url;
      playing = { audio, button };
      button?.classList.remove("is-loading");
      button?.classList.add("is-playing");
      if (button) button.dataset.hasPlayed = "true";
      setIcon(button, "stop");
      button?.setAttribute("aria-label", "Stop speaking");
      if (button) button.title = "Stop speaking";
      document.body.classList.add("rya-speaking");
      const finish = () => stopSpeech();
      audio.onended = finish;
      audio.onerror = finish;
      await audio.play();
    } catch (error) {
      button?.classList.remove("is-loading");
      stopSpeech();
      console.warn("[LegaRya Voice] Playback failed.", error);
      setStatus("Voice playback unavailable.", true);
    }
  };

  const attachAssistant = (row, messageId, { autoPlay = false } = {}) => {
    if (!row || !Number.isInteger(Number(messageId)) || row.querySelector(".message-speech-button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "message-speech-button";
      button.setAttribute("aria-label", "Play voice response");
      button.title = "Play response";
      button.querySelector("span")?.classList.add("voice-icon");
      setIcon(button, "speaker");
    button.innerHTML = "<span aria-hidden=\"true\">♪</span>";
    button.innerHTML = '<span class="voice-icon" data-voice-icon aria-hidden="true"></span>';
    setIcon(button, "speaker");
    button.addEventListener("click", () => void play(button, "/voice/synthesize", { message_id: Number(messageId), voice: selectedVoice }, `${messageId}:${selectedVoice}`));
    row.querySelector(".message-label")?.append(button);
    if (autoPlay) void play(button, "/voice/synthesize", { message_id: Number(messageId), voice: selectedVoice }, `${messageId}:${selectedVoice}`);
  };

  const selectVoice = async (voice) => {
    const result = await apiRequest("/voice/settings", { method: "PUT", authenticated: true, body: { voice } });
    selectedVoice = result.voice;
    dialog.querySelectorAll("[data-voice]").forEach((card) => card.classList.toggle("is-selected", card.dataset.voice === selectedVoice));
  };

  const initializeSettings = async () => {
    try {
      const result = await apiRequest("/voice/settings", { authenticated: true });
      selectedVoice = result.voice;
      dialog?.querySelectorAll("[data-voice]").forEach((card) => card.classList.toggle("is-selected", card.dataset.voice === selectedVoice));
    } catch (error) {
      console.warn("[LegaRya Voice] Could not load voice preference.", error);
    }
  };

  microphone.addEventListener("click", () => { unlockPlayback(); state === "recording" ? stopRecording() : void beginRecording(); });
  input.addEventListener("input", () => { if (!input.value.trim()) voiceDraft = false; });
  settingsButton?.addEventListener("click", () => { dialog.hidden = false; settingsButton.closest(".account-menu").hidden = true; });
  dialog?.querySelector("[data-voice-close]")?.addEventListener("click", () => { dialog.hidden = true; stopSpeech(); });
  dialog?.querySelector(".voice-settings-backdrop")?.addEventListener("click", () => { dialog.hidden = true; stopSpeech(); });
  dialog?.addEventListener("click", (event) => {
    const select = event.target.closest("[data-select-voice]");
    if (select) void selectVoice(select.dataset.selectVoice).catch(() => setStatus("Voice preference couldn’t be saved.", true));
    const preview = event.target.closest("[data-preview-voice]");
    if (preview) void play(preview, "/voice/preview", { voice: preview.dataset.previewVoice }, `preview:${preview.dataset.previewVoice}`);
  });
  window.addEventListener("pagehide", () => { stopSpeech(); if (state === "recording") stopRecording(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { stopSpeech(); if (state === "recording") stopRecording(); } });
  renderState();
  void initializeSettings();

  window.LegaryaVoice = Object.freeze({
    attachAssistant,
    async prepareLive() {
      stopSpeech();
      if (state === "recording") stopRecording();
      const deadline = Date.now() + 35000;
      while (state === "transcribing") {
        if (Date.now() > deadline) throw new Error("Your dictation is still being prepared. Please try Live Voice again shortly.");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    },
    consumeVoiceOrigin() { const result = voiceDraft; voiceDraft = false; state = "idle"; renderState(); return result; },
    restoreVoiceOrigin() { voiceDraft = true; state = "ready_to_review"; renderState(); },
    isCapturing() { return state === "recording" || state === "transcribing"; },
    setChatBusy(active) { chatBusy = Boolean(active); renderState(); },
    stopAll() { contextVersion += 1; stopSpeech(); if (state === "recording") stopRecording(); },
    stopSpeech,
    constants: Object.freeze({ VOICE_SILENCE_TIMEOUT_MS, VOICE_MAX_RECORDING_MS, VOICE_MIN_RMS, VOICE_MAX_RMS, VOICE_MEANINGFUL_FRAMES }),
  });
})();
