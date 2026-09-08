// Presentation data only, computed from L15's already-decoded assistant samples.
export function outputEnvelope(samples, rate = 24000) {
  const size = Math.round(rate * .02), points = [];
  for (let offset = 0; offset < samples.length; offset += size) {
    const end = Math.min(offset + size, samples.length);
    let sum = 0;
    for (let i = offset; i < end; i++) sum += samples[i] * samples[i];
    points.push({ offset: offset / rate, duration: (end - offset) / rate,
      value: Math.min(1, 6 * Math.sqrt(sum / (end - offset))) });
  }
  return points;
}

export class MouthEnvelope {
  constructor() { this.reset(); }
  reset() { this.value = 0; this.open = false; this.quiet = 0; }
  step(energy, seconds) {
    const dt = Math.min(.2, Math.max(0, seconds));
    const e = Number.isFinite(energy) ? Math.min(1, Math.max(0, energy)) : 0;
    if (e >= .08) this.open = true;
    if (e <= .04) this.open = false;
    const target = this.open ? e : 0;
    this.quiet = target ? 0 : this.quiet + dt;
    this.value += (target - this.value) * (1 - Math.exp(-dt / (target > this.value ? .03 : .09)));
    if (this.quiet >= .15) this.value = 0;
    return this.value;
  }
}
