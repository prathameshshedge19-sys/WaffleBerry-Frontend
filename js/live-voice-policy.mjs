export function liveVoiceAvailability(context, enabled, env = globalThis) {
  if (!enabled) return "Live Voice is currently unavailable. You can still type or use dictation.";
  if (!context?.legacyId || !context.ready) return "Complete the Legacy identity setup before starting Live Voice.";
  if (context.busy) return "Let the current message finish before starting Live Voice.";
  if (!env.isSecureContext || !(env.AudioContext || env.webkitAudioContext) || !env.AudioWorkletNode
      || !env.navigator?.mediaDevices?.getUserMedia || !env.navigator?.locks || !env.WebSocket
      || !env.HTMLDialogElement) return "Live Voice is unavailable in this browser. Try a current version of Chrome, Edge or Safari.";
  return "";
}

export function liveVoiceError(error) {
  if (error?.code === "realtime_session_expired") return "This call has reached its time limit. Return to chat and start a new call when you are ready.";
  if (["realtime_access_changed", "realtime_not_authorized"].includes(error?.code)) return "Your access to this chat has changed. Return to your workspace and sign in again if needed.";
  if (error?.code === "realtime_setup_incomplete") return "Complete this Legacy's identity setup before starting Live Voice.";
  if (["NotAllowedError", "SecurityError"].includes(error?.name)) return "Microphone permission was denied. Allow microphone access in your browser settings, then try again.";
  if (error?.name === "NotFoundError") return "No microphone was found. Connect one and try again.";
  if (["NotReadableError", "AbortError"].includes(error?.name)) return "Your microphone is busy or unavailable. Close other recording apps and try again.";
  if (error?.status === 401) return "Please sign in again to start another call. Your saved messages are safe.";
  if ([403, 404].includes(error?.status)) return "Your access to this chat has changed. Return to your workspace to continue.";
  if (error?.status === 409) return "This chat is not ready for Live Voice. Complete setup or finish your other call first.";
  return "The voice connection could not continue. Saved messages remain in chat; unfinished speech may need repeating.";
}

export function liveWebsocketUrl(config, location) {
  if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
    const base = new URL(config.apiBaseUrl, location.href);
    base.pathname = base.pathname.replace(/\/$/, "") + "/realtime/connect";
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    return base.href;
  }
  // Route directly to the audited backend TLS proxy. Only the short-lived
  // server-issued ticket crosses this direct TLS connection, never provider keys.
  return "wss://89-167-14-211.sslip.io/api/v1/realtime/connect";
}
