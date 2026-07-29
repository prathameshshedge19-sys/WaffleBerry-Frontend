"use strict";

(function initializeLegacyDeleteDialog() {
let dialog = null;
let message = null;
let confirmButton = null;
let activeTrigger = null;
let resolveConfirmation = null;


function createDialog() {
    dialog =
        document.createElement("dialog");
    dialog.className =
        "legacy-delete-dialog";
    dialog.setAttribute(
        "aria-labelledby",
        "sharedDeleteLegacyTitle"
    );
    dialog.setAttribute(
        "aria-describedby",
        "sharedDeleteLegacyMessage sharedDeleteLegacyConsequences"
    );

    dialog.innerHTML = `
        <form
            class="glass-card legacy-delete-dialog-card"
            method="dialog"
        >
            <span
                class="legacy-delete-dialog-icon"
                aria-hidden="true"
            >!</span>
            <h2 id="sharedDeleteLegacyTitle">
                Delete Legacy?
            </h2>
            <p id="sharedDeleteLegacyMessage"></p>
            <p id="sharedDeleteLegacyConsequences">
                Everything preserved for this companion will be
                permanently removed.
            </p>
            <p class="legacy-delete-warning">
                This action cannot be undone.
            </p>
            <div class="legacy-delete-dialog-actions">
                <button
                    class="secondary-button"
                    type="submit"
                    value="cancel"
                >
                    Cancel
                </button>
                <button
                    class="legacy-destructive-button"
                    type="button"
                    data-confirm-legacy-delete
                >
                    Delete Legacy
                </button>
            </div>
        </form>
    `;

    message =
        dialog.querySelector(
            "#sharedDeleteLegacyMessage"
        );
    confirmButton =
        dialog.querySelector(
            "[data-confirm-legacy-delete]"
        );

    confirmButton.addEventListener(
        "click",
        () => {
            dialog.returnValue =
                "deleted";
            dialog.close();
        }
    );

    dialog.addEventListener(
        "close",
        () => {
            const wasConfirmed =
                dialog.returnValue ===
                "deleted";
            const resolve =
                resolveConfirmation;

            resolveConfirmation = null;
            activeTrigger?.focus();
            activeTrigger = null;
            resolve?.(wasConfirmed);
        }
    );

    document.body.append(dialog);
}


function confirm(legacy, trigger = null) {
    if (
        !legacy?.id ||
        !legacy?.displayName
    ) {
        return Promise.resolve(false);
    }

    if (!dialog) {
        createDialog();
    }

    activeTrigger = trigger;
    dialog.returnValue = "";
    message.textContent =
        `You are about to permanently remove "${
            legacy.displayName
        }'s" legacy.`;

    return new Promise((resolve) => {
        resolveConfirmation = resolve;
        dialog.showModal();
    });
}


window.WaffleBerryLegacyDelete =
    Object.freeze({
        confirm
    });
})();
