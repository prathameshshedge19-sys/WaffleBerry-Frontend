import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../js/personality-dashboard.js", import.meta.url), "utf8");
const bridge = readFileSync(new URL("../js/memory-dashboard.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../css/personality-dashboard.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../chat.html", import.meta.url), "utf8");
const sandbox = { module: { exports: {} }, setTimeout, clearTimeout, AbortController };
vm.runInNewContext(source, sandbox);
const api = sandbox.module.exports;

class Node {
  constructor(tag = "div") { this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.textContent = ""; this.parentNode = null; }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((node) => node !== this); this.parentNode = null; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, callback) { this.listeners[event] = callback; }
  all(tag) { return [this, ...this.children.flatMap((node) => node.all())].filter((node) => !tag || node.tagName === tag); }
  text() { return [this.textContent, ...this.children.map((node) => node.text())].join(" "); }
}
const document = { createElement: (tag) => new Node(tag) };
const memory = { id: 10, canonical_text: "Pallavi was warm with family." };
const data = (legacyId = 1) => ({ legacy_id: legacyId, status: "ready", observations: [{ description: "Warm with family.", dimension: "Warmth", confidence: "Supported", context: "with family", supporting_memory_ids: [10], supporting_memory_count: 1 }], signature_expressions: [{ expression: "अगं बाई", context: "Used when surprised", language: "Marathi", supporting_memory_ids: [10], supporting_memory_count: 1 }] });
const empty = { legacy_id: 1, status: "ready", observations: [], signature_expressions: [] };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(request) {
  const content = new Node(); const scheduled = [];
  const panel = api.create({ document, dashboard: { hidden: false }, content, request, setTimeout: (fn) => { scheduled.push(fn); return scheduled.length; }, clearTimeout: () => {} });
  return { panel, content, scheduled };
}

