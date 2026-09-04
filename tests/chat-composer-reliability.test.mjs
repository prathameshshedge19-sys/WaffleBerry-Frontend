import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chat = await readFile(new URL("../js/chat.js", import.meta.url), "utf8");
const html = await readFile(new URL("../chat.html", import.meta.url), "utf8");
const visitorChat = await readFile(new URL("../js/legacy-chat.js", import.meta.url), "utf8");

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

test("first builder load bootstraps one pending Legacy before send validation", () => {
  assert.match(chat, /apiRequest\("\/legacies\/setup\/bootstrap", \{ method: "POST", authenticated: true \}\)/);
  assert.match(chat, /const shouldBootstrap = collaborations\.length === 0/);
  assert.match(chat, /owned\.length === 0/);
  assert.match(chat, /owned\.some\(\(legacy\) => legacy\.setup_status === "collecting_identity"\)/);
  assert.match(chat, /if \(!chatSession\.selectedLegacyId\) \{/);
  assert.match(chat, /await fetchLegacyContext\(\);/);
  assert.match(chat, /if \(!chatSession\.canSend\(content, sending\)\) \{/);
  assert.match(chat, /legacy_setup_bootstrap_failed/);
  assert.match(chat, /Rya couldn\u2019t start the Legacy setup\. Try again\./);
  assert.match(html, /js\/chat\.js\?v=4\.9/);
});

test("onboarding quick replies immediately use the normal composer submit flow", () => {
  assert.match(html, /data-reply="Myself\."/);
  assert.match(html, /data-reply="Someone I love\."/);
  assert.match(chat, /legacyQuickReplies\.addEventListener\("click"[\s\S]*?composer\.requestSubmit\(\);/);
  assert.ok(chat.indexOf('missing.has("relationship")') < chat.indexOf('missing.has("subject_name")'));
});

test("collaborator and visitor workspaces do not run owner bootstrap", () => {
  assert.match(chat, /const shouldBootstrap = collaborations\.length === 0/);
  assert.doesNotMatch(visitorChat, /setup\/bootstrap|bootstrapPendingLegacy/);
});

test("Create Another Legacy keeps the explicit new pending setup endpoint", () => {
  assert.match(chat, /createLegacyButton\.addEventListener\("click"[\s\S]*?apiRequest\("\/legacies\/setup", \{ method: "POST", authenticated: true \}\)/);
});

test("Rya visual failures cannot strand composer state", () => {
  assert.match(chat, /try \{\s*window\.RyaEnergyControl\?\.setActive/);
  assert.match(chat, /try \{\s*window\.RyaEnergyControl\?\.setSpeechEnergy/);
});
