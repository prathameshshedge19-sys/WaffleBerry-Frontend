"use strict";

(function initializeLegacyBeginning() {
const legacyForm =
    document.getElementById("legacyForm");
const nameStep =
    document.getElementById(
        "legacyNameStep"
    );
const displayNameInput =
    document.getElementById(
        "legacyDisplayName"
    );
const preview =
    document.getElementById(
        "legacyPreview"
    );
const continueButton =
    document.getElementById(
        "legacyContinueButton"
    );

let selectedRelationship = "";


function normalizedDisplayName() {
    return displayNameInput?.value.trim() ||
        "";
}


function updatePreview() {
    if (!preview) {
        return;
    }

    const displayName =
        normalizedDisplayName();

    preview.textContent = displayName
        ? `I’ll help preserve ${displayName}’s legacy.`
        : "I’ll help preserve their legacy.";
}


function updateContinueState() {
    if (continueButton) {
        continueButton.disabled =
            !selectedRelationship ||
            !normalizedDisplayName();
    }
}


function revealNameStep() {
    if (!nameStep || !nameStep.hidden) {
        return;
    }

    nameStep.hidden = false;

    window.requestAnimationFrame(() => {
        nameStep.classList.add(
            "legacy-name-step-visible"
        );
    });
}


legacyForm?.addEventListener(
    "change",
    (event) => {
        const relationshipInput =
            event.target.closest(
                'input[name="relationship"]'
            );

        if (!relationshipInput) {
            return;
        }

        selectedRelationship =
            relationshipInput.value;
        revealNameStep();
        updateContinueState();
        displayNameInput?.focus({
            preventScroll: true
        });
    }
);


displayNameInput?.addEventListener(
    "input",
    () => {
        updatePreview();
        updateContinueState();
    }
);


legacyForm?.addEventListener(
    "submit",
    (event) => {
        event.preventDefault();

        const displayName =
            normalizedDisplayName();

        if (
            !selectedRelationship ||
            !displayName
        ) {
            updateContinueState();
            return;
        }

        const legacy =
            window.WaffleBerryLegacyState.create({
            relationship:
                selectedRelationship,
            displayName
        });

        if (!legacy) {
            return;
        }

        window.location.href =
            "legacy-dashboard.html";
    }
);


updatePreview();
updateContinueState();
})();