test("personality section presents human observations, context, values and confidence without scores", () => {
  const payload = data(); payload.observations.push({ ...payload.observations[0], dimension: "Values", description: "Valued education." });
  const section = api.render(document, payload, new Map([[10, memory]]), () => {}, () => {});
  assert.match(section.text(), /Personality & Presence/);
  assert.match(section.text(), /Warm with family/); assert.match(section.text(), /Valued education/);
  assert.match(section.text(), /Supported/);
  assert.doesNotMatch(section.text(), /\d+%|warmth_score|relationship_context|playful_teasing/);
  assert.equal(section.all("input").length, 0); assert.equal(section.all("progress").length, 0);
});
test("evidence expands with native details and links back to the existing memory card", () => {
  let clicked = null;
  const section = api.render(document, data(), new Map([[10, memory]]), (id) => { clicked = id; }, () => {});
  const details = section.all("details")[0];
  assert.match(details.text(), /Supported by 1 preserved memory/);
  assert.equal(details.all("summary").length, 1);
  details.all("button")[0].listeners.click(); assert.equal(clicked, 10);
  assert.match(bridge, /data-memory-id/); assert.match(bridge, /card\.scrollIntoView/);
});
test("verified signature expressions retain exact original wording and context", () => {
  const section = api.render(document, data(), new Map([[10, memory]]), () => {}, () => {});
  assert.equal(section.all("q")[0].textContent, "अगं बाई");
  assert.match(section.text(), /Used when surprised/);
  assert.match(section.text(), /Signature expressions/);
});
test("sparse profiles have a supportive empty state and an empty signature state", () => {
  const section = api.render(document, empty, new Map(), () => {}, () => {});
  assert.match(section.text(), /Rya is still learning/);
  assert.match(section.text(), /No verified familiar expressions/);
});
for (const status of ["rebuilding", "stale", "failed", "unavailable"]) {
  test(`${status} hides observations and shows a non-blocking state`, () => {
    const section = api.render(document, { ...data(), status }, new Map([[10, memory]]), () => {}, () => {});
    assert.doesNotMatch(section.text(), /Warm with family/);
    assert.match(section.text(), ["rebuilding", "stale"].includes(status) ? /refreshing from the latest memories/ : /memories and chat are unaffected/);
  });
}
test("endpoint failure leaves the existing Memory Dashboard content intact", async () => {
  const { panel, content } = setup(async () => { throw new Error("offline"); });
  const existing = new Node("article"); existing.textContent = "Existing memory card"; content.append(existing);
  panel.load({ legacyId: 1, role: "owner", memories: [memory] }, panel.begin()); await tick();
  assert.ok(content.children.includes(existing));
  assert.match(content.text(), /isn't available right now/);
  assert.doesNotMatch(bridge, /await personalityPanel/);
});
test("rapid Legacy switching clears old content and ignores a late previous response", async () => {
  const pending = [];
  const { panel, content } = setup((path) => new Promise((resolve) => pending.push({ path, resolve })));
  panel.load({ legacyId: 1, role: "owner", memories: [memory] }, panel.begin());
  const token = panel.begin(); assert.equal(content.children.length, 0);
  panel.load({ legacyId: 2, role: "owner", memories: [memory] }, token);
  const second = data(2); second.observations[0].description = "Quiet with family.";
  pending[1].resolve(second); await tick(); pending[0].resolve(data(1)); await tick();
  assert.match(content.text(), /Quiet with family/); assert.doesNotMatch(content.text(), /Warm with family/);
});
test("old memory-load tokens and mismatched response Legacy IDs never render", async () => {
  const { panel, content } = setup(async () => data(999));
  const old = panel.begin(); const current = panel.begin();
  panel.load({ legacyId: 1, role: "owner", memories: [memory] }, old);
  assert.equal(content.children.length, 0);
  panel.load({ legacyId: 2, role: "owner", memories: [memory] }, current); await tick();
  assert.doesNotMatch(content.text(), /Warm with family/); assert.match(content.text(), /isn't available/);
});
for (const role of ["owner", "collaborator", "visitor", "viewer", null]) {
  test(`${role} has the expected management visibility`, async () => {
    let requests = 0;
    const { panel, content } = setup(async () => { requests += 1; return data(); });
    panel.load({ legacyId: 1, role, memories: [memory] }, panel.begin()); await tick();
    const allowed = role === "owner" || role === "collaborator";
    assert.equal(requests, allowed ? 1 : 0); assert.equal(content.children.length, allowed ? 1 : 0);
  });
}
test("a memory edit can invalidate immediately and bounded polling displays the rebuilt result", async () => {
  const responses = [data(), { ...empty, status: "rebuilding" }, empty];
  const { panel, content, scheduled } = setup(async () => responses.shift());
  panel.load({ legacyId: 1, role: "owner", memories: [memory] }, panel.begin()); await tick();
  assert.match(content.text(), /Warm with family/);
  panel.load({ legacyId: 1, role: "owner", memories: [] }, panel.begin()); await tick();
  assert.match(content.text(), /refreshing/); assert.doesNotMatch(content.text(), /Warm with family/);
  scheduled.shift()(); await tick(); assert.match(content.text(), /Rya is still learning/);
});
test("missing/deleted evidence suppresses a ready payload rather than linking stale cards", async () => {
  const { panel, content } = setup(async () => data());
  panel.load({ legacyId: 1, role: "owner", memories: [] }, panel.begin()); await tick();
  assert.match(content.text(), /refreshing/); assert.doesNotMatch(content.text(), /Warm with family/);
});
test("closing cancels presentation even if the request cannot be aborted", async () => {
  let resolve;
  const { panel, content } = setup(() => new Promise((done) => { resolve = done; }));
  panel.load({ legacyId: 1, role: "owner", memories: [memory] }, panel.begin()); panel.close();
  resolve(data()); await tick(); assert.equal(content.children.length, 0);
});
test("untrusted description and expression strings are text, never HTML", () => {
  const payload = data(); payload.observations[0].description = "<img src=x onerror=alert(1)>";
  payload.signature_expressions[0].expression = "<script>not executable</script>";
  const section = api.render(document, payload, new Map([[10, memory]]), () => {}, () => {});
  assert.equal(section.all("img").length, 0); assert.equal(section.all("script").length, 0);
  assert.doesNotMatch(source, /innerHTML/);
});
test("mobile layout wraps expressions, uses practical tap targets and no score widgets", () => {
  assert.match(css, /max-width:\s*100%/); assert.match(css, /min-width:\s*0/);
  assert.match(css, /overflow-wrap:\s*anywhere/); assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
  assert.doesNotMatch(source, /type\s*=\s*["']range|createElement\(["'](?:meter|progress)/);
});
test("versioned isolated assets load before the existing dashboard without frozen-controller integration", () => {
  assert.match(html, /css\/personality-dashboard\.css\?v=l13d1/);
  assert.ok(html.indexOf("js/personality-dashboard.js?v=l13d1") < html.indexOf("js/memory-dashboard.js?v=l13d1"));
  assert.match(bridge, /personalityPanel\?\.load\(\{ legacyId, role: accessRole, memories \}/);
  assert.doesNotMatch(source, /selectedLegacyId|activeConversationId|localStorage|sessionStorage/);
});
