import * as THREE from "./three.module.min.js";

const mount = document.querySelector("[data-memory-world]");

if (mount) {
  try {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = matchMedia("(max-width: 640px)").matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
    camera.position.set(0, 0, 5.35);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x050504, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const world = new THREE.Group();
    scene.add(world);

    const makeGlowTexture = (ring = false) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const context = canvas.getContext("2d");
      const gradient = context.createRadialGradient(64, 64, ring ? 26 : 0, 64, 64, 64);
      if (ring) {
        gradient.addColorStop(0, "rgba(255,226,168,0)");
        gradient.addColorStop(0.48, "rgba(255,226,168,0)");
        gradient.addColorStop(0.63, "rgba(255,235,201,.72)");
        gradient.addColorStop(0.76, "rgba(243,201,130,.16)");
        gradient.addColorStop(1, "rgba(217,154,82,0)");
      } else {
        gradient.addColorStop(0, "rgba(255,247,229,1)");
        gradient.addColorStop(0.16, "rgba(255,226,168,.82)");
        gradient.addColorStop(0.45, "rgba(217,154,82,.22)");
        gradient.addColorStop(1, "rgba(200,129,120,0)");
      }
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    const glowTexture = makeGlowTexture();
    const ringTexture = makeGlowTexture(true);

    const atmosphere = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xd99a52,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }));
    atmosphere.scale.set(4.2, 4.2, 1);
    atmosphere.position.z = -0.35;
    atmosphere.renderOrder = -2;
    scene.add(atmosphere);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1.49, mobile ? 32 : 48, mobile ? 24 : 36),
      new THREE.MeshBasicMaterial({ color: 0x080705, transparent: true, opacity: 0.94, depthWrite: true }),
    );
    world.add(globe);

    const clusterDirections = [
      [-0.72, 0.55, 0.42], [0.22, 0.79, 0.57], [0.8, 0.25, 0.54],
      [-0.84, -0.12, 0.51], [0.1, -0.33, 0.94], [0.68, -0.62, 0.39],
      [-0.31, -0.84, 0.45], [0.54, 0.68, -0.5], [-0.66, 0.16, -0.73],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());

    const particleCount = mobile ? 1600 : 2800;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const seeds = new Float32Array(particleCount);
    const direction = new THREE.Vector3();
    const tint = new THREE.Color();
    const ivory = new THREE.Color(0xf5eee4);
    const champagne = new THREE.Color(0xf3c982);
    const rose = new THREE.Color(0xc88178);

    for (let index = 0; index < particleCount; index += 1) {
      const clustered = Math.random() < 0.42;
      if (clustered) {
        const anchor = clusterDirections[Math.floor(Math.random() * clusterDirections.length)];
        direction.copy(anchor).add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.28,
          (Math.random() - 0.5) * 0.28,
          (Math.random() - 0.5) * 0.28,
        )).normalize();
      } else {
        const z = Math.random() * 2 - 1;
        const angle = Math.random() * Math.PI * 2;
        const ring = Math.sqrt(1 - z * z);
        direction.set(Math.cos(angle) * ring, z, Math.sin(angle) * ring);
      }
      const radius = 1.52 + Math.random() * 0.055;
      positions.set(direction.multiplyScalar(radius).toArray(), index * 3);
      tint.copy(ivory).lerp(champagne, Math.random() * 0.72);
      if (Math.random() < 0.045) tint.lerp(rose, 0.34);
      colors.set([tint.r, tint.g, tint.b], index * 3);
      sizes[index] = clustered ? 1.1 + Math.random() * 1.45 : 0.65 + Math.random() * 0.9;
      seeds[index] = Math.random() * 100;
    }

    const shellGeometry = new THREE.BufferGeometry();
    shellGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    shellGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    shellGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    shellGeometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    const shellUniforms = { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uEnergy: { value: 0 } };
    const shellMaterial = new THREE.ShaderMaterial({
      uniforms: shellUniforms,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSize,aSeed;uniform float uTime,uPixelRatio,uEnergy;varying vec3 vColor;varying float vAlpha;void main(){vec3 p=position;float drift=.006*sin(uTime*(.18+fract(aSeed)*.16)+aSeed);p*=1.+drift;vec4 mv=modelViewMatrix*vec4(p,1.);float shimmer=.78+.22*sin(uTime*(.42+fract(aSeed*.37)*.34)+aSeed*2.);gl_PointSize=aSize*uPixelRatio*(4.8/-mv.z)*(1.+uEnergy*.18);gl_Position=projectionMatrix*mv;vColor=color;vAlpha=shimmer*(.5+uEnergy*.12);}`,
      fragmentShader: `varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;float glow=pow(max(0.,1.-d),2.1);if(glow<.012)discard;gl_FragColor=vec4(vColor,glow*vAlpha);}`,
    });
    const shell = new THREE.Points(shellGeometry, shellMaterial);
    shell.frustumCulled = false;
    world.add(shell);

    const clusters = clusterDirections.map((clusterDirection, index) => {
      const material = new THREE.SpriteMaterial({
        map: glowTexture,
        color: index % 5 === 0 ? 0xc88178 : 0xffe2a8,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(clusterDirection).multiplyScalar(1.595);
      const size = 0.12 + (index % 3) * 0.018;
      sprite.scale.setScalar(size);
      world.add(sprite);
      return { direction: clusterDirection, sprite, material, size, phase: index * 1.73, hover: 0 };
    });

    const routePairs = [[0, 2], [0, 4], [1, 3], [1, 5], [2, 6], [2, 7], [3, 6], [4, 7], [4, 8], [5, 8]];
    const routes = routePairs.map(([fromIndex, toIndex], index) => {
      const from = clusterDirections[fromIndex].clone().multiplyScalar(1.59);
      const to = clusterDirections[toIndex].clone().multiplyScalar(1.59);
      const midpoint = from.clone().add(to);
      if (midpoint.lengthSq() < 0.1) midpoint.copy(from).cross(new THREE.Vector3(0, 1, 0));
      midpoint.normalize().multiplyScalar(1.84 + (index % 3) * 0.08);
      const curve = new THREE.QuadraticBezierCurve3(from, midpoint, to);
      const material = new THREE.LineBasicMaterial({
        color: index % 4 === 0 ? 0xe6b978 : 0xf3d7a3,
        transparent: true,
        opacity: 0.11,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(mobile ? 28 : 46)), material);
      world.add(line);
      return { fromIndex, toIndex, curve, line, material, baseOpacity: 0.085 + (index % 3) * 0.018 };
    });

    const pulsePositions = new Float32Array(routes.length * 3);
    const pulseGeometry = new THREE.BufferGeometry();
    pulseGeometry.setAttribute("position", new THREE.BufferAttribute(pulsePositions, 3));
    const pulseMaterial = new THREE.PointsMaterial({
      map: glowTexture,
      color: 0xffe2a8,
      size: 0.085,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const routePulses = new THREE.Points(pulseGeometry, pulseMaterial);
    world.add(routePulses);
    const pulseStates = routes.map((_, index) => ({ active: false, start: 0, next: 0.8 + index * 0.47 + Math.random() * 2, duration: 2.2 + Math.random() * 1.5 }));

    const globalPulse = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ringTexture,
      color: 0xffdfa0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }));
    globalPulse.scale.setScalar(2.5);
    globalPulse.visible = false;
    scene.add(globalPulse);

    const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false };
    let clickStart = -10;
    let visible = false;
    let running = false;
    let lastTime = 0;
    const projected = new THREE.Vector3();

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      const pixelRatio = Math.min(devicePixelRatio, mobile ? 1.25 : 1.6);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = width < 390 ? 5.65 : 5.35;
      camera.updateProjectionMatrix();
      shellUniforms.uPixelRatio.value = pixelRatio;
      window.__ryaDiagnostics.memoryCanvas = [renderer.domElement.width, renderer.domElement.height];
    };

    const setPointer = (event) => {
      const rect = mount.getBoundingClientRect();
      pointer.tx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.ty = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      pointer.active = true;
    };
    mount.addEventListener("pointermove", setPointer, { passive: true });
    mount.addEventListener("pointerleave", () => { pointer.active = false; pointer.tx = pointer.ty = 0; });
    mount.addEventListener("pointerdown", (event) => {
      setPointer(event);
      clickStart = performance.now() * 0.001;
      window.__ryaDiagnostics.memoryInteractions = (window.__ryaDiagnostics.memoryInteractions || 0) + 1;
    }, { passive: true });

    const animate = (milliseconds) => {
      if (!visible) { running = false; return; }
      const time = milliseconds * 0.001;
      const delta = Math.min(0.05, time - lastTime || 0.016);
      lastTime = time;
      const motion = reducedMotion.matches ? 0.24 : 1;

      pointer.x += (pointer.tx - pointer.x) * 0.055;
      pointer.y += (pointer.ty - pointer.y) * 0.055;
      world.rotation.y += delta * 0.052 * motion;
      world.rotation.x = -0.08 + Math.sin(time * 0.11 * motion) * 0.025;
      camera.position.x = pointer.x * 0.105;
      camera.position.y = pointer.y * 0.075;
      camera.lookAt(0, 0, 0);

      world.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      let nearestCluster = -1;
      let nearestDistance = 10;
      clusters.forEach((cluster, index) => {
        projected.copy(cluster.sprite.position).applyMatrix4(world.matrixWorld).project(camera);
        const distance = Math.hypot(projected.x - pointer.x, projected.y - pointer.y);
        if (pointer.active && projected.z < 1 && distance < nearestDistance) {
          nearestDistance = distance;
          nearestCluster = index;
        }
      });

      const clickAge = time - clickStart;
      const clickEnergy = clickAge >= 0 && clickAge < 2.15 ? Math.sin((clickAge / 2.15) * Math.PI) ** 1.4 : 0;
      globalPulse.visible = clickEnergy > 0.002;
      globalPulse.material.opacity = clickEnergy * 0.16;
      globalPulse.scale.setScalar(2.45 + clickEnergy * 2.05);
      atmosphere.material.opacity = 0.1 + clickEnergy * 0.055;
      atmosphere.scale.setScalar(4.15 + clickEnergy * 0.32);
      shellUniforms.uTime.value = time * motion;
      shellUniforms.uEnergy.value = clickEnergy;

      clusters.forEach((cluster, index) => {
        const proximity = index === nearestCluster && nearestDistance < 0.43 ? 1 - THREE.MathUtils.smoothstep(nearestDistance, 0.08, 0.43) : 0;
        cluster.hover += (proximity - cluster.hover) * 0.12;
        const flicker = 0.5 + 0.5 * Math.sin(time * (0.42 + index * 0.025) + cluster.phase);
        const energy = flicker * 0.12 + cluster.hover * 0.72 + clickEnergy * 0.3;
        cluster.material.opacity = 0.52 + energy * 0.42;
        cluster.sprite.scale.setScalar(cluster.size * (1 + energy * 0.42));
      });

      routes.forEach((route, index) => {
        const awake = Math.max(clusters[route.fromIndex].hover, clusters[route.toIndex].hover);
        route.material.opacity = route.baseOpacity + awake * 0.2 + clickEnergy * 0.055;
        const state = pulseStates[index];
        if (!state.active && time >= state.next && !reducedMotion.matches) {
          state.active = true;
          state.start = time;
          state.duration = 2.15 + Math.random() * 1.45;
          window.__ryaDiagnostics.memoryPulses = (window.__ryaDiagnostics.memoryPulses || 0) + 1;
        }
        if (state.active) {
          const progress = (time - state.start) / state.duration;
          if (progress >= 1) {
            state.active = false;
            state.next = time + 2.2 + Math.random() * 4.6;
            pulsePositions.set([99, 99, 99], index * 3);
          } else {
            pulsePositions.set(route.curve.getPoint(progress).toArray(), index * 3);
          }
        } else pulsePositions.set([99, 99, 99], index * 3);
      });
      pulseGeometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
      window.__ryaDiagnostics.memoryFrames = (window.__ryaDiagnostics.memoryFrames || 0) + 1;
      requestAnimationFrame(animate);
    };

    const start = () => {
      if (running || !visible) return;
      running = true;
      lastTime = performance.now() * 0.001;
      requestAnimationFrame(animate);
    };

    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(mount);
    addEventListener("resize", resize, { passive: true });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
      }, { rootMargin: "18% 0px", threshold: 0.01 }).observe(mount);
    } else {
      visible = true;
      start();
    }

    resize();
    mount.classList.add("memory-world-ready");
    window.__ryaDiagnostics.memoryReady = true;

    if (new URLSearchParams(location.search).has("memory-interaction-test")) {
      setTimeout(() => {
        const rect = mount.getBoundingClientRect();
        const eventInit = {
          clientX: rect.left + rect.width * 0.57,
          clientY: rect.top + rect.height * 0.43,
          bubbles: true,
          pointerType: "mouse",
        };
        mount.dispatchEvent(new PointerEvent("pointermove", eventInit));
        mount.dispatchEvent(new PointerEvent("pointerdown", eventInit));
        setTimeout(() => mount.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true })), 1400);
      }, 900);
    }
  } catch (error) {
    console.error("Living Memory Earth failed", error);
  }
}
