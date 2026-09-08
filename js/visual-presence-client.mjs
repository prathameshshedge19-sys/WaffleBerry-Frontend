const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
export const roles = Object.freeze(["poster", "texture_atlas", "rig"]);
export function legacyId(id) { if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw new Error("Invalid Legacy."); return Number(id); }
export function uuid(id) { if (!UUID.test(id)) throw new Error("Invalid visual identifier."); return id; }
const assert = (valid) => { if (!valid) throw new Error("Visual bundle unavailable."); };
export const visualError = (error) => {
  const code = error?.details?.detail?.code || error?.code;
  if (["visual_needs_recrop", "visual_image_dimensions", "visual_crop_invalid"].includes(code)) return "Please reposition the person inside the square frame, or choose another clear photo.";
  return ({ 401: "Please sign in again.", 403: "Face recreation is managed by the Legacy owner.",
    404: "This visual is no longer available.", 409: "This Legacy changed. Refresh and review the current version before trying again.",
    429: "The preparation limit has been reached. Please try again later." })[error?.status] || "Face recreation is temporarily unavailable. Your memories and voice conversations are unaffected.";
};

export function validateManifest(data, id, version = null) {
  const base = `/api/v1/legacies/${legacyId(id)}/visual-companion`;
  assert(data && data.recipe === "portrait_2d_v1" && UUID.test(data.version_id) && HASH.test(data.bundle_digest));
  assert(Number.isSafeInteger(data.revision) && data.revision > 0 && Number.isFinite(data.lease_seconds) && data.lease_seconds > 0 && data.lease_seconds <= 15);
  assert(Number.isFinite(Date.parse(data.valid_until)) && (!version || data.version_id === uuid(version)));
  assert(Array.isArray(data.assets) && data.assets.length === 3);
  let total = 0;
  const seen = new Set();
  for (const asset of data.assets) {
    assert(roles.includes(asset.role) && !seen.has(asset.role)); seen.add(asset.role);
    assert(UUID.test(asset.id) && HASH.test(asset.sha256));
    const limit = asset.role === "rig" ? 128 * 1024 : asset.role === "poster" ? 100 * 1024 : 2 * 1024 * 1024;
    assert(Number.isInteger(asset.byte_size) && asset.byte_size > 0 && asset.byte_size <= limit);
    assert(asset.mime_type === (asset.role === "rig" ? "application/json" : "image/png"));
    assert(asset.content_path === `${base}/${version ? `versions/${uuid(version)}` : "active"}/assets/${asset.id}/content`);
    total += asset.byte_size;
  }
  assert(total <= 2 * 1024 * 1024);
  return data;
}

