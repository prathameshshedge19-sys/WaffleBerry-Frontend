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
const feedback =
    document.getElementById("beginLegacyFeedback");

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
    async (event) => {
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
        continueButton.disabled = true;
        if (feedback) {
            feedback.textContent = "Saving this Legacy...";
        }
        try {
            await window.authReady;
            const persisted =
                await window.WaffleBerryLegacyState.ensurePersisted(legacy.id);
            if (!persisted?.backendLegacyId) {
                throw new Error("Legacy persistence unavailable");
            }
            window.WaffleBerryLegacyState.select(persisted.id);
            window.location.href =
                `companion-home.html?legacyId=${encodeURIComponent(persisted.id)}`;
        } catch (error) {
            window.WaffleBerryLegacyState.remove(
                legacy.id,
                { backendDeleted: true }
            );
            if (error?.status === 401) {
                window.WaffleBerryApi.clearStoredSession();
                window.location.replace("login.html");
                return;
            }
            if (feedback) {
                feedback.textContent =
                    "This Legacy could not be saved. Check your connection and try again.";
            }
            updateContinueState();
        }
    }
);


updatePreview();
updateContinueState();
})();
