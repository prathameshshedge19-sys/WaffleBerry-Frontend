import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const builderHtml = await readFile(new URL("../chat.html", import.meta.url), "utf8");
const visitorHtml = await readFile(new URL("../legacy-chat.html", import.meta.url), "utf8");
const chat = await readFile(new URL("../js/chat.js", import.meta.url), "utf8");
const progression = await readFile(new URL("../js/progression.js", import.meta.url), "utf8");
const chatCss = await readFile(new URL("../css/chat.css", import.meta.url), "utf8");

test("daily question is requested by stable prompt id and never copied into the user composer", () => {
  assert.match(progression, /detail: \{ legacyId: legacy\.id, promptId: prompt\.id \}/);
  assert.doesNotMatch(progression, /input\.value\s*=\s*journey\?\.daily_prompt\?\.prompt_text/);
  assert.match(builderHtml, />Let Rya ask me<\/button>/);
});

test("seeded daily question is rendered as Rya with an empty composer", () => {
  assert.match(chat, /apiRequest\("\/conversations\/from-daily-prompt"/);
  assert.match(chat, /body: \{ legacy_id: legacyId, prompt_id: promptId \}/);
  assert.match(chat, /input\.value = "";[\s\S]*?addMessage\("assistant", result\.rya_message\.content\)/);
  assert.doesNotMatch(chat, /addMessage\("user", result\.rya_message\.content\)/);
});

test("daily advisor remains builder-only and New Chat send protection remains present", () => {
  assert.doesNotMatch(visitorHtml, /dailyQuestionCard|Let Rya ask me|legarya-daily-prompt/);
  assert.match(chatCss, /\.composer-wrap \{ position: relative; width:/);
  assert.match(chatCss, /\.composer \{ position: relative; z-index: 3;/);
  assert.match(chat, /const beginNewConversation = \(\) => \{\s*if \(preparingSend\) return;/);
});
