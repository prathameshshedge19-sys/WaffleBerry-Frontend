import { RealtimePlayback } from "./realtime-playback.mjs";
const validId = (id) => Number.isInteger(id) && id > 0;
const validateScope = (scope) => {
  if (validId(scope.conversation_id) && Object.keys(scope).length === 1) return { ...scope };
  if (validId(scope.legacy_id) && ["rya", "legacy"].includes(scope.mode) && Object.keys(scope).length === 2) return { ...scope };
  throw new Error("Select an existing chat or a Legacy and mode.");
};

export class RealtimeClient {
  constructor({ api, websocketUrl, onEvent = () => {}, environment = globalThis }) {
    this.api = api;
    this.environment = environment;
    const url = new URL(websocketUrl, environment.location.href);
    if (!["wss:", "ws:"].includes(url.protocol) || url.search || url.username || url.password
        || (url.protocol === "ws:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
      throw new Error("Live voice requires a secure backend WebSocket.");
    }
    this.url = url.href;
    this.onEvent = onEvent;
    this.epoch = 0;
    this.receipts = new Map();
    this.socket = null;
    this.state = "idle";
    this.muted = false;
    this.onNavigation = () => this.invalidate();
    environment.addEventListener?.("pagehide", this.onNavigation);
    environment.addEventListener?.("popstate", this.onNavigation);
  }
  async start(scope) {
    if (this.state !== "idle") throw new Error("A live connection is already active.");
    this.scope = Object.freeze(validateScope(scope));
    this.receipts.clear();
    this.sessionId = null;
    this.boundConversation = null;
    const epoch = ++this.epoch;
    this.state = "starting";
    try {
      await this.acquireMicrophone(epoch);
      if (epoch !== this.epoch) return;
      const grant = await this.api("/realtime/sessions", { method: "POST", authenticated: true, body: this.scope });
      if (epoch !== this.epoch) return;
      this.sessionId = grant.session_id;
      await this.connect(grant, epoch);
      if (epoch === this.epoch) await this.attachCapture(epoch);
    } catch (error) {
      if (epoch === this.epoch) this.invalidate();
      throw error;
    }
  }
  async acquireMicrophone(epoch) {
    const env = this.environment;
    if (!env.isSecureContext || !env.LegaryaMicrophone || !env.AudioWorkletNode || !env.LegaryaAudioOwnership) throw new Error("Live capture is unavailable in this browser.");
    const Context = env.AudioContext || env.webkitAudioContext;
    const context = new Context();
    this.audioContext = context;
    await context.resume();
    if (epoch !== this.epoch) return;
    await env.LegaryaVoice?.prepareLive?.();
    if (epoch !== this.epoch) return;
    if (env.LegaryaVoice?.isCapturing()) throw new Error("Finish L12 dictation before starting live voice.");
    env.LegaryaVoice?.stopSpeech();
    if (env.LegaryaAudioOwnership) {
      const release = await env.LegaryaAudioOwnership.acquire();
      if (epoch !== this.epoch) { release(); return; }
      this.releaseOutput = release;
    }
    context.onstatechange = () => {
      if (epoch === this.epoch && this.audioContext === context && ["interrupted", "suspended"].includes(context.state)) {
        this.fail("Audio was interrupted. Your call has ended; saved messages remain in chat.");
      }
    };
    this.playback = new RealtimePlayback({ context, environment: env,
      send: (event) => this.sendPlayback(event), onState: (state) => this.onEvent({ type: state }),
      onEnergy: (value) => this.onEvent({ type: "output_energy", value }),
      onFault: (message) => this.fail(message) });
    if (epoch !== this.epoch) { if (context.state !== "closed") await context.close().catch(() => {}); return; }
    const stream = await env.LegaryaMicrophone.capture({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
    if (epoch !== this.epoch) { stream.getTracks().forEach((track) => track.stop()); return; }
    this.stream = stream;
    for (const track of stream.getTracks()) track.addEventListener("ended", () => {
      if (epoch === this.epoch && this.stream) this.fail("Microphone disconnected. Unfinished speech may need repeating.");
    }, { once: true });
    for (const track of stream.getAudioTracks()) track.addEventListener("mute", () => {
      if (epoch === this.epoch && this.stream && track.muted) this.fail("The microphone was interrupted. Your saved messages remain in chat.");
    });
  }
  connect(grant, epoch) {
    const env = this.environment;
    this.sequence = 0;
    return new Promise((resolve, reject) => {
      const socket = new env.WebSocket(this.url);
      this.socket = socket;
      const timeout = env.setTimeout(() => { reject(new Error("Live connection timed out.")); socket.close(); }, 12000);
      this.connectionReject = reject;
      socket.onopen = () => {
        if (epoch !== this.epoch) { socket.close(); return; }
        socket.send(JSON.stringify({ type: "authenticate", ticket: grant.ticket }));
      };
      socket.onmessage = ({ data }) => {
        if (epoch !== this.epoch) return;
        try {
          const event = JSON.parse(data);
          if (event.type === "ready") {
            env.clearTimeout(timeout);
            this.state = "connected";
            this.connectionGeneration = event.generation;
            this.heartbeat = env.setInterval(() => {
              if (socket.readyState === 1 && socket.bufferedAmount < 65536) socket.send(JSON.stringify({ type: "ping" }));
            }, 5000);
            resolve();
          }
          if (event.type.startsWith("assistant_")) {
            if (event.session_id !== this.sessionId || event.generation !== this.connectionGeneration) return;
            if (["assistant_thinking", "assistant_started"].includes(event.type)) this.playback?.begin(event);
            if (event.type === "assistant_audio") { this.playback?.frame(event); return; }
            if (event.type === "assistant_audio_end") this.playback?.finish(event);
            if (["assistant_completed", "assistant_interrupted"].includes(event.type)
                && this.playback?.binding?.active_generation_id === event.active_generation_id) this.playback.clear();
          }
          if (event.type === "transcript_final") {
            if (!validId(event.message_id) || !validId(event.conversation_id)
                || (this.scope.conversation_id && event.conversation_id !== this.scope.conversation_id)
                || (this.scope.legacy_id && event.legacy_id !== this.scope.legacy_id)) throw new Error("Live scope mismatch.");
            if (this.boundConversation && this.boundConversation !== event.conversation_id) throw new Error("Live binding changed.");
            this.boundConversation = event.conversation_id;
            if (this.receipts.has(event.message_id)) { this.receipts.set(event.message_id, event); return; }
            this.receipts.set(event.message_id, event);
            if (this.receipts.size > 256) this.receipts.delete(this.receipts.keys().next().value);
          }
          if (event.type === "ended" || event.type === "error") {
            env.clearTimeout(timeout);
            reject(new Error("Live connection ended."));
            this.cleanupCapture();
            env.clearInterval(this.heartbeat);
            this.state = "idle";
            this.endResolve?.();
          }
          if (event.type !== "pong") this.onEvent(event);
        } catch { this.fail("Live connection could not be reconciled. Unfinished speech may need repeating."); }
      };
      socket.onerror = () => reject(new Error("Live connection unavailable."));
      socket.onclose = () => {
        env.clearTimeout(timeout);
        reject(new Error("Live connection closed."));
        if (epoch !== this.epoch) return;
        env.clearInterval(this.heartbeat);
        this.cleanupCapture();
        this.state = "idle";
        this.endResolve?.();
        this.onEvent({ type: "disconnected", message: "Saved speech remains in chat. Unfinished speech may need repeating." });
      };
    });
  }
  async attachCapture(epoch) {
    const context = this.audioContext;
    await context.audioWorklet.addModule(new URL("./realtime-worklet.js", import.meta.url));
    if (epoch !== this.epoch || this.state !== "connected" || !this.stream) return;
    const node = new this.environment.AudioWorkletNode(context, "legarya-realtime-capture", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    this.worklet = node;
    node.port.onmessage = ({ data }) => {
      if (epoch !== this.epoch || !this.stream) return;
      if (data.type === "overrun") return this.fail("Audio could not keep up. Please repeat unfinished speech.");
      if (data.type === "speech_started") { if (!this.muted) { this.stopSpeaking(); this.onEvent({ type: "listening" }); } return; }
      if (data.type === "energy") { this.onEvent({ type: "input_energy", value: this.muted ? 0 : data.value }); return; }
      if (data.type !== "pcm") return;
      const bytes = new Uint8Array(data.pcm);
      if (bytes.length !== 2400 || this.socket?.readyState !== 1 || this.socket.bufferedAmount > 65536) {
        return this.fail("Live audio connection is too slow. Please repeat unfinished speech.");
      }
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      this.socket.send(JSON.stringify({ type: "audio_frame", sequence: this.sequence++, pcm: this.environment.btoa(binary) }));
      node.port.postMessage("ack");
    };
    this.source = context.createMediaStreamSource(this.stream);
    this.source.connect(node);
    node.connect(context.destination); // worklet writes silence only
    this.setMuted(this.muted);
    this.onEvent({ type: "listening" });
  }
  setMuted(muted) {
    this.muted = Boolean(muted);
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = !this.muted; });
    this.worklet?.port.postMessage({ type: "mute", muted: this.muted });
    this.onEvent({ type: "mute_changed", muted: this.muted });
  }
  async resumeCapture() {
    if (this.state !== "connected" || this.stream) return;
    const epoch = this.epoch;
    try {
      await this.acquireMicrophone(epoch);
      if (epoch === this.epoch) await this.attachCapture(epoch);
    } catch (error) { if (epoch === this.epoch) this.invalidate(); throw error; }
  }
  cleanupCapture() {
    this.playback?.clear();
    this.playback = null;
    this.releaseOutput?.();
    this.releaseOutput = null;
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((track) => track.stop());
    this.worklet?.port.postMessage("stop");
    this.worklet?.disconnect();
    this.source?.disconnect();
    if (this.audioContext) { this.audioContext.onstatechange = null; void this.audioContext.close().catch(() => {}); }
    this.audioContext = this.worklet = this.source = null;
  }
  sendPlayback(event) {
    if (this.socket?.readyState !== 1 || this.socket.bufferedAmount > 65536) {
      this.fail("Playback acknowledgement could not be delivered."); return;
    }
    this.socket.send(JSON.stringify(event));
  }
  stopSpeaking() {
    const binding = this.playback?.clear(); // local stop always precedes network I/O
    if (binding) this.sendPlayback({ type: "interrupt", ...binding });
  }
  fail(message) { this.onEvent({ type: "error", message }); this.invalidate(); }
  invalidate() {
    ++this.epoch;
    this.cleanupCapture();
    this.environment.clearInterval(this.heartbeat);
    this.connectionReject?.(new Error("Chat selection changed."));
    this.socket?.close();
    this.socket = null;
    this.state = "idle";
    this.boundConversation = null;
    this.sessionId = null;
  }
  async stop() {
    this.cleanupCapture();
    if (this.socket?.readyState !== 1) { this.invalidate(); return; }
    this.state = "ending";
    const ended = new Promise((resolve) => { this.endResolve = resolve; });
    this.socket.send(JSON.stringify({ type: "end_call" }));
    let timer;
    await Promise.race([ended, new Promise((resolve) => { timer = this.environment.setTimeout(resolve, 2500); })]);
    this.environment.clearTimeout(timer);
    this.invalidate();
  }
  async reconnect() {
    if (!this.sessionId || this.state !== "idle") throw new Error("No disconnected session to reconcile.");
    const epoch = ++this.epoch;
    this.state = "starting";
    try {
      const grant = await this.api(`/realtime/sessions/${this.sessionId}/reconnect`, { method: "POST", authenticated: true });
      if (epoch !== this.epoch) return;
      await this.connect(grant, epoch);
      // Explicit reconciliation only. No old audio or automatic mic replay.
    } catch (error) { if (epoch === this.epoch) this.invalidate(); throw error; }
  }
  dispose() {
    this.invalidate();
    this.environment.removeEventListener?.("pagehide", this.onNavigation);
    this.environment.removeEventListener?.("popstate", this.onNavigation);
  }
}
