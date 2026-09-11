import { RealtimePlayback } from "./realtime-playback.mjs?v=l19c1";
const validId = (id) => Number.isSafeInteger(id) && id > 0;
const validateScope = (scope) => {
  if (validId(scope.conversation_id) && Object.keys(scope).length === 1) return { ...scope };
  if (validId(scope.legacy_id) && ["rya", "legacy"].includes(scope.mode) && Object.keys(scope).length === 2) return { ...scope };
  throw new Error("Select an existing chat or a Legacy and mode.");
};

export class RealtimeClient {
  constructor({ api, websocketUrl, onEvent = () => {}, onPresentation = () => {}, environment = globalThis }) {
    this.api = api;
    this.environment = environment;
    const url = new URL(websocketUrl, environment.location.href);
    if (!["wss:", "ws:"].includes(url.protocol) || url.search || url.username || url.password
        || (url.protocol === "ws:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
      throw new Error("Live voice requires a secure backend WebSocket.");
    }
    this.url = url.href;
    this.onEvent = onEvent;
    this.onPresentation = onPresentation;
    this.epoch = 0;
    this.receipts = new Map();
    this.endings = new Set();
    this.socket = null;
    this.state = "idle";
    this.muted = false;
    this.identityEpoch = environment.LegaryaAuthApi?.getSessionEpoch?.();
    this.onNavigation = () => this.invalidate();
    this.fenceEvents = ["pagehide", "popstate", "legarya:session-ending", "legarya:session-expired", "legarya:android-sensitive-stop"];
    for (const name of this.fenceEvents) environment.addEventListener?.(name, this.onNavigation);
  }
  current(epoch) {
    return epoch === this.epoch && !this.disposed
      && this.identityEpoch === this.environment.LegaryaAuthApi?.getSessionEpoch?.();
  }
  async request(path, body) {
    const controller = new AbortController();
    this.requestController = controller;
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw new Error("Live request cancelled.");
          return this.api(path, { method: "POST", authenticated: true, retry: false, body, signal: controller.signal });
        }),
        new Promise((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("Live request cancelled.")), { once: true });
          timer = this.environment.setTimeout(() => controller.abort(), 12000);
        }),
      ]);
    } finally {
      this.environment.clearTimeout(timer);
      if (this.requestController === controller) this.requestController = null;
    }
  }
  async start(scope) {
    if (this.state !== "idle" || this.disposed) throw new Error("A live connection is already active.");
    this.identityEpoch = this.environment.LegaryaAuthApi?.getSessionEpoch?.();
    this.scope = Object.freeze(validateScope(scope));
    this.receipts.clear();
    this.sessionId = null;
    this.boundConversation = null;
    const epoch = ++this.epoch;
    this.state = "starting";
    try {
      await this.acquireMicrophone(epoch);
      if (!this.current(epoch)) return;
      const grant = await this.request("/realtime/sessions", this.scope);
      if (!this.current(epoch)) return;
      this.sessionId = grant.session_id;
      await this.connect(grant, epoch);
      if (this.current(epoch)) await this.attachCapture(epoch);
    } catch (error) {
      if (!this.current(epoch)) return;
      this.invalidate();
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
    if (!this.current(epoch)) return;
    await env.LegaryaVoice?.prepareLive?.(() => this.current(epoch));
    if (!this.current(epoch)) return;
    if (env.LegaryaVoice?.isCapturing()) throw new Error("Finish L12 dictation before starting live voice.");
    env.LegaryaVoice?.stopSpeech();
    if (env.LegaryaAudioOwnership) {
      const release = await env.LegaryaAudioOwnership.acquire();
      if (!this.current(epoch)) { release(); return; }
      this.releaseOutput = release;
    }
    context.onstatechange = () => {
      if (this.current(epoch) && this.audioContext === context && ["interrupted", "suspended"].includes(context.state)) {
        this.fail("Audio was interrupted. Your call has ended; saved messages remain in chat.");
      }
    };
    this.playback = new RealtimePlayback({ context, environment: env,
      onPresentation: (event) => { if (this.current(epoch)) { try { this.onPresentation(event); } catch {} } },
      send: (event) => { if (this.current(epoch)) this.sendPlayback(event); },
      onState: (state) => { if (this.current(epoch)) this.onEvent({ type: state }); },
      onEnergy: (value) => { if (this.current(epoch)) this.onEvent({ type: "output_energy", value }); },
      onFault: (message) => { if (this.current(epoch)) this.fail(message); } });
    this.captureController = new AbortController();
    const stream = await env.LegaryaMicrophone.capture({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false }, { signal: this.captureController.signal });
    if (!this.current(epoch)) { stream.getTracks().forEach((track) => track.stop()); return; }
    this.stream = stream;
    this.trackListeners = [];
    const listen = (track, type, callback) => {
      track.addEventListener(type, callback);
      this.trackListeners.push(() => track.removeEventListener?.(type, callback));
    };
    for (const track of stream.getTracks()) listen(track, "ended", () => {
      if (this.current(epoch) && this.stream === stream) this.fail("Microphone disconnected. Unfinished speech may need repeating.");
    });
    for (const track of stream.getAudioTracks()) listen(track, "mute", () => {
      if (this.current(epoch) && this.stream === stream && track.muted) this.fail("The microphone was interrupted. Your saved messages remain in chat.");
    });
  }
  connect(grant, epoch) {
    const env = this.environment;
    if (typeof grant?.ticket !== "string" || grant.ticket.length > 128 || !grant.ticket
        || typeof grant.session_id !== "string" || grant.session_id !== this.sessionId) throw new Error("Invalid live grant.");
    let ticket = grant.ticket;
    delete grant.ticket;
    this.sequence = 0;
    return new Promise((resolve, reject) => {
      const socket = new env.WebSocket(this.url);
      this.socket = socket;
      let ready = false;
      const valid = () => this.current(epoch) && this.socket === socket;
      const timeout = env.setTimeout(() => { if (valid()) this.fail("Live connection timed out."); }, 12000);
      this.cancelConnection = () => { ticket = null; env.clearTimeout(timeout); reject(new Error("Live connection ended.")); };
      socket.onopen = () => {
        if (!valid()) { ticket = null; socket.close(); return; }
        if (!ticket) return;
        try { socket.send(JSON.stringify({ type: "authenticate", ticket })); }
        catch { this.fail("Live connection unavailable."); }
        finally { ticket = null; }
      };
      socket.onmessage = ({ data }) => {
        if (!valid()) return;
        try {
          if (typeof data !== "string" || data.length > 96000) throw new Error("Invalid live message.");
          const event = JSON.parse(data);
          if (!event || Array.isArray(event) || typeof event.type !== "string" || event.type.length > 64) throw new Error("Invalid live message.");
          if (event.type === "ready") {
            if (!validId(event.generation) || event.session_id !== this.sessionId) throw new Error("Invalid live binding.");
            if (ready) {
              if (event.generation !== this.connectionGeneration) throw new Error("Live generation changed.");
              return;
            }
            ready = true;
            env.clearTimeout(timeout);
            this.state = "connected";
            this.connectionGeneration = event.generation;
            this.heartbeat = env.setInterval(() => {
              if (valid() && socket.readyState === 1 && socket.bufferedAmount < 65536) {
                try { socket.send(JSON.stringify({ type: "ping" })); } catch { this.fail("Live connection unavailable."); }
              }
            }, 5000);
            resolve();
            this.onEvent(event);
            return;
          }
          if (event.type === "ended" || event.type === "error") {
            this.invalidate();
            this.onEvent(event);
            return;
          }
          if (!ready) {
            if (event.type === "connecting" && event.session_id === this.sessionId) return;
            throw new Error("Live connection is not ready.");
          }
          if (event.type.startsWith("assistant_")) {
            if (event.session_id !== this.sessionId || event.generation !== this.connectionGeneration) return;
            if (!validId(event.turn_id) || typeof event.active_generation_id !== "string" || !event.active_generation_id
                || event.active_generation_id.length > 128 || (event.response_id != null && (typeof event.response_id !== "string" || event.response_id.length > 128))) throw new Error("Invalid live response.");
            if (["assistant_thinking", "assistant_started"].includes(event.type)) this.playback?.begin(event);
            if (event.type === "assistant_audio") { this.playback?.frame(event); return; }
            if (event.type === "assistant_audio_end") this.playback?.finish(event);
            if (["assistant_completed", "assistant_interrupted"].includes(event.type)
                && this.playback?.binding?.active_generation_id === event.active_generation_id) this.playback.clear();
            if (["assistant_completed", "assistant_interrupted"].includes(event.type)) {
              const key = `${event.type}:${event.active_generation_id}`;
              if (this.completions?.has(key)) return;
              (this.completions ||= new Set()).add(key);
              if (this.completions.size > 256) this.completions.delete(this.completions.values().next().value);
            }
          }
          if (event.type === "transcript_final") {
            if (!validId(event.message_id) || !validId(event.conversation_id)
                || !validId(event.legacy_id) || typeof event.content !== "string" || event.content.length > 8000
                || !["rya", "legacy"].includes(event.mode) || (this.scope.mode && event.mode !== this.scope.mode)
                || (this.scope.conversation_id && event.conversation_id !== this.scope.conversation_id)
                || (this.scope.legacy_id && event.legacy_id !== this.scope.legacy_id)) throw new Error("Live scope mismatch.");
            if (this.boundConversation && this.boundConversation !== event.conversation_id) throw new Error("Live binding changed.");
            this.boundConversation = event.conversation_id;
            if (this.receipts.has(event.message_id)) { this.receipts.set(event.message_id, event); return; }
            this.receipts.set(event.message_id, event);
            if (this.receipts.size > 256) this.receipts.delete(this.receipts.keys().next().value);
          }
          if (event.type === "transcript_provisional") {
            if (typeof event.item_id !== "string" || event.item_id.length > 128 || typeof event.delta !== "string" || event.delta.length > 8000) throw new Error("Invalid live transcript.");
            if ([...this.receipts.values()].some(receipt => receipt.item_id === event.item_id)) return;
          }
          if (["transcript_final", "transcript_provisional", "utterance_failed", "assistant_completed", "assistant_interrupted", "quota_warning"].includes(event.type)) this.onEvent(event);
        } catch { this.fail("Live connection could not be reconciled. Unfinished speech may need repeating."); }
      };
      socket.onerror = () => { if (valid()) this.fail("Live connection unavailable."); };
      socket.onclose = () => {
        if (!valid()) return;
        if (!ready) { this.fail("Live connection closed."); return; }
        // Retire all callbacks but retain the authorized scope for one explicit
        // reconciliation. No microphone or queued audio crosses this boundary.
        this.invalidate(true);
        this.onEvent({ type: "disconnected", message: "Saved speech remains in chat. Unfinished speech may need repeating." });
      };
    });
  }
  async attachCapture(epoch) {
    const context = this.audioContext;
    await context.audioWorklet.addModule(new URL("./realtime-worklet.js", import.meta.url));
    if (!this.current(epoch) || this.state !== "connected" || !this.stream) return;
    const node = new this.environment.AudioWorkletNode(context, "legarya-realtime-capture", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    this.worklet = node;
    node.port.onmessage = ({ data }) => {
      if (!this.current(epoch) || !this.stream || this.worklet !== node) return;
      if (data.type === "overrun") return this.fail("Audio could not keep up. Please repeat unfinished speech.");
      if (data.type === "speech_started") { if (!this.muted) { this.stopSpeaking(); this.onEvent({ type: "listening", source: "microphone" }); } return; }
      if (data.type === "energy") { this.onEvent({ type: "input_energy", value: this.muted ? 0 : data.value }); return; }
      if (data.type !== "pcm") return;
      const bytes = new Uint8Array(data.pcm);
      if (bytes.length !== 2400 || this.socket?.readyState !== 1 || this.socket.bufferedAmount > 65536) {
        return this.fail("Live audio connection is too slow. Please repeat unfinished speech.");
      }
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      try { this.socket.send(JSON.stringify({ type: "audio_frame", sequence: this.sequence++, pcm: this.environment.btoa(binary) })); }
      catch { return this.fail("Live audio connection unavailable."); }
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
    if (this.state !== "connected" || this.stream || this.resuming) return;
    const epoch = this.epoch;
    this.resuming = true;
    try {
      await this.acquireMicrophone(epoch);
      if (this.current(epoch)) await this.attachCapture(epoch);
    } catch (error) { if (!this.current(epoch)) return; this.invalidate(); throw error; }
    finally { if (this.current(epoch)) this.resuming = false; }
  }
  cleanupCapture() {
    for (const remove of this.trackListeners || []) remove();
    this.trackListeners = [];
    this.captureController?.abort();
    this.captureController = null;
    this.playback?.clear();
    this.playback = null;
    this.releaseOutput?.();
    this.releaseOutput = null;
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((track) => track.stop());
    this.worklet?.port.postMessage("stop");
    if (this.worklet) this.worklet.port.onmessage = null;
    this.worklet?.disconnect();
    this.source?.disconnect();
    if (this.audioContext) { this.audioContext.onstatechange = null; void this.audioContext.close().catch(() => {}); }
    this.audioContext = this.worklet = this.source = null;
  }
  sendPlayback(event) {
    if (this.socket?.readyState !== 1 || this.socket.bufferedAmount > 65536) {
      this.fail("Playback acknowledgement could not be delivered."); return;
    }
    try { this.socket.send(JSON.stringify(event)); }
    catch { this.fail("Playback acknowledgement could not be delivered."); }
  }
  stopSpeaking() {
    const binding = this.playback?.clear(); // local stop always precedes network I/O
    if (binding) this.sendPlayback({ type: "interrupt", ...binding });
  }
  fail(message) { this.invalidate(); this.onEvent({ type: "error", message }); }
  invalidate(reconcile = false) {
    ++this.epoch;
    this.requestController?.abort();
    this.requestController = null;
    this.cleanupCapture();
    this.environment.clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.cancelConnection?.();
    this.cancelConnection = null;
    this.socket?.close();
    this.socket = null;
    this.state = "idle";
    this.resuming = false;
    this.connectionGeneration = null;
    if (!reconcile) {
      for (const end of this.endings) end();
      this.boundConversation = this.sessionId = this.scope = null;
      this.receipts.clear();
      this.completions?.clear();
    }
  }
  async stop() {
    // Fence immediately, but give the server its existing bounded finalization
    // window. The detached socket can only resolve its own shutdown operation.
    const socket = this.socket;
    const open = socket?.readyState === 1;
    if (open) this.socket = null;
    this.invalidate();
    if (!open) return;
    await new Promise(resolve => {
      let timer, done = false;
      const finish = () => {
        if (done) return;
        done = true; this.environment.clearTimeout(timer); this.endings.delete(finish);
        socket.onmessage = socket.onerror = socket.onclose = socket.onopen = null;
        socket.close(); resolve();
      };
      this.endings.add(finish);
      socket.onopen = null;
      socket.onmessage = ({ data }) => {
        if (typeof data !== "string" || data.length > 96000) return finish();
        try { const event = JSON.parse(data); if (["ended", "error"].includes(event?.type)) finish(); } catch { finish(); }
      };
      socket.onclose = socket.onerror = finish;
      timer = this.environment.setTimeout(finish, 2500);
      try { socket.send(JSON.stringify({ type: "end_call" })); } catch { finish(); }
    });
  }
  async reconnect() {
    if (!this.sessionId || this.state !== "idle" || !this.current(this.epoch)) throw new Error("No disconnected session to reconcile.");
    const epoch = ++this.epoch;
    this.state = "starting";
    try {
      const grant = await this.request(`/realtime/sessions/${this.sessionId}/reconnect`);
      if (!this.current(epoch)) return;
      await this.connect(grant, epoch);
      // Explicit reconciliation only. No old audio or automatic mic replay.
    } catch (error) { if (!this.current(epoch)) return; this.invalidate(); throw error; }
  }
  dispose() {
    this.invalidate();
    this.disposed = true;
    for (const name of this.fenceEvents) this.environment.removeEventListener?.(name, this.onNavigation);
  }
}
