import { createRyaRenderer } from "./rya-renderer.mjs";

const mount = document.querySelector("[data-rya-canvas], #rya-canvas");
if (mount) {
  window.RyaEnergyControl = createRyaRenderer(mount);
  window.dispatchEvent(new CustomEvent("rya-ready"));
}
