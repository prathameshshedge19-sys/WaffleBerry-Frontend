import { MouthEnvelope } from "./playback-envelope.mjs?v=l19c1";
export const visualStates = Object.freeze(["DISABLED", "LOADING", "IDLE", "LISTENING", "THINKING", "SPEAKING", "INTERRUPTED", "ERROR"]);
const bindingKeys = ["session_id", "generation", "turn_id", "active_generation_id", "response_id", "playback_epoch"];

// One disposable controller per exact chat/call (or owner preview). No persistence.
export function createVisualPresence({ host, client, legacyId, version = null, name = "L", guard = () => true,
  environment = globalThis, rendererFactory, staticPhoto = false, preview = false, onState = () => {} }) {
  let disposed = false, epoch = 0, abort = null, refreshTimer = null, expiryTimer = null, timeout = null, quietTimer = null;
  let bundle = null, renderer = null, manifest = null, binding = null, playbackEpoch = -1;
  let energy = 0, energyUntil = 0, state = "DISABLED", startedAt = 0, leaseDeadline = 0;
  const mouth = new MouthEnvelope();
  const now = () => environment.performance.now();
  const setState = (next) => { state = next; host.dataset.visualState = next; try { onState(next); } catch {} };
  const valid = token => !disposed && token === epoch && guard();
  const owned = token => !disposed && token === epoch;
  function clearTimer(key) { if (key !== null) environment.clearTimeout(key); }
  function clearTimers() { clearTimer(refreshTimer); clearTimer(expiryTimer); clearTimer(timeout); clearTimer(quietTimer); refreshTimer = expiryTimer = timeout = quietTimer = null; }
  function initial() {
    const node = host.ownerDocument.createElement("span"); node.className = "live-legacy-presence";
    node.textContent = name.trim().slice(0,1) || "L"; host.replaceChildren(node);
  }
  function reset(retireBinding = true) { if (retireBinding) binding = null; clearTimer(quietTimer); quietTimer=null; energy = energyUntil = 0; mouth.reset(); try { renderer?.reset(); } catch {} }
  function release() { reset(); try { renderer?.dispose(); } finally { renderer = null; bundle?.dispose(); bundle = null; manifest = null; } }
  function revoke(next = "DISABLED") {
    ++epoch; abort?.abort(); abort = null; clearTimers(); release(); initial(); setState(next);
  }
  function sample(dt, time) {
    if (!guard() || disposed || now() >= leaseDeadline) { if (!disposed) revoke(); return { mouth: 0, state: "DISABLED" }; }
    if (preview) return { mouth: staticPhoto ? 0 : Math.max(0, Math.sin((time - startedAt) / 600)) * .45, state: "IDLE" };
    return { mouth: mouth.step(state === "SPEAKING" && time < energyUntil ? energy : 0, dt), state };
  }
  const identity = m => [m.version_id, m.revision, m.bundle_digest, ...m.assets.map(a => `${a.id}:${a.sha256}`)].join("|");
  async function refresh(token, first) {
    if (!valid(token)) { if (owned(token)) revoke(); return; }
    const requestedAt = now();
    abort = new AbortController();
    timeout = environment.setTimeout(() => { if (owned(token)) revoke("ERROR"); }, 10000);
    try {
      const next = await client.manifest(legacyId, version, abort.signal);
      if (!valid(token)) { if (owned(token)) revoke(); return; }
      const remaining = Math.min(next.lease_seconds * 1000 - (now() - requestedAt), Date.parse(next.valid_until) - environment.Date.now());
      if (!(remaining > 0)) throw new Error("Visual lease expired.");
      leaseDeadline = now() + remaining;
      clearTimer(expiryTimer);
      expiryTimer = environment.setTimeout(() => { if (owned(token)) revoke(); }, remaining);
      if (!manifest || identity(manifest) !== identity(next)) {
        // Retire the old bytes before awaiting replacements, even on v1 -> v2.
        release(); initial(); setState("LOADING");
        const loaded = await client.bundle(next, abort.signal);
        if (!valid(token)) { loaded.dispose(); if (owned(token)) revoke(); return; }
        bundle = loaded; manifest = next; startedAt = now();
        renderer = rendererFactory(host, bundle, { environment, staticPhoto, sample });
        setState("IDLE");
      } else manifest = next;
      clearTimer(timeout); timeout = null; abort = null;
      refreshTimer = environment.setTimeout(() => { refreshTimer = null; void refresh(token, false); }, Math.min(5000, remaining / 2));
    } catch (error) { if (owned(token)) revoke([403,404,410].includes(error?.status) ? "DISABLED" : "ERROR"); }
  }
  initial();
  return Object.freeze({
    start() { revoke("LOADING"); const token = epoch; return refresh(token, true); },
    presentation(event) {
      if (disposed || !guard() || preview) return;
      if (!Number.isSafeInteger(event.playback_epoch) || event.playback_epoch < playbackEpoch) return;
      if (event.type === "playback_reset") { playbackEpoch = event.playback_epoch; reset(); if (manifest) setState("INTERRUPTED"); return; }
      if (event.type === "playback_binding") { reset(); playbackEpoch = event.playback_epoch; binding = { ...event }; return; }
      if (event.type !== "playback_envelope" || !binding || !bindingKeys.every(k => binding[k] === event[k])) return;
      if (!manifest) return;
      energy = Math.min(1, Math.max(0, Number(event.value) || 0));
      energyUntil = now() + Math.max(0, Math.min(20, (event.expires - event.audio_time) * 1000));
      if (energy > .04) {
        clearTimer(quietTimer); const token=epoch, output=playbackEpoch;
        quietTimer=environment.setTimeout(()=>{quietTimer=null;if(valid(token)&&output===playbackEpoch)reset(false);},energyUntil-now()+150);
      }
      setState("SPEAKING");
    },
    setCallState(next) {
      if (!manifest || disposed || preview) return;
      const mapped = { thinking: "THINKING", speaking: "SPEAKING", listening: "IDLE", capturing: "LISTENING", connecting: "LOADING", reconnecting: "LOADING" }[next];
      if (mapped && mapped !== "SPEAKING") reset(false);
      if (mapped) setState(mapped);
    },
    setStatic(value) { staticPhoto = Boolean(value); reset(false); renderer?.setStatic(staticPhoto); },
    diagnostics: () => ({ state, mouth: mouth.value, epoch, timers: [refreshTimer,expiryTimer,timeout,quietTimer].filter(t=>t!==null).length, ...renderer?.diagnostics() }),
    approval: () => manifest && bundle && guard() && !disposed && now() < leaseDeadline ? { version_id: manifest.version_id, expected_revision: manifest.revision, bundle_digest: manifest.bundle_digest, approved: true } : null,
    dispose() { if (disposed) return; revoke(); disposed = true; },
  });
}
