// Streaming band-limited resampling, fixed storage, PCM16 little endian.
// A 64-tap Blackman-windowed sinc removes above-Nyquist input before decimation.
export class PCMResampler {
  constructor(inputRate, frameSamples = 1200) {
    if (!Number.isFinite(inputRate) || inputRate < 8000 || inputRate > 192000) throw new Error("Unsupported sample rate");
    this.ratio = inputRate / 24000;
    this.ring = new Float32Array(8192);
    this.total = 0;
    this.position = 0;
    this.frameSamples = frameSamples;
    this.frame = new ArrayBuffer(frameSamples * 2);
    this.view = new DataView(this.frame);
    this.used = 0;
    const cutoff = 0.45 * Math.min(1, 24000 / inputRate);
    this.kernels = Array.from({ length: 1024 }, (_, phase) => {
      const kernel = new Float64Array(64);
      let sum = 0;
      for (let tap = 0; tap < 64; tap += 1) {
        const x = tap - 31 - phase / 1024;
        const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
        const window = 0.42 - 0.5 * Math.cos(2 * Math.PI * tap / 63) + 0.08 * Math.cos(4 * Math.PI * tap / 63);
        kernel[tap] = sinc * window; sum += kernel[tap];
      }
      return kernel.map((weight) => weight / sum);
    });
  }
  push(samples, emit) {
    // Consume incrementally so storage never depends on caller block size.
    for (const value of samples) {
      this.ring[this.total % this.ring.length] = Number.isFinite(value) ? value : 0;
      this.total += 1;
      while (Math.floor(this.position) + 32 < this.total) {
        const center = Math.floor(this.position);
        const kernel = this.kernels[Math.floor((this.position - center) * 1024)];
        let output = 0;
        for (let tap = 0; tap < 64; tap += 1) {
          const index = center + tap - 31;
          if (index >= 0) output += this.ring[index % this.ring.length] * kernel[tap];
        }
        output = Math.max(-1, Math.min(1, output));
        this.view.setInt16(this.used * 2, Math.round(output * (output < 0 ? 32768 : 32767)), true);
        this.used += 1;
        this.position += this.ratio;
        if (this.used === this.frameSamples) {
          emit(this.frame);
          this.frame = new ArrayBuffer(this.frameSamples * 2);
          this.view = new DataView(this.frame);
          this.used = 0;
        }
      }
    }
  }
}
