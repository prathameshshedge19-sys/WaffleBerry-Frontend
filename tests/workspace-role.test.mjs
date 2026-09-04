import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../js/workspace-role.js", import.meta.url), "utf8");
const chatSource = fs.readFileSync(new URL("../js/chat.js", import.meta.url), "utf8");
const gatewaySource = fs.readFileSync(new URL("../js/gateway.js", import.meta.url), "utf8");
const visitorMarkup = fs.readFileSync(new URL("../legacy-chat.html", import.meta.url), "utf8");
const builderMarkup = fs.readFileSync(new URL("../chat.html", import.meta.url), "utf8");
const progressionSource = fs.readFileSync(new URL("../js/progression.js", import.meta.url), "utf8");
const progressPresentationSource = fs.readFileSync(new URL("../js/progress-presentation.js", import.meta.url), "utf8");
const visitorSource = fs.readFileSync(new URL("../js/legacy-chat.js", import.meta.url), "utf8");
const builderStyles = fs.readFileSync(new URL("../css/chat.css", import.meta.url), "utf8");
const dashboardSource = fs.readFileSync(new URL("../js/memory-dashboard.js", import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
const roles = context.window.LegaryaWorkspaceRole;
const progressContext = { window: {} };
vm.runInNewContext(progressPresentationSource, progressContext);
const streakState = progressContext.window.LegaryaProgressPresentation.streakState;

test("owner retains all builder management controls", () => {
  const policy = roles.policyFor({ access_role: "owner" });
  assert.equal(policy.canCreateLegacy, true);
  assert.equal(policy.canManageCollaborators, true);
  assert.equal(policy.canShareLegacy, true);
  assert.equal(policy.canUseMemories, true);
  assert.equal(policy.selectorLockedToCurrentLegacy, false);
});

test("collaborator is locked to the current contribution workspace", () => {
  const policy = roles.policyFor({ access_role: "collaborator" });
  assert.equal(policy.canCreateLegacy, false);
  assert.equal(policy.canManageCollaborators, false);
  assert.equal(policy.canShareLegacy, false);
  assert.equal(policy.canUseMemories, true);
  assert.equal(policy.selectorLockedToCurrentLegacy, true);
});

test("collaboration greeting uses one session-scoped handoff key", () => {
  assert.equal(roles.COLLABORATION_GREETING_KEY, "legarya:collaboration-entry-greeting");
});

test("visitor/no-role policy exposes no builder controls", () => {
  const policy = roles.policyFor(null);
  assert.equal(policy.canCreateLegacy, false);
  assert.equal(policy.canManageCollaborators, false);
  assert.equal(policy.canShareLegacy, false);
  assert.equal(policy.canUseMemories, false);
});

test("gateway hands off one collaborator greeting and chat consumes it", () => {
  assert.match(gatewaySource, /sessionStorage\.setItem\(window\.LegaryaWorkspaceRole\.COLLABORATION_GREETING_KEY/);
  assert.match(chatSource, /sessionStorage\.removeItem\(COLLABORATION_GREETING_KEY\)/);
  assert.match(chatSource, /you're collaborating on/);
});

test("chat binds every owner-only control to the centralized role policy", () => {
  assert.match(chatSource, /createLegacyButton\.hidden = !policy\.canCreateLegacy/);
  assert.match(chatSource, /openCollaboratorsButton\.hidden = !policy\.canManageCollaborators/);
  assert.match(chatSource, /openLegacyAccessButton\.hidden = !policy\.canShareLegacy/);
});

test("legacy visitor markup remains separate from all builder controls", () => {
  assert.doesNotMatch(visitorMarkup, /id="openMemories"/);
  assert.doesNotMatch(visitorMarkup, /id="openCollaborators"/);
  assert.doesNotMatch(visitorMarkup, /id="openLegacyAccess"/);
  assert.doesNotMatch(visitorMarkup, /id="createLegacy"/);
});

test("owner and collaborator builder markup has one restrained daily journey surface", () => {
  assert.match(builderMarkup, /id="journeySummary"/);
  assert.match(builderMarkup, /id="dailyQuestionCard"/);
  assert.match(progressionSource, /\/progress\/\$\{legacy\.id\}/);
  assert.match(builderMarkup, /Another question/);
  assert.doesNotMatch(visitorMarkup, /dailyQuestionCard|journeySummary/);
});

test("visitor current-information sources are safe links outside message prose", () => {
  assert.match(visitorSource, /Current information · Sources/);
  assert.match(visitorSource, /noopener noreferrer/);
  assert.match(visitorSource, /eventName==="activity"/);
});

test("daily preservation ring is accessible and respects reduced motion", () => {
  assert.equal((builderMarkup.match(/data-preservation-ring/g) || []).length, 2);
  assert.match(builderMarkup, /Today’s preservation not yet complete/);
  assert.match(builderStyles, /prefers-reduced-motion:reduce/);
  assert.match(builderStyles, /ring-complete 750ms/);
  assert.match(progressionSource, /today_completed/);
});

test("sidebar daily card and dashboard all use backend per-Legacy streak fields", () => {
  assert.match(progressionSource, /current_streak_days/);
  assert.match(dashboardSource, /current_streak_days/);
  assert.match(dashboardSource, /longest_streak_days/);
  assert.match(dashboardSource, /today_completed/);
  assert.doesNotMatch(progressionSource, /user_id|userId/);
});

test("sidebar streak presentation covers new, active, milestone, and today states", () => {
  assert.deepEqual({ ...streakState({ current_streak_days: 0, today_completed: false }) }, {
    days: 0, unit: "DAY STREAK", todayText: "Preserve something today", milestone: false,
    ariaLabel: "0-day preservation streak. Today’s preservation not yet complete.",
  });
  assert.equal(streakState({ current_streak_days: 2, today_completed: true }).todayText, "Today complete");
  assert.equal(streakState({ current_streak_days: 2, today_completed: true }).milestone, false);
  assert.equal(streakState({ current_streak_days: 7, today_completed: true }).milestone, true);
  assert.match(builderMarkup, /id="journeyStreakNumber"/);
  assert.match(builderMarkup, /id="journeyTodayState"/);
});

test("prominent streak remains compact in mobile drawer and recent chats remain scrollable", () => {
  assert.match(builderStyles, /\.preservation-ring--sidebar\s*\{\s*width:31px/);
  assert.match(builderStyles, /\.journey-streak-copy strong b\s*\{\s*font-size:20px/);
  assert.match(builderStyles, /\.conversation-list-scroll\s*\{[^}]*overflow-y:auto/);
  assert.match(builderStyles, /prefers-reduced-motion:reduce[\s\S]*?\.journey-streak\.is-milestone/);
});
