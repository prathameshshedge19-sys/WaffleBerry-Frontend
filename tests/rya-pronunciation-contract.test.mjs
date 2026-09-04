import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const introSource = fs.readFileSync(path.join(root, "js", "rya-intro.js"), "utf8");
const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith(".html"));

test("visible UI keeps Rya and LegaRya spellings", () => {
  const visibleMarkup = htmlFiles.map((name) => fs.readFileSync(path.join(root, name), "utf8")).join("\n");
  assert.match(visibleMarkup, />Rya</);
  assert.match(visibleMarkup, /LegaRya/);
  assert.doesNotMatch(visibleMarkup, /LegaRiya|>Riya</);
});

test("homepage intro remains a versioned static local asset with zero runtime TTS", () => {
  assert.match(introSource, /new Audio\("assets\/audio\/rya-intro\.mp3\?v=2\.0"\)/);
  assert.doesNotMatch(introSource, /OpenAI|audio\.speech|speech\.create|fetch\(/i);
});
