"use strict";

(function initializeLegacyDetails() {
const relationship =
    document.getElementById(
        "summaryRelationship"
    );
const displayName =
    document.getElementById(
        "summaryDisplayName"
    );
const status =
    document.getElementById(
        "legacyDetailsStatus"
    );
const legacyId =
    new URLSearchParams(
        window.location.search
    ).get("id");
const legacy =
    legacyId
        ? window.WaffleBerryLegacyState
            .get(legacyId)
        : null;

if (!legacy) {
    if (status) {
        status.textContent =
            "This temporary legacy could not be found. Return to Your Legacies to continue.";
    }
    return;
}

if (relationship) {
    relationship.textContent =
        legacy.relationship;
}

if (displayName) {
    displayName.textContent =
        legacy.displayName;
}
})();
