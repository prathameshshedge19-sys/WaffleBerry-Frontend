import * as THREE from "./three.module.min.js";

// A flat, source-derived mesh. No scene inference, generated video, or audio owner.
export function createPortraitRenderer(host, bundle, { environment = globalThis, sample = () => ({}), staticPhoto = false, onFallback = () => {} } = {}) {
  const doc = host.ownerDocument, rig = bundle.rig;
  const poster = doc.createElement("img");
  poster.src = bundle.posterUrl; poster.alt = ""; poster.className = "visual-presence-poster";
  host.replaceChildren(poster);
  let renderer, geometry, texture, material, mesh, scene, camera, canvas;
  let disposed = false, raf = null, previous = 0, last = 0, frameCount = 0, slow = 0, tier = 0;
  let nextBlink = 4, blinkStart = -1, elapsed = 0;
  const costs = [], motion = environment.matchMedia?.("(prefers-reduced-motion: reduce)");
  const stats = { frames: 0, tier: 0, p95Ms: 0, static: true };
  function cancelFrame() { if (raf !== null) environment.cancelAnimationFrame(raf); raf = null; }
  function releaseGPU() {
    cancelFrame(); canvas?.removeEventListener("webglcontextlost", contextLost);
    geometry?.dispose(); material?.dispose(); texture?.dispose();
    renderer?.dispose(); renderer?.forceContextLoss(); canvas?.remove();
    renderer = geometry = material = texture = mesh = scene = camera = canvas = null;
    poster.hidden = false; stats.static = true;
  }
  function fallback() { releaseGPU(); tier = 3; stats.tier = tier; try { onFallback(); } catch {} }
  function contextLost(event) { event.preventDefault(); fallback(); }
  function render(mouth = 0, blink = 0, breath = 0, tilt = 0) {
    if (!renderer) return;
    const positions = geometry.attributes.position;
    for (let i = 0; i < rig.vertices.length; i++) {
      const [x,y] = rig.vertices[i];
      const offset = mouth * rig.deformations.mouth[i] + blink * (rig.deformations.blink_left[i] + rig.deformations.blink_right[i]);
      positions.setXYZ(i, x * 2 - 1, 1 - 2 * (y + offset), 0);
    }
    positions.needsUpdate = true;
    mesh.scale.setScalar(1 + breath); mesh.rotation.z = tilt;
    renderer.render(scene, camera);
  }
  function frame(now) {
    raf = null; if (disposed || !renderer || staticPhoto || motion?.matches || doc.hidden) return;
    const interval = tier ? 50 : 1000 / 30;
    if (now - last >= interval - .5) {
      const start = environment.performance.now(), dt = Math.min(.2, previous ? (now - previous) / 1000 : interval / 1000);
      previous = last = now; elapsed += dt;
      try {
        const pose = sample(dt, now) || {};
        if (elapsed >= nextBlink && tier < 2) { blinkStart = elapsed; nextBlink = elapsed + 3 + (Math.sin(++frameCount * 12.9898) + 1) * 2; }
        const phase = elapsed - blinkStart;
        const blink = tier < 2 && blinkStart >= 0 && phase < .16 ? Math.sin(phase / .16 * Math.PI) : 0;
        const idle = tier < 2 && !["LOADING", "ERROR", "DISABLED", "INTERRUPTED"].includes(pose.state);
        render(Math.min(1, Math.max(0, Number(pose.mouth) || 0)), blink, idle ? .002 * (1 + Math.sin(elapsed * 1.15)) : 0, idle ? .004 * Math.sin(elapsed * .45) : 0);
        costs.push(environment.performance.now() - start); if (costs.length > 120) costs.shift(); ++stats.frames;
        if (costs.length >= 30) {
          stats.p95Ms = [...costs].sort((a,b) => a-b)[Math.ceil(costs.length * .95) - 1];
          slow = stats.p95Ms > 4 ? slow + 1 : 0;
          if (slow >= 30) { slow = 0; costs.length = 0; stats.tier = ++tier; if (tier >= 3) return fallback(); }
        }
      } catch { return fallback(); }
    }
    if (!disposed && renderer) raf = environment.requestAnimationFrame(frame);
  }
  function updateMotion() {
    cancelFrame(); previous = last = 0;
    if (!renderer || disposed) return;
    if (staticPhoto || motion?.matches || doc.hidden) { canvas.hidden = true; poster.hidden = false; stats.static = true; return; }
    canvas.hidden = false; poster.hidden = true; stats.static = false;
    raf = environment.requestAnimationFrame(frame);
  }
  try {
    renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: "low-power", preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(1.5, environment.devicePixelRatio || 1));
    renderer.setSize(Math.min(512, 768 / renderer.getPixelRatio()), Math.min(512, 768 / renderer.getPixelRatio()), false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvas = renderer.domElement; canvas.className = "visual-presence-canvas"; canvas.setAttribute("aria-hidden", "true");
    canvas.addEventListener("webglcontextlost", contextLost); host.append(canvas);
    texture = new THREE.Texture(bundle.bitmap); texture.colorSpace = THREE.SRGBColorSpace;
    // ImageBitmap is already upright. Its origin and the numeric rig are top-left.
    texture.flipY = false; texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(rig.vertices.length * 3), 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(rig.uvs.flat(), 2));
    geometry.setIndex(rig.triangles.flat());
    material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
    mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false;
    scene = new THREE.Scene(); scene.add(mesh); camera = new THREE.OrthographicCamera(-1,1,1,-1,.1,10); camera.position.z = 1;
    render(); updateMotion();
  } catch { fallback(); }
  motion?.addEventListener("change", updateMotion); doc.addEventListener("visibilitychange", updateMotion);
  return Object.freeze({
    setStatic(value) { staticPhoto = Boolean(value); updateMotion(); },
    reset() { if (!disposed) { try { render(); } catch { fallback(); } } },
    diagnostics: () => ({ ...stats, gpuResources: renderer ? 4 : 0, animationFrames: raf === null ? 0 : 1 }),
    dispose() { if (disposed) return; disposed = true; motion?.removeEventListener("change", updateMotion); doc.removeEventListener("visibilitychange", updateMotion); releaseGPU(); poster.removeAttribute("src"); poster.remove(); },
  });
}
