import { PCMResampler } from "./realtime-pcm.mjs";

class RealtimeCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.resampler = new PCMResampler(sampleRate);
    this.pending = 0;
    this.running = true;
    this.voiced = 0;
    this.quiet = 0;
    this.speech = false;
    this.muted = false;
    this.energySamples = 0;
    this.port.onmessage = ({ data }) => {
      if (data === "ack") this.pending = Math.max(0, this.pending - 1);
      if (data === "stop") this.running = false;
      if (data?.type === "mute" && this.muted !== data.muted) {
        this.muted = data.muted;
        this.resampler = new PCMResampler(sampleRate);
        this.voiced = this.quiet = 0;
        this.speech = false;
      }
    };
  }
  process(inputs) {
    if (!this.running) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    const mono = new Float32Array(channels[0].length);
    for (const channel of channels) {
      for (let i = 0; i < mono.length; i += 1) mono[i] += channel[i] / channels.length;
    }
    if (this.muted) mono.fill(0);
    // Local onset detection runs before PCM transport. Echo cancellation is
    // requested on capture; provider VAD is a secondary server-side safeguard.
    const rms = Math.sqrt(mono.reduce((sum, value) => sum + value * value, 0) / mono.length);
    this.energySamples += mono.length;
    if (this.energySamples >= sampleRate / 10) {
      this.energySamples = 0;
      this.port.postMessage({ type: "energy", value: Math.min(1, rms * 8) });
    }
    if (rms > .025) {
      this.voiced += mono.length; this.quiet = 0;
      if (!this.speech && this.voiced >= sampleRate * .06) {
        this.speech = true; this.port.postMessage({ type: "speech_started" });
      }
    } else {
      this.voiced = 0; this.quiet += mono.length;
      if (this.quiet > sampleRate * .25) this.speech = false;
    }
    this.resampler.push(mono, (pcm) => {
      if (!this.running) return;
      if (this.pending >= 4) {
        this.running = false;
        this.port.postMessage({ type: "overrun" });
        return;
      }
      this.pending += 1;
      this.port.postMessage({ type: "pcm", pcm }, [pcm]);
    });
    // Outputs remain zero: microphone audio is never played locally.
    return this.running;
  }
}
registerProcessor("legarya-realtime-capture", RealtimeCapture);
