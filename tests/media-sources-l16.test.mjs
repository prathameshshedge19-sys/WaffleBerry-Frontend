import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const clientContext = { module: { exports: {} } }; vm.runInNewContext(read("js/media-client.js"), clientContext);
const media = clientContext.module.exports;
const context = { module: { exports: {} }, window: { LegaryaMedia: media }, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(read("js/media-sources.js"), context); const { create } = context.module.exports;
const formats = [{ kind: "document", mime_type: "text/plain", extensions: [".txt"], max_bytes: 1024 }, { kind: "image", mime_type: "image/png", extensions: [".png"], max_bytes: 2048 }];
const source = { id: "source-1", state: "ready", kind: "document", original_filename: "letter.txt", declared_size_bytes: 12 };
const candidate = { id: "candidate-1", version: 1, review_state: "pending", proposal: { canonical_text: "Asha loved jasmine." }, evidence: [{ text: "Asha grew jasmine.", locator: { kind: "page_text", page: 2 } }] };
const file = { name: "letter.txt", type: "text/plain", size: 12 };
const defer = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { resolve, promise }; };
function setup(role = "owner", overrides = {}) {
  let legacy = { id: 1, setup_status: "active", access_role: role }, calls = [], scheduled = [], snapshots = [];
  let rows = [structuredClone(source)], candidates = [structuredClone(candidate)];
  const client = {
    capabilities: async () => ({ enabled: true, can_review: role === "owner", formats }), list: async () => rows,
    candidates: async () => candidates, evidence: async () => candidate.evidence,
    reserve: async (...args) => { calls.push(["reserve", ...args]); return source; }, upload: async (...args) => { calls.push(["upload", ...args]); return source; },
    decide: async (...args) => { calls.push(["decide", ...args]); candidates = [{ ...candidate, review_state: args[2] === "skip" ? "skipped" : "preserved" }]; },
    draft: async (...args) => { calls.push(["draft", ...args]); candidates = [{ ...candidate, version: 2, review_draft: { canonical_text: args[2] } }]; },
    remove: async (...args) => { calls.push(["remove", ...args]); rows = [{ ...source, state: "deleting" }]; },
    retry: async (...args) => { calls.push(["retry", ...args]); rows = [{ ...source, state: "queued" }]; }, ...overrides,
  };
  const panel = create({ client, getLegacy: () => legacy, uuid: () => "request-key", schedule: (fn, delay) => { const task = { fn, delay }; scheduled.push(task); return task; }, cancel: (task) => { if (task) task.cancelled = true; }, onChange: (state) => snapshots.push(state.message) });
  return { panel, client, calls, scheduled, snapshots, setLegacy: (value) => { legacy = value; } };
}
test("builder entry uses native dashboard and visitor markup has no source interface", () => {
  assert.match(read("chat.html"), /id="openMediaSources"[^>]+hidden/); assert.match(read("chat.html"), /js\/media-sources.js/);
  assert.doesNotMatch(read("legacy-chat.html"), /openMediaSources|media-sources.js/);
  assert.match(read("js/media-sources.js"), /legarya-legacy-change/);
});
for (const role of ["owner", "collaborator"]) test(`${role} opens scoped library`, async () => { const { panel } = setup(role); assert.equal(await panel.open(), true); assert.equal(panel.state.sources.length, 1); panel.close(); });
for (const role of ["visitor", "viewer", "none"]) test(`${role} cannot open library or call API`, async () => { const { panel } = setup(role, { capabilities: () => { assert.fail("Unauthorized API call"); } }); assert.equal(await panel.open(), false); });
test("incomplete Legacy cannot open library", async () => { const s = setup(); s.setLegacy({ id: 1, access_role: "owner", setup_status: "collecting_identity" }); assert.equal(await s.panel.open(), false); });
test("feature disabled returns explanatory state without library fetch", async () => { const { panel } = setup("owner", { capabilities: async () => ({ enabled: false }), list: () => assert.fail() }); assert.equal(await panel.open(), false); assert.match(panel.state.message, /not available/); });
test("empty state is successful and explains explicit preservation", async () => { const { panel } = setup("owner", { list: async () => [] }); await panel.open(); assert.equal(panel.state.sources.length, 0); assert.match(read("js/media-sources.js"), /only when the owner preserves them/); });
test("upload reserves and sends raw file independently of canonical review", async () => { const { panel, calls } = setup(); await panel.open(); assert.equal(await panel.upload(file), true); assert.deepEqual(calls.map((c) => c[0]), ["reserve", "upload"]); assert.equal(calls[1][3], file); assert.match(panel.state.message, /no memories have been saved/); });
for (const [name, value, error] of [["unsupported", { ...file, name: "page.html", type: "text/html" }, /Choose a PDF/], ["oversized", { ...file, size: 3000 }, /too large/], ["empty", { ...file, size: 0 }, /empty/]]) test(`${name} file rejected before reservation`, async () => { const { panel, calls } = setup(); await panel.open(); assert.equal(await panel.upload(value), false); assert.equal(calls.length, 0); assert.match(panel.state.message, error); });
test("failed binary upload retries the same reservation", async () => { let uploads = 0; const { panel, calls } = setup("owner", { upload: async () => { if (++uploads === 1) throw new Error("Network interrupted"); } }); await panel.open(); assert.equal(await panel.upload(file), false); assert.equal(await panel.upload(file), true); assert.equal(calls.filter((c) => c[0] === "reserve").length, 1); });
test("failed reservation retains idempotency key for retry", async () => { const keys = []; const s = setup("owner", { reserve: async (...args) => { keys.push(args[3]); if (keys.length === 1) throw new Error("Connection lost"); return source; } }); await s.panel.open(); await s.panel.upload(file); await s.panel.upload(file); assert.deepEqual(keys, ["request-key", "request-key"]); });
test("resuming upload rejects a different file", async () => { const s = setup(); await s.panel.open(); assert.equal(await s.panel.upload({ ...file, name: "other.txt" }, source), false); assert.equal(s.calls.length, 0); });
for (const state of ["uploading", "queued", "processing", "ready", "partially_ready", "failed", "deleting", "deleted"]) test(`${state} has a human-readable status`, () => { assert.notEqual(media.statusLabel({ state }), state); });
test("empty processed source is not presented as fully understood", () => assert.equal(media.statusLabel({ state: "partially_ready" }, []), "No suggestions found"));
test("polling is bounded and closing cancels pending updates", async () => { const s = setup("owner", { list: async () => [{ ...source, state: "processing" }] }); await s.panel.open(); assert.equal(s.scheduled[0].delay, 5000); s.panel.close(); assert.equal(s.scheduled[0].cancelled, true); });
test("terminal library stops polling", async () => { const s = setup(); await s.panel.open(); assert.equal(s.scheduled.length, 0); });
test("late result after Legacy switch never appears", async () => { const delayed = defer(); const s = setup("owner", { list: () => delayed.promise }); const opening = s.panel.open(); await Promise.resolve(); s.setLegacy({ id: 2, access_role: "owner", setup_status: "active" }); delayed.resolve([source]); await opening; assert.equal(s.panel.state.sources.length, 0); });
test("source details load real evidence shape", async () => { const { panel } = setup(); await panel.open(); await panel.select(source.id); assert.equal(panel.state.evidence[0].text, "Asha grew jasmine."); assert.equal(media.locatorLabel(panel.state.evidence[0].locator), "Page 2"); });
test("Preserve waits for backend transaction and rejects duplicate clicks", async () => { const delayed = defer(); let calls = 0; const { panel } = setup("owner", { decide: () => { calls++; return delayed.promise; } }); await panel.open(); await panel.select(source.id); const first = panel.decide(candidate, "preserve"); assert.equal(await panel.decide(candidate, "preserve"), false); assert.equal(panel.state.candidates[0].review_state, "pending"); delayed.resolve(); await first; assert.equal(calls, 1); });
test("Edit preview alone does not preserve and final action uses new version", async () => { const s = setup(); await s.panel.open(); await s.panel.select(source.id); await s.panel.draft(candidate, "Asha enjoyed gardening."); assert.deepEqual(s.calls.map((c) => c[0]), ["draft"]); assert.equal(s.panel.state.candidates[0].version, 2); await s.panel.decide(s.panel.state.candidates[0], "edit_preserve"); assert.equal(s.calls[1][2].version, 2); assert.equal(s.calls[1][3], "edit_preserve"); });
test("Skip is terminal without deleting source", async () => { const s = setup(); await s.panel.open(); await s.panel.select(source.id); await s.panel.decide(candidate, "skip"); assert.equal(s.panel.state.candidates[0].review_state, "skipped"); assert.equal(s.panel.state.sources.length, 1); assert.equal(media.statusLabel(source, s.panel.state.candidates), "Review complete"); });
for (const action of ["preserve", "edit_preserve", "skip"]) test(`collaborator cannot ${action}`, async () => { const s = setup("collaborator"); await s.panel.open(); assert.equal(await s.panel.decide(candidate, action), false); assert.equal(s.calls.length, 0); });
test("collaborator cannot delete, retry or edit", async () => { const s = setup("collaborator"); await s.panel.open(); assert.equal(await s.panel.remove(source), false); assert.equal(await s.panel.retry(source), false); assert.equal(await s.panel.draft(candidate, "new text"), false); });
test("retry moves source into truthful queued status", async () => { const s = setup(); await s.panel.open(); await s.panel.retry(source); assert.equal(s.panel.state.sources[0].state, "queued"); });
test("delete clears selected evidence and describes retained memory", async () => { const s = setup(); await s.panel.open(); await s.panel.select(source.id); await s.panel.remove(source); assert.equal(s.panel.state.selected, null); assert.equal(s.panel.state.evidence.length, 0); assert.match(s.panel.state.message, /Preserved memories remain/); });
for (const status of [401, 403, 404, 409, 410, 413, 415, 500, 503]) test(`HTTP ${status} has safe actionable copy`, () => { assert.doesNotMatch(media.errorMessage({ status, message: "internal secret stack" }), /secret|stack/); });
test("409 review refreshes the actual terminal state without success claim", async () => { const s = setup("owner", { decide: async () => { throw { status: 409 }; }, candidates: async () => [{ ...candidate, review_state: "skipped" }] }); await s.panel.open(); await s.panel.select(source.id); assert.equal(await s.panel.decide(candidate, "preserve"), false); assert.equal(s.panel.state.candidates[0].review_state, "skipped"); assert.match(s.panel.state.message, /another session/); });
test("client uses exact Phase B/C routes, versions and raw transfer", async () => {
  const calls = []; const auth = { apiRequest: async (...args) => { calls.push(args); return {}; }, authenticatedMediaFetch: async (...args) => { calls.push(args); return { json: async () => ({}), blob: async () => ({}) }; } };
  const client = media.createClient(auth); await client.reserve(1, file, formats[0], "key"); await client.upload(1, "source-1", file); await client.decide(1, candidate, "preserve", "review-key");
  assert.equal(calls[0][0], "/legacies/1/sources"); assert.equal(calls[0][1].body.upload_request_key, "key"); assert.equal(calls[1][1].body, file);
  assert.equal(calls[2][0], "/media-review/legacies/1/candidates/candidate-1/review"); assert.equal(calls[2][1].body.expected_version, 1);
});
test("provenance tombstones have no broken links and edits are labeled historical", () => { assert.match(read("js/memory-dashboard.js"), /Original source no longer available/); assert.match(read("js/memory-dashboard.js"), /source.can_open/); assert.match(read("js/memory-dashboard.js"), /Historical source/); });
test("native modal, safe text, focus restoration and private preview cleanup", () => { const js = read("js/media-sources.js"); assert.match(js, /showModal\(\)/); assert.match(js, /opener\?\.focus/); assert.match(js, /revokeObjectURL/); assert.match(js, /textContent/); assert.doesNotMatch(js, /innerHTML|localStorage|indexedDB/); });
test("mobile layout exposes touch controls without hover dependence", () => { const css = read("css/media-sources.css"); assert.match(css, /max-width: 720px/); assert.match(css, /min-height: 44px/); assert.match(css, /focus-visible/); assert.match(css, /overflow-wrap: anywhere/); });

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.textContent = ''; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.classList = { toggle() {} }; this.open = false; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, handler) { this.listeners[key] = handler; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { this.focused = true; }
  querySelector(tag) { return this.all().find((n) => n.tagName === tag); }
  all() { return [this, ...this.children.flatMap((n) => n.all())]; }
  text() { return [this.textContent, ...this.children.map((n) => n.text())].join(' '); }
}
function ui(role = 'owner', rows = [source], transfer = async () => ({ blob: async () => new Blob(['image']) })) {
  const entry = new Element('button'), body = new Element('body');
  const doc = { body, createElement: (tag) => new Element(tag), querySelector: () => entry, addEventListener() {} };
  const events = {};
  const win = { LegaryaMedia: media, addEventListener(name, fn) { events[name] = fn; } };
  const urls = { created: [], revoked: [] };
  const sandbox = { module: { exports: {} }, window: win, AbortController, setTimeout, clearTimeout, crypto: { randomUUID: () => 'request-key' }, URL: { createObjectURL: (blob) => { urls.created.push(blob); return 'blob:private-preview'; }, revokeObjectURL: (url) => urls.revoked.push(url) } };
  vm.runInNewContext(read('js/media-sources.js'), sandbox);
  const calls = []; let candidates = [candidate];
  const auth = { authenticatedMediaFetch: transfer, apiRequest: async (path, options) => {
    calls.push([path, options]);
    if (path.endsWith('/capabilities')) return { enabled: true, can_review: role === 'owner', formats, coverage_note: 'Scanned PDFs and audio/video are not available.' };
    if (path.endsWith('/review')) { candidates = [{ ...candidate, review_state: options.body.action === 'skip' ? 'skipped' : 'preserved' }]; return candidates[0]; }
    if (path.endsWith('/candidates')) return candidates;
    if (path.endsWith('/evidence')) return candidate.evidence;
    return rows;
  } };
  let legacy = { id: 1, setup_status: 'active', access_role: role };
  const panel = sandbox.module.exports.mount(doc, auth, () => legacy);
  return { panel, body, entry, calls, urls, setLegacy(value) { legacy = value; events['legarya-legacy-change'](); }, find: (text) => body.all().find((n) => n.tagName === 'button' && n.textContent === text) };
}

