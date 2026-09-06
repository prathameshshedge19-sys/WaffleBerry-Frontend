// Mono PCM is scheduled on the AudioContext clock. A frame is acknowledged only
// after its source ended AND the output latency elapsed on that same clock.
export class RealtimePlayback {
  constructor({ context, environment = globalThis, send, onState = () => {}, onFault = () => {}, onEnergy = () => {} }) {
    Object.assign(this, { context, environment, send, onState, onFault, onEnergy });
    this.nodes = new Set();
    this.timers = new Set();
    this.retired = new Set();
    this.binding = null;
  }
  same(event) {
    return this.binding && Object.keys(this.binding).every((key) => this.binding[key] === event[key]);
  }
  begin(event) {
    if (this.retired.has(event.active_generation_id)) return;
    if (this.binding?.active_generation_id === event.active_generation_id) {
      if (event.response_id && this.binding.response_id && event.response_id !== this.binding.response_id) throw new Error("Response changed.");
      if (event.response_id) this.binding.response_id = event.response_id;
      return;
    }
    if (this.binding) throw new Error("Overlapping live responses.");
    this.binding = Object.fromEntries(["session_id", "generation", "turn_id", "active_generation_id", "response_id"].map((key) => [key, event[key]]));
    this.sequence = this.playedSequence = -1;
    this.samples = this.played = 0;
    this.nextTime = this.context.currentTime;
    this.end = null;
    this.acknowledged = false;
    this.onState("thinking");
  }
  at(time, fn, binding = this.binding) {
    const check = () => {
      if (this.binding !== binding) return;
      if (this.context.state !== "running") { this.onFault("Audio playback paused. The response was interrupted."); return; }
      if (this.context.currentTime < time) { schedule(); return; }
      fn();
    };
    const schedule = () => {
      const id = this.environment.setTimeout(() => { this.timers.delete(id); check(); }, Math.max(5, (time - this.context.currentTime) * 1000));
      this.timers.add(id);
    };
    schedule();
  }
  frame(event) {
    if (!this.same(event)) return; // retired generation never resumes playback
    if (event.sequence !== this.sequence + 1 || this.end || typeof event.pcm !== "string" || event.pcm.length > 64000) throw new Error("Invalid live audio order.");
    const binary = this.environment.atob(event.pcm);
    if (!binary.length || binary.length % 2 || binary.length > 48000) throw new Error("Invalid live audio frame.");
    const count = binary.length / 2;
    if (this.samples + count - this.played > 480000 || this.nodes.size >= 512) throw new Error("Live playback queue overflow.");
    const buffer = this.context.createBuffer(1, count, 24000);
    const floats = buffer.getChannelData(0);
    for (let i = 0; i < count; i++) {
      const n = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
      floats[i] = (n >= 32768 ? n - 65536 : n) / 32768;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    const start = Math.max(this.context.currentTime + .025, this.nextTime);
    this.nextTime = start + buffer.duration;
    this.samples += count;
    this.sequence = event.sequence;
    const samples = this.samples, sequence = this.sequence, binding = this.binding;
    this.nodes.add(source);
    this.at(start, () => {
      this.onState("speaking");
      this.onEnergy(Math.min(1, Math.sqrt(floats.reduce((sum, n) => sum + n * n, 0) / floats.length) * 6));
      if (sequence === 0) this.send({ type: "playback_started", ...binding, sequence: -1, samples: 0 });
    });
    source.onended = () => {
      source.disconnect();
      if (this.binding !== binding) return;
      this.at(this.nextTimeFor(source), () => {
        this.nodes.delete(source);
        // Scheduling order is authoritative; delayed callbacks can coalesce.
        if (sequence > this.playedSequence) {
          this.playedSequence = sequence; this.played = samples;
          this.send({ type: "playback_progress", ...binding, sequence, samples });
        }
        if (!this.nodes.size) { this.onEnergy(0); this.onState("listening"); }
        this.drain();
      }, binding);
    };
    source.legaryaEnd = this.nextTime + Math.max(.05, this.context.outputLatency || 0) + (this.context.baseLatency || 0);
    source.start(start);
  }
  nextTimeFor(source) { return source.legaryaEnd; }
  finish(event) {
    if (!this.same(event)) return;
    if (event.sequence !== this.sequence || event.samples !== this.samples || typeof event.seal !== "string" || event.seal.length !== 43) throw new Error("Playback receipt does not match audio.");
    this.end = event;
    this.drain();
  }
  drain() {
    if (!this.end || this.nodes.size || this.played !== this.samples || this.acknowledged) return;
    this.acknowledged = true;
    this.send({ type: "playback_drained", ...this.binding, sequence: this.sequence, samples: this.samples, seal: this.end.seal });
  }
  clear() {
    const previous = this.binding;
    this.binding = null; // fence callbacks before stop() triggers onended
    if (previous) {
      this.retired.add(previous.active_generation_id);
      if (this.retired.size > 256) this.retired.delete(this.retired.values().next().value);
    }
    for (const timer of this.timers) this.environment.clearTimeout(timer);
    this.timers.clear();
    for (const source of this.nodes) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); }
    this.nodes.clear();
    this.onEnergy(0);
    this.onState("listening");
    return previous;
  }
}
