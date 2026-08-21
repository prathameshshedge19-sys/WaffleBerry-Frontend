"use strict";

(function initializeServiceUnavailableUi() {
    function open(dialog) {
        if (!dialog || dialog.open) return;
        dialog.showModal();
        dialog.querySelector("button")?.focus();
    }

    function bind(dialog) {
        const close = dialog?.querySelector("[data-service-close]");
        if (!dialog || !close || dialog.dataset.serviceBound === "true") return;
        dialog.dataset.serviceBound = "true";
        close.addEventListener("click", () => dialog.close());
    }

    function isServiceFailure(error) {
        return [
            "ai_service_unavailable", "provider_unavailable", "rate_limited",
            "rate-limit", "speech_provider_unavailable", "speech_rate_limited"
        ].includes(error?.kind);
    }

    window.WaffleBerryServiceUnavailable = Object.freeze({ open, bind, isServiceFailure });
})();