test('new Legacy shows Media entry and setup guidance without fetching or uploading', async () => {
  const s = ui(); s.setLegacy({ id: 2, setup_status: 'collecting_identity', access_role: 'owner' });
  assert.equal(s.entry.hidden, false); await s.panel.open();
  assert.equal(s.body.querySelector('dialog').open, true);
  assert.match(s.body.text(), /Finish.*identity setup.*Rya/i);
  assert.equal(s.calls.length, 0);
  assert.equal(s.body.all().some(n => n.tagName === 'input'), false);
  assert.equal(await s.panel.upload(file), false); assert.equal(s.calls.length, 0); s.panel.close();
});

test('media entry follows every Legacy and setup completion without exposing old panel state', async () => {
  const s = ui(); await s.panel.open();
  s.setLegacy({ id: 2, setup_status: 'collecting_identity', access_role: 'owner' });
  assert.equal(s.entry.hidden, false); assert.equal(s.panel.state.open, false);
  await s.panel.open(); s.setLegacy({ id: 2, setup_status: 'active', access_role: 'owner' });
  assert.equal(s.panel.state.open, false); await s.panel.open();
  assert.ok(s.calls.some(([route]) => route === '/legacies/2/sources'));
  s.setLegacy({ id: 3, setup_status: 'active', access_role: 'owner' });
  assert.equal(s.entry.hidden, false); assert.equal(s.panel.state.open, false);
  await s.panel.open(); assert.ok(s.calls.some(([route]) => route === '/legacies/3/sources'));
  s.setLegacy({ id: 4, setup_status: 'active', access_role: 'viewer' });
  assert.equal(s.entry.hidden, true); assert.equal(s.panel.state.open, false);
  s.setLegacy(null); assert.equal(s.entry.hidden, true);
});
test('actual panel renderer shows empty state and labeled file picker', async () => { const s = ui('owner', []); await s.panel.open(); assert.match(s.body.text(), /Start with a letter/); assert.ok(s.body.all().some((n) => n.tagName === 'input' && n.attributes['aria-label'] === 'Add a source file')); s.panel.close(); });
test('owner rendering contains evidence, original access and review controls', async () => { const s = ui('owner', [{ ...source, safety_state: 'clean' }]); await s.panel.open(); await s.panel.select(source.id); assert.match(s.body.text(), /Asha grew jasmine/); assert.match(s.body.text(), /Page 2/); assert.ok(s.find('Preserve') && s.find('Edit') && s.find('Skip') && s.find('Download original')); s.panel.close(); });
test('collaborator rendering removes all owner review controls', async () => { const s = ui('collaborator'); await s.panel.open(); await s.panel.select(source.id); for (const label of ['Preserve', 'Edit', 'Skip', 'Delete source']) assert.equal(s.find(label), undefined); assert.match(s.body.text(), /owner can read your uploads/); s.panel.close(); });
test('Skip click renders the actual completed receipt', async () => { const s = ui(); await s.panel.open(); await s.panel.select(source.id); await s.find('Skip').listeners.click(); assert.match(s.body.text(), /Review complete\. 0 preserved, 1 skipped/); assert.equal(s.find('Preserve'), undefined); s.panel.close(); });
test('delete click requires explicit confirmation and explains retained memories', async () => { const s = ui(); await s.panel.open(); await s.panel.select(source.id); s.find('Delete source').listeners.click(); assert.match(s.body.text(), /Already preserved memories remain/); assert.ok(s.find('Keep source')); assert.ok(s.find('Delete source and extracted material')); assert.equal(s.calls.filter(([, o]) => o.method === 'DELETE').length, 0); s.panel.close(); });
test('closing the native panel restores focus and clears private state', async () => { const s = ui(); await s.panel.open(); await s.panel.select(source.id); s.panel.close(); assert.equal(s.panel.state.evidence.length, 0); assert.equal(s.entry.focused, true); assert.equal(s.body.querySelector('dialog').open, false); });

test('image original uses a private blob preview and revokes it on close', async () => {
  const s = ui('owner', [{ ...source, kind: 'image', safety_state: 'clean' }]);
  await s.panel.open(); await s.panel.select(source.id);
  await s.find('View original').listeners.click();
  assert.equal(s.body.all().find((n) => n.tagName === 'img').src, 'blob:private-preview');
  s.panel.close();
  assert.deepEqual(s.urls.revoked, ['blob:private-preview']);
  assert.equal(s.body.all().some((n) => n.tagName === 'img'), false);
});

test('old preview cannot populate a closed and reopened source', async () => {
  const pending = defer();
  const s = ui('owner', [{ ...source, kind: 'image', safety_state: 'clean' }], () => pending.promise);
  await s.panel.open(); await s.panel.select(source.id);
  const opening = s.find('View original').listeners.click();
  s.panel.close(); await s.panel.open(); await s.panel.select(source.id);
  pending.resolve({ blob: async () => new Blob(['old private preview']) }); await opening;
  assert.equal(s.urls.created.length, 0);
  s.panel.close();
});
