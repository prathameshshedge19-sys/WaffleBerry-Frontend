import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
for (const page of ['chat.html', 'legacy-chat.html']) test(`${page} tells stories through conversation without a separate Stories section`, () => {
  const html = read(page);
  assert.doesNotMatch(html, /openStories|openVisitorStories|storiesDashboard|visitorStoriesPanel/);
  assert.doesNotMatch(html, /(?:src|href)="(?:js|css)\/stories[^" ]*/);
  assert.match(html, /id="messageInput"/); assert.match(html, /id="startVoiceConversation"/);
});
test("Stories UI offers both supported perspectives and memory-only language", () => {
  const js = read("js/stories-dashboard.js");
  assert.match(js, /legacy_first_person/); assert.match(js, /biography_third_person/); assert.match(js, /source files are optional/); assert.match(js, /textContent/);
});
test("retained historical Story assets do not bypass published-only access", () => {
  assert.match(read("js/stories-client.js"), /\/stories\/published/); assert.match(read("js/stories-visitor.js"), /textContent/);
});
