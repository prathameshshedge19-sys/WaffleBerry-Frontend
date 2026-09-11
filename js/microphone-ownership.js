"use strict";

// Shared acquisition boundary; L12's recorder and review flow stay untouched.
// Web Locks serialize permission requests and capture across same-origin tabs.
(() => {
  const devices = navigator.mediaDevices;
  if (!devices?.getUserMedia || window.LegaryaMicrophone) return;
  const original = devices.getUserMedia.bind(devices);
  let reserved = false;
  let navigation = 0;
  const streams = new Set();
  const busy = () => new DOMException("Another voice feature is using the microphone.", "NotReadableError");

  async function capture(constraints, requireLock = true, { signal } = {}) {
    if (!constraints?.audio) return original(constraints);
    const owner = requireLock ? "l15" : "l12";
    if (!navigator.locks && requireLock) throw new DOMException("Live voice requires microphone ownership support.", "NotSupportedError");
    if (reserved) throw busy();
    reserved = true;
    const startedNavigation = navigation;
    let unlock;
    let released = false;
    let focused = false;
    let captured;
    const account = window.LegaryaAuthApi?.getSessionEpoch?.();
    const check = () => {
      if (signal?.aborted || startedNavigation !== navigation || account !== window.LegaryaAuthApi?.getSessionEpoch?.())
        throw new DOMException("Microphone request was cancelled.", "AbortError");
    };
    const release = () => {
      if (released) return;
      released = true;
      signal?.removeEventListener("abort", cancel);
      // Keep the reservation until native focus release has completed; an old
      // release must never abandon the next owner's focus.
      const done = () => { reserved = false; unlock?.(); };
      if (focused) Promise.resolve(window.LegaryaPlatform?.releaseAudioFocus?.()).catch(() => {}).finally(done);
      else done();
    };
    const cancel = () => { captured?.getTracks().forEach(track => track.stop()); };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      check();
      if (navigator.locks) await new Promise((resolve, reject) => {
        navigator.locks.request("legarya-microphone", { ifAvailable: true }, async (lock) => {
          if (!lock) { reject(busy()); return; }
          await new Promise((done) => { unlock = done; resolve(); });
        }).catch(reject);
      });
      check();
      if (window.LegaryaPlatform?.kind === "android") {
        await window.LegaryaPlatform.armMicrophone(owner);
        check();
        if (owner === "l15") {
          const focus = await window.LegaryaPlatform.requestAudioFocus(owner);
          focused = Boolean(focus?.granted);
          check();
          if (!focus?.granted) throw new DOMException("Audio focus is unavailable.", "NotReadableError");
        }
      }
      const stream = await original(constraints);
      captured = stream;
      try { check(); } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        throw error;
      }
      streams.add(stream);
      const tracks = stream.getAudioTracks();
      const stopped = new Set();
      const finished = (track) => {
        stopped.add(track);
        if (tracks.every((t) => stopped.has(t) || t.readyState === "ended")) {
          streams.delete(stream); release();
        }
      };
      for (const track of tracks) {
        const stop = track.stop.bind(track);
        track.stop = () => { stop(); finished(track); };
        track.addEventListener("ended", () => finished(track), { once: true });
      }
      if (!tracks.length) release();
      return stream;
    } catch (error) { release(); throw error; }
  }
  devices.getUserMedia = (constraints) => capture(constraints, false);
  window.LegaryaMicrophone = Object.freeze({ capture: (constraints, options) => capture(constraints, true, options) });
  const invalidate = () => {
    navigation += 1;
    for (const stream of streams) stream.getTracks().forEach((track) => track.stop());
  };
  for (const name of ["pagehide", "popstate", "legarya:session-ending", "legarya:session-expired", "legarya:android-sensitive-stop"]) window.addEventListener(name, invalidate);
  window.document?.addEventListener("visibilitychange", () => { if (window.document.hidden) invalidate(); });
})();
