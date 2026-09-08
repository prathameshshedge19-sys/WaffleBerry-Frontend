import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("Stories navigation and safe product surfaces are present", () => {
  const html = read("chat.html");
  assert.match(html, /id="openStories"/); assert.match(html, /id="storiesDashboard"/); assert.match(html, /js\/stories-client\.js/); assert.match(html, /css\/stories\.css/);
});
test("Stories UI offers both supported perspectives and memory-only language", () => {
  const js = read("js/stories-dashboard.js");
  assert.match(js, /legacy_first_person/); assert.match(js, /biography_third_person/); assert.match(js, /source files are optional/); assert.match(js, /textContent/);
});
test("visitor Stories use published-only read path and safe text rendering", () => {
  assert.match(read("js/stories-client.js"), /\/stories\/published/); assert.match(read("js/stories-visitor.js"), /textContent/); assert.match(read("legacy-chat.html"), /openVisitorStories/);
});
