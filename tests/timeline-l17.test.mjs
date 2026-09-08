import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const markup = fs.readFileSync(new URL("../chat.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../js/timeline-dashboard.js", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../js/timeline-client.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../css/timeline.css", import.meta.url), "utf8");

test("Timeline is embedded only inside Memories, with no standalone navigation or dialog", () => {
  assert.doesNotMatch(markup, /id="openTimeline"|id="closeTimeline"|id="timelineBackdrop"/);
  assert.match(markup, /id="timelineDashboard"/);
  assert.match(markup, /id="memoryDashboardContent"[^>]*>\s*<section id="timelineDashboard"/);
  assert.doesNotMatch(markup, /id="timelineDashboard"[^>]*role="dialog"/);
  assert.match(markup, /Timeline/);
  assert.match(source, /legarya-legacy-change/);
});

test("timeline client uses the scoped Phase B API and stale protection", () => {
  assert.match(client, /\/timeline\?\$\{query\(legacyId, params\)\}/);
  assert.match(client, /timeline\/\$\{encodeURIComponent\(eventId\)\}/);
  assert.match(source, /AbortController/);
  assert.match(source, /token !== epoch/);
});

test("timeline renders safe human-facing precision and support language", () => {
  assert.match(source, /date_label/);
  assert.match(source, /Date unknown/);
  assert.match(source, /Family memory/);
  assert.match(source, /Date needs clarification/);
  assert.doesNotMatch(source, /innerHTML/);
  assert.doesNotMatch(source, /admission_key|conflict_json|confidence/);
});

test("owner controls are conditional and deletion explains soft-delete semantics", () => {
  assert.match(source, /access_role === "owner"/);
  assert.match(source, /Mark reviewed/);
  assert.match(source, /Remove from Timeline/);
  assert.match(source, /Canonical memories, sources, and personality will remain/);
  assert.match(styles, /max-width:720px/);
  assert.match(styles, /focus-visible/);
});

test("timeline states do not imply evidence is required", () => {
  assert.match(source, /no source file is required/i);
  assert.match(source, /There are fewer preserved memories/);
  assert.match(source, /not missing proof/);
});