export function validateRig(rig) {
  const fields = ["recipe_version", "topology_version", "fake_only", "request_identity_sha256", "atlas_sha256", "poster_sha256", "atlas_size", "crop_rect", "patches", "vertices", "uvs", "triangles", "deformations"];
  assert(rig && Object.keys(rig).sort().join() === fields.sort().join());
  assert(rig.recipe_version === "portrait_2d_v1" && rig.topology_version === 1 && rig.fake_only === false);
  for (const field of ["request_identity_sha256", "atlas_sha256", "poster_sha256"]) assert(HASH.test(rig[field]));
  const unit = (x) => Number.isFinite(x) && x >= 0 && x <= 1;
  assert(Array.isArray(rig.atlas_size) && rig.atlas_size.length === 2 && rig.atlas_size.every(n => Number.isInteger(n) && n >= 512 && n <= 1024));
  assert(JSON.stringify(rig.crop_rect) === JSON.stringify([0, 0, 512, 512]));
  assert(Array.isArray(rig.vertices) && rig.vertices.length >= 4 && rig.vertices.length <= 512);
  assert(Array.isArray(rig.uvs) && rig.uvs.length === rig.vertices.length);
  for (const point of [...rig.vertices, ...rig.uvs]) assert(Array.isArray(point) && point.length === 2 && point.every(unit));
  assert(new Set(rig.vertices.map(p=>p.join())).size === rig.vertices.length);
  rig.vertices.forEach(([x,y],i)=>assert(Math.abs(rig.uvs[i][0]-x*512/rig.atlas_size[0])<1e-9 && Math.abs(rig.uvs[i][1]-y*512/rig.atlas_size[1])<1e-9));
  const channels = ["mouth", "blink_left", "blink_right"];
  assert(rig.deformations && Object.keys(rig.deformations).sort().join() === [...channels].sort().join());
  assert(rig.patches && Object.keys(rig.patches).sort().join() === [...channels].sort().join());
  for (const channel of channels) {
    const values = rig.deformations[channel], patch = rig.patches[channel];
    assert(Array.isArray(values) && values.length === rig.vertices.length && values.every(n => Number.isFinite(n) && Math.abs(n) <= (channel === "mouth" ? .015 : .02)));
    assert(Array.isArray(patch) && patch.length === 4 && patch.every(unit) && patch[2] > 0 && patch[3] > 0 && patch[0] + patch[2] <= 1 && patch[1] + patch[3] <= 1);
    values.forEach((dy,i)=>{if(dy){const [x,y]=rig.vertices[i];assert(x>0&&x<1&&y>0&&y<1&&x>patch[0]&&x<patch[0]+patch[2]&&y>patch[1]&&y<patch[1]+patch[3]&&y+dy>=patch[1]&&y+dy<=patch[1]+patch[3]);}});
    if(channel==="mouth")assert(Math.max(...values)-Math.min(...values)<=.02);
  }
  rig.vertices.forEach((_,i)=>assert(channels.filter(c=>rig.deformations[c][i]!==0).length<=1));
  assert(Array.isArray(rig.triangles) && rig.triangles.length >= 2 && rig.triangles.length <= 1024);
  const triangles = new Set(), edges = new Map(), used = new Set(), areas=[];
  const area=(p,a,b,c)=>(p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[b][1]-p[a][1])*(p[c][0]-p[a][0]);
  for (const t of rig.triangles) {
    assert(Array.isArray(t) && t.length === 3 && new Set(t).size === 3 && t.every(i => Number.isInteger(i) && i >= 0 && i < rig.vertices.length));
    const key = [...t].sort((a,b) => a-b).join(); assert(!triangles.has(key)); triangles.add(key);
    t.forEach(i=>used.add(i)); const signed=area(rig.vertices,...t);assert(signed>1e-8);areas.push(signed);
    for(let j=0;j<3;j++){const a=t[j],b=t[(j+1)%3],key=[a,b].sort((x,y)=>x-y).join();if(!edges.has(key))edges.set(key,[]);edges.get(key).push([a,b]);}
  }
  assert(used.size===rig.vertices.length && Math.abs(areas.reduce((a,b)=>a+b,0)-2)<1e-7 && rig.vertices.length-edges.size+rig.triangles.length===1);
  const neighbors=rig.vertices.map(()=>new Set());
  for(const directions of edges.values()){
    const [a,b]=directions[0];neighbors[a].add(b);neighbors[b].add(a);assert(directions.length<=2);
    if(directions.length===2)assert(directions[1][0]===b&&directions[1][1]===a);
    else assert([0,1].some(axis=>[0,1].some(side=>rig.vertices[a][axis]===side&&rig.vertices[b][axis]===side)));
  }
  const reached=new Set(), pending=[0];while(pending.length){const i=pending.pop();if(reached.has(i))continue;reached.add(i);for(const n of neighbors[i])if(!reached.has(n))pending.push(n);}assert(reached.size===rig.vertices.length);
  // Recheck all 27 allowed deformation envelopes before creating GPU resources.
  for (const m of [0,.5,1]) for (const l of [0,.5,1]) for (const r of [0,.5,1]) {
    const p = rig.vertices.map(([x,y],i) => [x, y + m*rig.deformations.mouth[i] + l*rig.deformations.blink_left[i] + r*rig.deformations.blink_right[i]]);
    assert(p.every(v => v.every(unit)));
    rig.triangles.forEach((t,i)=>{const posed=area(p,...t);assert(posed>=.5*areas[i]&&posed<=1.5*areas[i]);});
  }
  return rig;
}

