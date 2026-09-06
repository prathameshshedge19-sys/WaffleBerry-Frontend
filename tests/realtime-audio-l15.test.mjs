import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { PCMResampler } from "../js/realtime-pcm.mjs";
import { RealtimeClient } from "../js/realtime-client.mjs";

function render(rate, frequency, block = 128) {
  const resampler = new PCMResampler(rate);
  const input = Float32Array.from({ length: rate }, (_, i) => 0.5 * Math.sin(2 * Math.PI * frequency * i / rate));
  const frames = [];
  for (let i = 0; i < input.length; i += block) resampler.push(input.subarray(i, i + block), (frame) => frames.push(frame));
  return frames;
}
const rms = (frames) => {
  const values = frames.flatMap((frame) => Array.from(new Int16Array(frame))).slice(1200);
  return Math.sqrt(values.reduce((sum, v) => sum + (v / 32768) ** 2, 0) / values.length);
};
for (const rate of [24000, 44100, 48000, 96000]) test(`PCM 24k mono framing and signal amplitude from ${rate}`, () => {
  const frames = render(rate, 1000);
  assert.equal(frames.length, 19);
  assert.ok(frames.every((frame) => frame.byteLength === 2400));
  assert.ok(Math.abs(rms(frames) - Math.sqrt(0.125)) < 0.01);
  assert.deepEqual(render(rate, 1000, 113), frames, "input chunk boundaries cannot alter audio");
});
test("resampling rejects ultrasonic aliasing and bounds storage", () => {
  assert.ok(rms(render(48000, 17000)) < 0.002);
  const resampler = new PCMResampler(48000);
  resampler.push(new Float32Array(480000), () => {});
  assert.equal(resampler.ring.length, 8192);
  assert.equal(resampler.frame.byteLength, 2400);
});

function ownershipHarness(locks, original) {
  const context = { navigator: { locks, mediaDevices: { getUserMedia: original } }, DOMException };
  context.window = { listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } };
  vm.runInNewContext(fs.readFileSync(new URL("../js/microphone-ownership.js", import.meta.url), "utf8"), context);
  return context;
}
function locksHarness() {
  let held = false;
  return { async request(_name, _options, callback) {
    if (held) return callback(null);
    held = true;
    try { return await callback({}); } finally { held = false; }
  } };
}
function stream() {
  const track = { readyState: "live", addEventListener() {}, stop() { this.readyState = "ended"; } };
  return { getTracks: () => [track], getAudioTracks: () => [track] };
}
test("shared ownership excludes L12 and L15 including same-origin tabs", async () => {
  const locks = locksHarness();
  const a = ownershipHarness(locks, async () => stream());
  const b = ownershipHarness(locks, async () => stream());
  const l12 = await a.navigator.mediaDevices.getUserMedia({ audio: true });
  await assert.rejects(b.window.LegaryaMicrophone.capture({ audio: true }), { name: "NotReadableError" });
  l12.getTracks()[0].stop();
  await new Promise(setImmediate);
  const l15 = await b.window.LegaryaMicrophone.capture({ audio: true });
  await assert.rejects(a.navigator.mediaDevices.getUserMedia({ audio: true }), { name: "NotReadableError" });
  l15.getTracks()[0].stop();
});
test("pending permission reserves microphone; rejection releases ownership", async () => {
  let rejectPermission;
  let deny = true;
  const a = ownershipHarness(locksHarness(), () => deny ? new Promise((_, reject) => { rejectPermission = reject; }) : Promise.resolve(stream()));
  const pending = a.window.LegaryaMicrophone.capture({ audio: true });
  await new Promise(setImmediate);
  await assert.rejects(a.navigator.mediaDevices.getUserMedia({ audio: true }), { name: "NotReadableError" });
  rejectPermission(new DOMException("Denied", "NotAllowedError"));
  await assert.rejects(pending, { name: "NotAllowedError" });
  deny = false;
  const granted = await a.window.LegaryaMicrophone.capture({ audio: true });
  granted.getTracks()[0].stop();
});
test("unsupported ownership disables L15 without breaking existing L12", async () => {
  const a = ownershipHarness(undefined, async () => stream());
  await assert.rejects(a.window.LegaryaMicrophone.capture({ audio: true }), { name: "NotSupportedError" });
  assert.ok(await a.navigator.mediaDevices.getUserMedia({ audio: true }));
});

test("navigation during permission acquisition stops the late microphone", async () => {
  let permission;
  const a = ownershipHarness(locksHarness(), () => new Promise((resolve) => { permission = resolve; }));
  const pending = a.window.LegaryaMicrophone.capture({ audio: true });
  await new Promise(setImmediate);
  a.window.listeners.pagehide();
  const granted = stream(); permission(granted);
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(granted.getTracks()[0].readyState, "ended");
});

