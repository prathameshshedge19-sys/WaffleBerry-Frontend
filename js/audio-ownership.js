"use strict";
// A live call holds an exclusive output lock. Existing L12 audio takes a shared
// lock only while playing; its synthesis, review and playback controls are intact.
(() => {
  if (window.LegaryaAudioOwnership) return;
  async function acquire(mode = "exclusive") {
    if (!navigator.locks) {
      if (mode === "shared") return () => {};
      throw new Error("Live voice requires audio ownership support.");
    }
    return new Promise((resolve, reject) => {
      navigator.locks.request("legarya-audio-output", { mode, ifAvailable: true }, async (lock) => {
        if (!lock) { reject(new Error("Another voice feature is playing audio.")); return; }
        await new Promise((release) => resolve(release));
      }).catch(reject);
    });
  }
  function protect(audio) {
    const play = audio.play.bind(audio), pause = audio.pause.bind(audio);
    let unlock = null, epoch = 0;
    const release = () => { ++epoch; unlock?.(); unlock = null; };
    audio.play = async () => {
      const started = ++epoch;
      const held = unlock || await acquire("shared");
      if (started !== epoch) { held(); return; }
      unlock = held;
      try { return await play(); } catch (error) { release(); throw error; }
    };
    audio.pause = () => { pause(); release(); };
    audio.addEventListener("ended", release);
    audio.addEventListener("error", release);
    window.addEventListener("pagehide", () => { pause(); release(); });
  }
  window.LegaryaAudioOwnership = Object.freeze({ acquire, protect });
})();
