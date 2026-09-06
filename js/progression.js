"use strict";

(() => {
  const { apiRequest } = window.LegaryaAuthApi;
  const summary = document.querySelector("#journeySummary");
  const progressText = document.querySelector("#journeyProgress");
  const streakComponent = document.querySelector("#journeyStreak");
  const streakNumber = document.querySelector("#journeyStreakNumber");
  const streakUnit = document.querySelector("#journeyStreakUnit");
  const todayState = document.querySelector("#journeyTodayState");
  const card = document.querySelector("#dailyQuestionCard");
  const questionText = document.querySelector("#dailyQuestionText");
  const dailyStreakText = document.querySelector("#dailyStreakText");
  const dailyStatus = document.querySelector("#dailyPreservationStatus");
  const dailyPrompt = document.querySelector("#dailyQuestionPrompt");
  const rings = document.querySelectorAll("[data-preservation-ring]");
  const answer = document.querySelector("#answerDailyQuestion");
  const skip = document.querySelector("#skipDailyQuestion");
  if (!summary || !card) return;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  let legacy = null;
  let journey = null;
  let priorProgress = null;

  const celebrateIfNeeded = (next) => {
    const streakMilestone = window.LegaryaProgressPresentation.streakState(next.streak).milestone;
    const progressMilestone = priorProgress !== null && priorProgress < 50 && next.progress.percentage >= 50;
    priorProgress = next.progress.percentage;
    if (streakMilestone) {
      streakComponent.classList.add("is-milestone");
      window.setTimeout(() => streakComponent.classList.remove("is-milestone"), 2200);
    } else if (progressMilestone) {
      summary.classList.add("is-milestone");
      window.setTimeout(() => summary.classList.remove("is-milestone"), 2200);
    }
  };

  const render = () => {
    const ready = legacy?.setup_status === "active" && journey;
    summary.hidden = !ready;
    card.hidden = !ready;
    if (!ready) return;
    progressText.textContent = `${journey.progress.percentage}% explored`;
    const streak = journey.streak;
    const days = streak.current_streak_days;
    const presentation = window.LegaryaProgressPresentation.streakState(streak);
    streakNumber.textContent = presentation.days;
    streakUnit.textContent = presentation.unit;
    todayState.textContent = presentation.todayText;
    streakComponent.setAttribute("aria-label", presentation.ariaLabel);
    dailyStreakText.textContent = days ? `${days}-day streak` : "Start today";
    dailyStatus.textContent = streak.today_completed
      ? `Today complete — ${legacy.subject_name || "this Legacy"}’s preservation streak continues.`
      : (days ? "Add one meaningful memory today to continue the streak." : "Add one meaningful memory today to begin a preservation streak.");
    dailyPrompt.hidden = journey.daily_prompt.status !== "pending";
    rings.forEach((ring) => { ring.classList.toggle("is-complete", streak.today_completed); ring.setAttribute("aria-label", streak.today_completed ? "Today’s preservation complete" : "Today’s preservation not yet complete"); });
    questionText.textContent = journey.daily_prompt.prompt_text;
  };

  const load = async () => {
    if (!legacy?.id || legacy.setup_status !== "active") { journey = null; render(); return; }
    try {
      journey = await apiRequest(`/progress/${legacy.id}?timezone=${encodeURIComponent(timezone)}`, { authenticated: true });
      celebrateIfNeeded(journey);
      render();
      window.dispatchEvent(new CustomEvent("legarya-journey-loaded", { detail: journey }));
    } catch { summary.hidden = card.hidden = true; }
  };

  answer.addEventListener("click", () => {
    const prompt = journey?.daily_prompt;
    if (!legacy?.id || !prompt || prompt.status !== "pending") return;
    answer.disabled = true;
    skip.disabled = true;
    window.dispatchEvent(new CustomEvent("legarya-daily-prompt-request", {
      detail: { legacyId: legacy.id, promptId: prompt.id },
    }));
  });
  skip.addEventListener("click", async () => {
    if (!journey?.daily_prompt) return;
    answer.disabled = true;
    skip.disabled = true;
    try {
      await apiRequest(`/progress/${legacy.id}/daily-prompt/${journey.daily_prompt.id}/skip?timezone=${encodeURIComponent(timezone)}`, { method: "POST", authenticated: true });
      await load();
    } finally { answer.disabled = skip.disabled = false; }
  });
  window.addEventListener("legarya:activity-changed", (event) => { if (event.detail.legacyId === legacy?.id) void load(); });
  window.addEventListener("legarya-daily-prompt-started", () => { dailyPrompt.hidden = true; });
  window.addEventListener("legarya-daily-prompt-failed", () => { answer.disabled = skip.disabled = false; });
  window.addEventListener("legarya-legacy-change", (event) => { legacy = event.detail.legacy; priorProgress = null; void load(); });
  window.addEventListener("legarya-progress-update", (event) => {
    if (event.detail?.today_just_completed) rings.forEach((ring) => { ring.classList.add("is-completing"); window.setTimeout(() => ring.classList.remove("is-completing"), 900); });
    void load();
  });
})();
