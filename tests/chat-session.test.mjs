import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../js/chat-session.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const { createChatSession } = context.LegaryaChatSession;

test("New Chat is unsaved, keeps the Legacy, and invalidates a stale load", () => {
  const session = createChatSession();
  session.selectLegacy(12);
  const oldLoad = session.beginConversationLoad();
  assert.equal(session.applyConversationLoad(oldLoad, 34), true);

  const staleLoad = session.beginConversationLoad();
  session.beginNewChat();

  assert.equal(session.selectedLegacyId, 12);
  assert.equal(session.activeConversationId, null);
  assert.equal(session.isNewChat, true);
  assert.equal(session.applyConversationLoad(staleLoad, 34), false);
  assert.equal(session.activeConversationId, null);
});

test("New Chat invalidates an automatic conversation choice still initializing", () => {
  const session = createChatSession();
  const initializationVersion = session.navigationVersion;
  session.selectLegacy(12);
  session.beginNewChat();

  assert.notEqual(session.navigationVersion, initializationVersion);
  assert.equal(session.activeConversationId, null);
  assert.equal(session.isNewChat, true);
});

test("repeated New Chat clicks remain unsaved and retain the selected Legacy", () => {
  const session = createChatSession();
  session.selectLegacy(12);
  session.beginNewChat();
  session.beginNewChat();
  session.beginNewChat();

  assert.equal(session.selectedLegacyId, 12);
  assert.equal(session.activeConversationId, null);
  assert.equal(session.isNewChat, true);
});

test("first send creates exactly once and the second send reuses the conversation", async () => {
  const session = createChatSession();
  session.selectLegacy(12);
  session.beginNewChat();
  let createCount = 0;
  const create = async (legacyId) => {
    createCount += 1;
    await Promise.resolve();
    return { id: 56, legacy_id: legacyId, title: "New chat" };
  };

  const [first, duplicateSubmit] = await Promise.all([
    session.ensureConversation(create),
    session.ensureConversation(create),
  ]);
  const second = await session.ensureConversation(create);

  assert.equal(createCount, 1);
  assert.equal(first.conversationId, 56);
  assert.equal(duplicateSubmit.conversationId, 56);
  assert.equal(second.conversationId, 56);
  assert.equal(second.created, false);
  assert.equal(session.activeConversationId, 56);
  assert.equal(session.isNewChat, false);
});

test("the returned conversation id is active before the first message can send", async () => {
  const session = createChatSession();
  session.selectLegacy(12);
  session.beginNewChat();
  const lifecycle = [];

  await session.ensureConversation(async (legacyId) => {
    lifecycle.push(["create", legacyId]);
    return { id: 56, legacy_id: legacyId, title: "New chat" };
  });
  lifecycle.push(["send", session.activeConversationId, session.selectedLegacyId]);

  assert.deepEqual(lifecycle, [["create", 12], ["send", 56, 12]]);
});

test("a failed first conversation creation clears the in-flight guard for retry", async () => {
  const session = createChatSession();
  session.selectLegacy(12);
  session.beginNewChat();

  await assert.rejects(session.ensureConversation(async () => { throw new Error("creation failed"); }), /creation failed/);
  assert.equal(session.pendingConversation, null);
  assert.equal(session.activeConversationId, null);

  const retry = await session.ensureConversation(async (legacyId) => ({ id: 57, legacy_id: legacyId }));
  assert.equal(retry.conversationId, 57);
});

test("send requires text and a selected Legacy, never a conversation id", () => {
  const session = createChatSession();
  assert.equal(session.canSend("Hi Rya", false), false);
  session.selectLegacy(12);
  session.beginNewChat();
  assert.equal(session.activeConversationId, null);
  assert.equal(session.canSend("Hi Rya", false), true);
  assert.equal(session.canSend("   ", false), false);
  assert.equal(session.canSend("Hi Rya", true), false);
});

test("conversation creation is strictly scoped to the current Legacy", async () => {
  const session = createChatSession();
  session.selectLegacy(12);
  session.beginNewChat();

  await assert.rejects(
    session.ensureConversation(async () => ({ id: 56, legacy_id: 99 })),
    /does not belong to the selected Legacy/,
  );
  assert.equal(session.activeConversationId, null);
  assert.equal(session.isNewChat, true);

  session.selectLegacy(99);
  session.beginNewChat();
  const other = await session.ensureConversation(async (legacyId) => ({ id: 57, legacy_id: legacyId }));
  assert.equal(other.conversationId, 57);
  assert.equal(session.selectedLegacyId, 99);
  assert.equal(session.activeConversationId, 57);
});
