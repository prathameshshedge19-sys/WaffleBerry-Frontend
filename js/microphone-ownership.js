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

  async function capture(constraints, requireLock = true) {
    if (!constraints?.audio) return original(constraints);
    if (!navigator.locks) {
      if (requireLock) throw new DOMException("Live voice requires microphone ownership support.", "NotSupportedError");
      return original(constraints);
    }
    if (reserved) throw busy();
    reserved = true;
    const startedNavigation = navigation;
    let unlock;
    let released = false;
    const release = () => { if (!released) { released = true; reserved = false; unlock?.(); } };
    try {
      await new Promise((resolve, reject) => {
        navigator.locks.request("legarya-microphone", { ifAvailable: true }, async (lock) => {
          if (!lock) { reject(busy()); return; }
          await new Promise((done) => { unlock = done; resolve(); });
        }).catch(reject);
      });
      const stream = await original(constraints);
      if (startedNavigation !== navigation) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException("The page changed before microphone permission completed.", "AbortError");
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
  window.LegaryaMicrophone = Object.freeze({ capture: (constraints) => capture(constraints, true) });
  window.addEventListener("pagehide", () => {
    navigation += 1;
    for (const stream of streams) stream.getTracks().forEach((track) => track.stop());
  });
})();