async function readBounded(response, size) {
  const length = response.headers.get("content-length");
  if (length !== null) assert(Number(length) === size);
  const reader = response.body?.getReader(); assert(reader);
  const bytes = new Uint8Array(size); let offset = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      assert(offset + value.length <= size); bytes.set(value, offset); offset += value.length;
    }
    assert(offset === size); return bytes;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
const digest = async (bytes, crypto) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2,"0")).join("");

export function createVisualClient(auth, environment = globalThis) {
  const base = id => `/legacies/${legacyId(id)}/visual-companion`;
  const json = (path, options = {}) => auth.apiRequest(path, { ...options, authenticated: true });
  return Object.freeze({
    capabilities: (id, signal) => json(`${base(id)}/capabilities`, { signal }),
    profile: (id, signal) => json(base(id), { signal }),
    version: (id, v, signal) => json(`${base(id)}/versions/${uuid(v)}`, { signal }),
    generate: (id, body, signal) => json(`${base(id)}/versions`, { method: "POST", body, signal }),
    activate: (id, body, signal) => json(`${base(id)}/activate`, { method: "POST", body, signal }),
    toggle: (id, enabled, revision, signal) => json(base(id), { method: "PATCH", body: { enabled, expected_revision: revision }, signal }),
    remove: (id, revision, signal) => json(`${base(id)}?expected_revision=${revision}`, { method: "DELETE", signal }),
    manifest: async (id, version, signal) => validateManifest(await json(`${base(id)}/${version ? `versions/${uuid(version)}/manifest` : "active-manifest"}`, { signal }), id, version),
    async bundle(manifest, signal) {
      const blobs = {}, hashes = {}; let bitmap = null, posterUrl = null;
      try {
        const scope = /^\/api\/v1\/legacies\/([1-9][0-9]*)\/visual-companion\/(active|versions\/([a-f0-9-]+))\/assets\//.exec(manifest?.assets?.[0]?.content_path);
        assert(scope); validateManifest(manifest,scope[1],scope[3] || null);
        const canonical = JSON.stringify({ assets:[...manifest.assets].sort((a,b)=>a.role.localeCompare(b.role)).map(a=>({byte_size:a.byte_size,mime_type:a.mime_type,role:a.role,sha256:a.sha256})), recipe:manifest.recipe });
        assert(await digest(new TextEncoder().encode(canonical),environment.crypto)===manifest.bundle_digest);
        for (const asset of manifest.assets) {
          const response = await auth.authenticatedVisualFetch(asset.content_path.slice("/api/v1".length), { signal });
          assert(response.headers.get("content-type")?.split(";")[0] === asset.mime_type);
          const bytes = await readBounded(response, asset.byte_size);
          hashes[asset.role] = await digest(bytes, environment.crypto); assert(hashes[asset.role] === asset.sha256);
          blobs[asset.role] = new Blob([bytes], { type: asset.mime_type });
        }
        signal?.throwIfAborted();
        const rig = validateRig(JSON.parse(await blobs.rig.text()));
        assert(rig.atlas_sha256 === hashes.texture_atlas && rig.poster_sha256 === hashes.poster);
        bitmap = await environment.createImageBitmap(blobs.texture_atlas);
        assert(bitmap.width === rig.atlas_size[0] && bitmap.height === rig.atlas_size[1]);
        const poster = await environment.createImageBitmap(blobs.poster);
        try { assert(poster.width === 256 && poster.height === 256); } finally { poster.close(); }
        signal?.throwIfAborted();
        posterUrl = environment.URL.createObjectURL(blobs.poster);
        let disposed = false;
        return { rig, bitmap, posterUrl, manifest, dispose() { if (disposed) return; disposed = true; bitmap.close(); environment.URL.revokeObjectURL(posterUrl); } };
      } catch (error) { bitmap?.close(); if (posterUrl) environment.URL.revokeObjectURL(posterUrl); throw error; }
    },
  });
}
