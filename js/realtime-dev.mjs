import { RealtimeClient } from "./realtime-client.mjs";
import { createDevAuth } from "./realtime-dev-auth.mjs";

const byId = (id) => document.getElementById(id);
const api = window.LegaryaAuthApi.apiRequest;
const base = new URL(window.LegaryaAuthApi.API_BASE_URL, location.href);
// This developer surface uses the direct local backend, never a hosted rewrite.
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
  byId("status").textContent = "This development surface is available locally only.";
  document.querySelectorAll("button").forEach((button) => { button.disabled = true; });
} else {
  const websocket = new URL(`${base.pathname}/realtime/connect`, base);
  websocket.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  let cid = null;
  let boundMode = null;
  let boundLegacy = null;
  const partials = new Map();
  const client = new RealtimeClient({ api, websocketUrl: websocket.href, onEvent(event) {
    if (event.type === "transcript_provisional") {
      const text = (partials.get(event.item_id) || "") + event.delta;
      partials.set(event.item_id, text.slice(-8000));
      if (partials.size > 16) partials.delete(partials.keys().next().value);
      byId("partial").textContent = [...partials.values()].join("\n");
    } else if (event.type === "transcript_final") {
      partials.delete(event.item_id);
      cid = event.conversation_id;
      boundMode = event.mode;
      boundLegacy = event.legacy_id;
      byId("partial").textContent = [...partials.values()].join("\n");
      byId("saved").textContent = [...client.receipts.values()].map((item) => `[${item.message_id}] ${item.content}`).join("\n");
      byId("status").textContent = `Speech saved in conversation ${cid}. Waiting for Rya.`;
    } else {
      if (event.type === "utterance_failed") partials.delete(event.item_id);
      if (["ended", "disconnected", "error"].includes(event.type)) partials.clear();
      byId("partial").textContent = [...partials.values()].join("\n");
      byId("status").textContent = event.message || event.type;
    }
  } });
  const run = (fn) => async () => { try { await fn(); } catch (error) { byId("status").textContent = error.message; } };
  const devAuth = createDevAuth({ auth: window.LegaryaAuthApi, onState({ state, message, signedIn }) {
    byId("authStatus").textContent = message;
    byId("login").disabled = state === "checking";
    for (const id of ["start", "reconnect", "refresh"]) byId(id).disabled = !signedIn;
    byId("signIn").open = !signedIn;
  } });
  byId("login").onclick = run(async () => {
    if (await devAuth.login(byId("email").value, byId("password").value)) {
      byId("password").value = "";
      byId("status").textContent = "Select the test Legacy and start the microphone.";
    }
  });
  byId("start").onclick = run(async () => {
    if (!await devAuth.requireSession()) return;
    const conversation = Number(byId("conversation").value);
    cid = conversation || null;
    await client.start(conversation ? { conversation_id: conversation } : { legacy_id: Number(byId("legacy").value), mode: byId("mode").value });
  });
  byId("end").onclick = run(() => client.stop());
  byId("stopSpeaking").onclick = () => client.stopSpeaking();
  byId("reconnect").onclick = run(async () => { if (await devAuth.requireSession()) await client.reconnect(); });
  byId("refresh").onclick = run(async () => {
    if (!await devAuth.requireSession()) return;
    if (!cid) throw new Error("No saved conversation yet.");
    const prefix = (boundMode || byId("mode").value) === "legacy" ? "legacy-conversations" : "conversations";
    const messages = await api(`/${prefix}/${cid}/messages?legacy_id=${boundLegacy || Number(byId("legacy").value)}`, { authenticated: true });
    byId("saved").textContent = messages.map((item) => `[${item.role}] ${item.content}`).join("\n");
  });
  for (const id of ["legacy", "conversation", "mode"]) byId(id).addEventListener("change", () => {
    client.invalidate(); cid = boundMode = boundLegacy = null; partials.clear();
    byId("partial").textContent = "";
    byId("saved").textContent = "Selection changed. Previous saved speech remains in its original chat.";
  });
}
