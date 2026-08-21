"use strict";

(function initializeQuotaModal() {
    const returnFocus = new WeakMap();

    function planName(value) {
        const normalized = String(value || "free").toLowerCase();
        return ({ free: "Free", plus: "Plus", pro: "Pro" })[normalized] || "Free";
    }

    function dailyAvailability(resetsAt, now = new Date()) {
        const reset = new Date(resetsAt);
        if (!Number.isFinite(reset.getTime())) return "Available again on your next local day";
        const tomorrow = new Date(now);
        tomorrow.setHours(0, 0, 0, 0);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const resetDay = new Date(reset);
        resetDay.setHours(0, 0, 0, 0);
        const time = new Intl.DateTimeFormat(undefined, {
            hour: "numeric", minute: "2-digit"
        }).format(reset);
        if (resetDay.getTime() === tomorrow.getTime()) {
            return `Available again tomorrow at ${time}`;
        }
        const date = new Intl.DateTimeFormat(undefined, {
            month: "short", day: "numeric", year: "numeric"
        }).format(reset);
        return `Available again ${date} at ${time}`;
    }

    function open(dialog, preferredFocus) {
        if (!dialog || dialog.open) return;
        returnFocus.set(dialog, document.activeElement);
        dialog.showModal();
        (preferredFocus || dialog.querySelector(".primary-button, button, a"))
            ?.focus({ preventScroll: true });
    }

    function bindDismissal(dialog, dismissButton) {
        if (!dialog || dialog.dataset.quotaDismissalBound === "true") return;
        dialog.dataset.quotaDismissalBound = "true";
        dismissButton?.addEventListener("click", () => dialog.close("dismissed"));
        dialog.addEventListener("close", () => {
            const target = returnFocus.get(dialog);
            returnFocus.delete(dialog);
            if (target?.isConnected && typeof target.focus === "function") {
                target.focus({ preventScroll: true });
            }
        });
    }

    window.WaffleBerryQuotaModal = Object.freeze({
        planName, dailyAvailability, open, bindDismissal
    });
})();
