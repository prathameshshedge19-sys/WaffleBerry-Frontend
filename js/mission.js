"use strict";

(async function initializeMissionContext() {
    try {
        const legacy = await window.WaffleBerryLegacyContextUi.resolveSelectedLegacy();
        window.WaffleBerryLegacyContextUi.updateLegacyAwareUI(legacy);
    } catch {
        window.WaffleBerryLegacyContextUi.updateLegacyAwareUI(null);
    }
})();
