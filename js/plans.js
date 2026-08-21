"use strict";

(function initializePlansPage() {
    const supportedPlans = new Set(["free", "plus", "pro"]);

    function normalizedPlan(user) {
        const plan = String(user?.plan || "free").trim().toLowerCase();
        return supportedPlans.has(plan) ? plan : "free";
    }

    function showCurrentPlan(user) {
        const currentPlan = normalizedPlan(user);
        document.querySelectorAll("[data-plan]").forEach((card) => {
            const isCurrent = card.dataset.plan === currentPlan;
            card.classList.toggle("is-current", isCurrent);
            if (isCurrent) card.setAttribute("aria-current", "true");
            else card.removeAttribute("aria-current");
            const badge = card.querySelector(".current-plan-badge");
            if (badge) badge.hidden = !isCurrent;
        });
        const freeAction = document.querySelector('[data-plan-action="free"]');
        if (freeAction) freeAction.textContent = currentPlan === "free" ? "Current Plan" : "Free Plan";
    }

    document.addEventListener("DOMContentLoaded", async () => {
        showCurrentPlan(await window.currentUserPromise);
    });

    window.WaffleBerryPlans = Object.freeze({ normalizedPlan, showCurrentPlan });
})();
