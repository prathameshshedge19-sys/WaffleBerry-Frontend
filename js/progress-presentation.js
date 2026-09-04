"use strict";

(() => {
  const milestones = new Set([3, 7, 14, 30, 50, 100, 365]);

  const streakState = (streak = {}) => {
    const days = Math.max(0, Number(streak.current_streak_days) || 0);
    const todayComplete = streak.today_completed === true;
    return {
      days,
      unit: "DAY STREAK",
      todayText: todayComplete ? "Today complete" : "Preserve something today",
      milestone: milestones.has(days),
      ariaLabel: `${days}-day preservation streak. ${todayComplete ? "Today’s preservation complete" : "Today’s preservation not yet complete"}.`,
    };
  };

  window.LegaryaProgressPresentation = Object.freeze({ streakState });
})();
