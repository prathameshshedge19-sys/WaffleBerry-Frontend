import { RealtimeClient } from "./realtime-client.mjs";
import { liveVoiceAvailability, liveVoiceError, liveWebsocketUrl } from "./live-voice-policy.mjs";
import { createRyaRenderer } from "./rya-renderer.mjs";
import "./legarya-soundscape.js?v=3.6";

const adapter = window.LegaryaLiveChat;
const entry = document.querySelector("#startVoiceConversation");
if (adapter && entry) {
  const dialog = document.createElement("dialog");
  dialog.className = "live-call";
  dialog.setAttribute("aria-labelledby", "liveCallTitle");
  dialog.setAttribute("aria-describedby", "liveCallDisclosure");
  dialog.innerHTML = `<div class="live-call-panel">
    <header class="live-call-heading"><span class="live-call-eyebrow">LegaRya · Live Voice</span><span class="live-call-privacy">A space to remember</span></header>
    <div class="live-call-presence" data-rya-section-host aria-hidden="true"></div>
    <h1 id="liveCallTitle">Rya</h1><p id="liveCallDisclosure" class="live-call-disclosure">Your AI companion for preserving memories</p>
    <p class="live-call-state" role="status" aria-live="polite" aria-atomic="true">Connecting</p>
    <p class="live-call-help">You can speak naturally and interrupt at any time.</p>
    <p class="live-call-transcript" aria-label="Live speech preview"></p>
    <div class="live-call-controls"><button type="button" data-live-mute aria-pressed="false">Mute microphone</button><button type="button" data-live-stop>Stop speaking</button><button type="button" data-live-end class="live-call-end">End call</button></div>
    <button type="button" data-live-resume hidden>Resume microphone</button>
    <button type="button" data-live-close hidden>Return to chat</button>
    <button type="button" data-live-ambience aria-pressed="true">Ambient sound on</button>
    <p class="live-call-footnote">Keep this page open. Switching apps or locking your screen ends the call.</p>
  </div>`;
  document.body.append(dialog);
  const find = (selector) => dialog.querySelector(selector);
  const stateLabel = find(".live-call-state"), help = find(".live-call-help"), preview = find(".live-call-transcript");
  const mute = find("[data-live-mute]"), stop = find("[data-live-stop]"), end = find("[data-live-end]");
  const resume = find("[data-live-resume]"), close = find("[data-live-close]");
  let enabled = false, active = false, finishing = false, finished = false, reconnecting = false;
  let context = null, state = "ended", boundId = null, serial = 0, restoreFocus = null;
  let refreshQueue = Promise.resolve();
  const partials = new Map();
  let presence = null, ambience = null, previousPresenceActive = false;
  function releasePresence() {
    presence?.dispose(); presence = null;
    ambience?.release(); ambience = null;
    if (previousPresenceActive) window.RyaEnergyControl?.setActive(true);
    previousPresenceActive = false;
    find("[data-live-ambience]").hidden = true;
  }
  const refresh = () => {
    const snapshot = context, id = boundId;
    if (!snapshot || !id) return Promise.resolve();
    refreshQueue = refreshQueue.catch(() => {}).then(() => adapter.refresh(snapshot, id));
    return refreshQueue;
  };
  function show(next, message) {
    if (next !== "speaking") presence?.setPlaybackEnergy(0);
    ambience?.speaking(next === "speaking");
    state = next;
    dialog.dataset.state = next;
    stateLabel.textContent = next === "listening" && client.muted ? "Microphone muted" : next.charAt(0).toUpperCase() + next.slice(1);
    if (message) help.textContent = message;
    mute.disabled = !client.stream || finishing || finished;
    stop.disabled = !["thinking", "speaking"].includes(next) || finishing || finished;
    end.disabled = finishing || finished;
  }
  function onEvent(event) {
    if (!active || finished || (finishing && event.type !== "transcript_final")) return;
    if (event.type === "input_energy" || event.type === "output_energy") {
      if ((event.type === "input_energy" && state === "listening") || (event.type === "output_energy" && state === "speaking")) {
        if (event.type === "output_energy") presence?.setPlaybackEnergy(event.value);
      }
      return;
    }
    if (event.type === "transcript_provisional") {
      partials.set(event.item_id, ((partials.get(event.item_id) || "") + event.delta).slice(-1000));
      if (partials.size > 4) partials.delete(partials.keys().next().value);
      preview.textContent = [...partials.values()].join(" ");
    } else if (event.type === "transcript_final") {
      if (!adapter.accept(context, event)) { void finish("The selected chat changed. Your saved speech remains in its original chat."); return; }
      boundId = event.conversation_id;
      partials.delete(event.item_id);
      preview.textContent = event.content;
      if (!finishing) show("thinking");
    } else if (["thinking", "speaking", "listening"].includes(event.type)) {
      // Playback emits speaking only on the running AudioContext clock.
      if (event.type !== "listening" || client.stream) show(event.type);
    } else if (event.type === "assistant_completed") {
      void refresh().catch(() => {});
    } else if (event.type === "utterance_failed") {
      partials.delete(event.item_id);
      preview.textContent = "";
      help.textContent = "That speech could not be saved. Please say it again.";
    } else if (event.type === "mute_changed") {
      mute.textContent = event.muted ? "Unmute microphone" : "Mute microphone";
      mute.setAttribute("aria-pressed", String(event.muted));
      if (state === "listening") show(state);
    } else if (event.type === "disconnected") {
      void reconcile();
    } else if (event.type === "error") {
      void finish(liveVoiceError(event), true);
    } else if (event.type === "ended") {
      void finish("Your call has ended. Saved messages are in this chat.");
    }
  }
  const client = new RealtimeClient({ api: window.LegaryaAuthApi.apiRequest,
    websocketUrl: liveWebsocketUrl(window.LEGARYA_AUTH_CONFIG, location), onEvent });
  async function reconcile() {
    if (!active || finished || finishing || reconnecting) return;
    reconnecting = true;
    const token = serial;
    partials.clear(); preview.textContent = "";
    show("reconnecting", "Restoring your saved chat. Unfinished speech may need repeating.");
    try {
      await client.reconnect();
      if (token !== serial || finished || finishing) return;
      await refresh();
      resume.hidden = false;
      show("reconnecting", "Connection restored. Tap Resume microphone when you are ready.");
    } catch (error) {
      if (token === serial && !finishing && !finished) await finish(liveVoiceError(error), true);
    } finally { reconnecting = false; }
  }
  async function finish(message = "Your saved messages are back in this chat.", error = false) {
    if (finishing || finished || !active) return;
    finishing = true; ++serial;
    resume.hidden = true;
    show("ending", "Ending your call and returning to your saved conversation.");
    releasePresence();
    await client.stop();
    try { await refresh(); } catch { message = "Your call has ended. Refresh the chat to load saved messages."; error = true; }
    finishing = false; finished = true;
    partials.clear(); preview.textContent = "";
    show(error ? "error" : "ended", message);
    close.hidden = false;
    close.focus();
  }
  async function start() {
    context = adapter.context();
    const unavailable = liveVoiceAvailability(context, enabled);
    if (unavailable) { entry.title = unavailable; return; }
    restoreFocus = document.activeElement;
    active = true; finishing = finished = reconnecting = false; ++serial;
    const token = serial;
    boundId = context.conversationId || null;
    client.muted = false;
    partials.clear(); preview.textContent = "";
    close.hidden = resume.hidden = true;
    find("#liveCallTitle").textContent = context.mode === "legacy" ? context.name : "Rya";
    find("#liveCallDisclosure").textContent = context.mode === "legacy" ? "AI Legacy · A standard AI voice, grounded in preserved memories" : "Your AI companion for preserving memories";
    dialog.dataset.mode = context.mode;
    adapter.setLive(true);
    dialog.showModal();
    const visual = find(".live-call-presence"), soundButton = find("[data-live-ambience]");
    visual.replaceChildren();
    soundButton.hidden = context.mode !== "rya";
    if (context.mode === "rya") {
      previousPresenceActive = Boolean(window.RyaEnergyControl?.active);
      window.RyaEnergyControl?.setActive(false);
      try {
        ambience = window.LegaryaSoundscape.acquireLive(soundButton);
        presence = createRyaRenderer(visual, { live: true, onArc: detail => ambience?.arc(detail) });
      } catch {
        // Optional atmosphere must not prevent a usable voice call.
        releasePresence();
      }
    } else {
      const initial = document.createElement("span");
      initial.className = "live-legacy-presence";
      initial.textContent = (context.name || "L").trim().slice(0, 1);
      visual.append(initial);
    }
    show("connecting", "Preparing your microphone and voice connection.");
    end.focus();
    try {
      await client.start(context.conversationId ? { conversation_id: context.conversationId } : { legacy_id: context.legacyId, mode: context.mode });
      if (token === serial && !finishing && !finished && client.stream) show("listening", "You can speak naturally and interrupt at any time.");
    } catch (error) { if (token === serial) await finish(liveVoiceError(error), true); }
  }
  entry.addEventListener("click", () => { if (!active) void start(); });
  mute.addEventListener("click", () => client.setMuted(!client.muted));
  stop.addEventListener("click", () => { client.stopSpeaking(); if (client.stream) show("listening", "Response stopped. You can keep talking."); });
  end.addEventListener("click", async () => { await finish(); if (state === "ended") close.click(); });
  resume.addEventListener("click", async () => {
    resume.hidden = true;
    const token = serial;
    try { await client.resumeCapture(); if (token === serial && client.stream) show("listening", "Ready for new speech. Unfinished speech may need repeating."); }
    catch (error) { if (token === serial) await finish(liveVoiceError(error), true); }
  });
  close.addEventListener("click", () => {
    dialog.close(); active = false; adapter.setLive(false); updateEntry(); restoreFocus?.focus();
  });
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); if (finished) close.click(); else void finish(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && active) void finish("Call ended because this page went into the background. Your saved messages remain in chat."); });
  window.addEventListener("pagehide", () => { if (active) { ++serial; releasePresence(); client.invalidate(); } });
  window.addEventListener("popstate", () => { if (active) void finish("The page changed. Saved messages remain in their original chat."); });
  window.addEventListener("legarya:session-expired", () => { if (active) void finish("Please sign in again. Your saved messages remain in chat.", true); });
  function updateEntry() {
    const reason = liveVoiceAvailability(adapter.context(), enabled);
    entry.disabled = Boolean(reason) || active;
    entry.title = reason || "Start voice conversation";
    document.querySelector("#liveVoiceAvailability").textContent = reason;
  }
  window.addEventListener("legarya:chat-context", updateEntry);
  window.LegaryaLiveVoice = Object.freeze({ invalidate() { if (active) void finish("The chat changed. Saved speech remains in its original conversation."); } });
  updateEntry();
  window.LegaryaAuthApi.apiRequest("/realtime/capabilities", { authenticated: true }).then((result) => { enabled = result.enabled === true; updateEntry(); }).catch(() => updateEntry());
}
