import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chat = await readFile(new URL("../js/chat.js", import.meta.url), "utf8");
const html = await readFile(new URL("../chat.html", import.meta.url), "utf8");

test("composer click always reaches live-state validation", () => {
  const sendMarkup = html.match(/<button id="sendButton"[^>]*>/)?.[0] || "";
  assert.doesNotMatch(sendMarkup, /\sdisabled(?:\s|=|>)/);
  assert.match(sendMarkup, /aria-disabled="true"/);
  assert.match(chat, /sendButton\.disabled = false;/);
  assert.match(chat, /sendButton\.setAttribute\("aria-disabled", String\(!available\)\);/);
});

test("New Chat clears a stale sending lock even without an active stream", () => {
  const detach = chat.match(/const detachActiveStream = \(\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
  assert.doesNotMatch(detach, /if \(!activeStream\) return/);
  assert.match(detach, /activeStream = null;/);
  assert.match(detach, /setSending\(false\);/);
  assert.match(chat, /const beginNewConversation = \(\) => \{[\s\S]*?detachActiveStream\(\);/);
});

test("first send can restore a missing Legacy selection once", () => {
  assert.match(chat, /if \(!chatSession\.selectedLegacyId\) \{/);
  assert.match(chat, /await fetchLegacyContext\(\);/);
  assert.match(chat, /if \(!chatSession\.canSend\(content, sending\)\) \{/);
  assert.match(html, /js\/chat\.js\?v=4\.8/);
});

test("Rya visual failures cannot strand composer state", () => {
  assert.match(chat, /try \{\s*window\.RyaEnergyControl\?\.setActive/);
  assert.match(chat, /try \{\s*window\.RyaEnergyControl\?\.setSpeechEnergy/);
});