function clientHarness() {
  const sockets = [], calls = [], events = [];
  class Socket {
    constructor(url) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.sent = []; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    open() { this.readyState = 1; this.onopen(); }
    event(value) { this.onmessage({ data: JSON.stringify(value) }); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  const environment = { location: { href: "http://localhost:5500/realtime-dev.html" }, WebSocket: Socket,
    setTimeout, clearTimeout, setInterval, clearInterval, btoa: (value) => Buffer.from(value, "binary").toString("base64") };
  const api = async (path, options) => { calls.push({ path, options }); return { session_id: "session", ticket: "secret-ticket" }; };
  const client = new RealtimeClient({ api, environment, websocketUrl: "ws://localhost:8100/api/v1/realtime/connect", onEvent: (event) => events.push(event) });
  client.acquireMicrophone = async () => {};
  client.attachCapture = async () => {};
  return { client, calls, events, sockets, environment };
}
async function started(h) {
  const pending = h.client.start({ legacy_id: 1, mode: "rya" });
  await new Promise(setImmediate);
  const socket = h.sockets.at(-1); socket.open(); socket.event({ type: "ready", generation: 1 });
  await pending;
  return socket;
}
test("ticket stays in first socket message; finals deduplicate and bind once", async () => {
  const h = clientHarness();
  const socket = await started(h);
  assert.ok(!socket.url.includes("ticket"));
  assert.deepEqual(socket.sent, [{ type: "authenticate", ticket: "secret-ticket" }]);
  const final = { type: "transcript_final", message_id: 8, conversation_id: 4, legacy_id: 1, content: "Jasmine" };
  socket.event({ type: "transcript_provisional", item_id: "A", delta: "Jas" });
  assert.equal(h.client.receipts.size, 0);
  socket.event(final); socket.event({ ...final, state: "interrupted", replayed: true });
  assert.equal(h.client.receipts.size, 1);
  assert.equal(h.client.receipts.get(8).state, "interrupted");
  assert.equal(h.events.filter((event) => event.type === "transcript_final").length, 1);
  socket.event({ ...final, message_id: 9, conversation_id: 5 });
  assert.equal(h.client.state, "idle");
  h.client.dispose();
});
test("navigation while permission pending creates no session", async () => {
  const h = clientHarness();
  let permission;
  h.client.acquireMicrophone = () => new Promise((resolve) => { permission = resolve; });
  const pending = h.client.start({ legacy_id: 1, mode: "rya" });
  h.client.invalidate(); permission(); await pending;
  assert.equal(h.calls.length, 0);
});
test("navigation invalidates late final and prevents old-session reconnect", async () => {
  const h = clientHarness(); const socket = await started(h);
  h.client.invalidate();
  socket.event({ type: "transcript_final", message_id: 8, conversation_id: 4, legacy_id: 1 });
  assert.equal(h.client.receipts.size, 0);
  await assert.rejects(h.client.reconnect());
});
test("reconnect reconciles without reacquiring microphone or replaying frames", async () => {
  const h = clientHarness(); const socket = await started(h);
  socket.close();
  h.client.acquireMicrophone = () => assert.fail("reconnect cannot capture");
  const pending = h.client.reconnect(); await new Promise(setImmediate);
  const replacement = h.sockets.at(-1); replacement.open(); replacement.event({ type: "ready" }); await pending;
  assert.equal(replacement.sent.length, 1);
  assert.ok(h.calls.at(-1).path.endsWith("/reconnect"));
  h.client.dispose();
});
test("worklet caps transferable messages until acknowledged", () => {
  const posts = [];
  let Processor;
  const source = fs.readFileSync(new URL("../js/realtime-worklet.js", import.meta.url), "utf8").replace(/^import.*\n/, "");
  vm.runInNewContext(source, { PCMResampler, sampleRate: 48000, Float32Array,
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (data) => posts.push(data) }; } },
    registerProcessor: (_, type) => { Processor = type; } });
  const processor = new Processor();
  for (let i = 0; i < 150; i += 1) processor.process([[new Float32Array(128)]]);
  assert.equal(posts.filter((p) => p.type === "pcm").length, 4);
  assert.equal(posts.filter((p) => p.type === "overrun").length, 1);
  assert.equal(processor.running, false);
});
test("both L12 pages install isolated guard before unchanged voice client", () => {
  for (const file of ["chat.html", "legacy-chat.html"]) {
    const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.ok(html.indexOf("microphone-ownership.js") < html.indexOf("voice-chat.js"));
  }
});
