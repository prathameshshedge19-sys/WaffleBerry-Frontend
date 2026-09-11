import { createRyaRenderer } from "./rya-renderer.mjs";

const mount = document.querySelector("[data-rya-canvas], #rya-canvas");
if (mount) {
  window.RyaEnergyControl = window.LEGARYA_FORCE_STATIC_RYA
    ? {
        active: true,
        setActive(active) { this.active = Boolean(active); },
        setPlaybackEnergy() {},
        setSpeechEnergy() {},
        dispose() { this.active = false; },
      }
    : createRyaRenderer(mount);
  window.dispatchEvent(new CustomEvent("rya-ready"));
}
