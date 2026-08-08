"use strict";

(function initializeLegacySettings() {
const api = window.WaffleBerryApi;
const state = window.WaffleBerryLegacyState;
const elements = {
    loading: document.getElementById("legacySettingsLoading"),
    loadError: document.getElementById("legacySettingsLoadError"),
    loadErrorMessage: document.getElementById("legacySettingsLoadErrorMessage"),
    retry: document.getElementById("legacySettingsRetry"),
    content: document.getElementById("legacySettingsContent"),
    form: document.getElementById("legacySettingsForm"),
    name: document.getElementById("legacySettingsName"),
    relationship: document.getElementById("legacySettingsRelationship"),
    nameError: document.getElementById("legacySettingsNameError"),
    relationshipError: document.getElementById("legacySettingsRelationshipError"),
    feedback: document.getElementById("legacySettingsFeedback"),
    reload: document.getElementById("legacySettingsReload"),
    save: document.getElementById("legacySettingsSave"),
    cancel: document.getElementById("legacySettingsCancel"),
    brandBack: document.getElementById("legacySettingsBrandBack"),
    archivedBanner: document.getElementById("legacySettingsArchivedBanner")
};

let localLegacy = null;
let backendLegacy = null;
let saving = false;

function detailsUrl() {
    return localLegacy
        ? `legacy-details.html?id=${encodeURIComponent(localLegacy.id)}`
        : "legacy-details.html";
}

function selectLegacy() {
    const requestedId = new URLSearchParams(window.location.search).get("id");
    return requestedId ? state.select(requestedId) : state.getActive();
}

function setNavigation() {
    const url = detailsUrl();
    elements.cancel.href = url;
    elements.brandBack.href = url;
}

function showLoadError(message) {
    elements.loading.hidden = true;
    elements.content.hidden = true;
    elements.loadError.hidden = false;
    elements.loadErrorMessage.textContent = message;
}

function clearValidation() {
    elements.nameError.textContent = "";
    elements.relationshipError.textContent = "";
    elements.name.removeAttribute("aria-invalid");
    elements.relationship.removeAttribute("aria-invalid");
}

function validate() {
    clearValidation();
    const name = elements.name.value.trim();
    const relationship = elements.relationship.value.trim();
    let invalid = null;
    if (!name) {
        elements.nameError.textContent = "Enter a Legacy name.";
        elements.name.setAttribute("aria-invalid", "true");
        invalid = elements.name;
    } else if (name.length > 255) {
        elements.nameError.textContent = "Use 255 characters or fewer.";
        elements.name.setAttribute("aria-invalid", "true");
        invalid = elements.name;
    }
    if (!relationship) {
        elements.relationshipError.textContent = "Enter a relationship.";
        elements.relationship.setAttribute("aria-invalid", "true");
        invalid ||= elements.relationship;
    } else if (relationship.length > 100) {
        elements.relationshipError.textContent = "Use 100 characters or fewer.";
        elements.relationship.setAttribute("aria-invalid", "true");
        invalid ||= elements.relationship;
    }
    invalid?.focus();
    return invalid ? null : { display_name: name, relationship };
}

function safeError(error) {
    if (error?.status === 404) {
        return "This Legacy was not found or is no longer available.";
    }
    if (error?.status === 409) {
        return "This Legacy changed elsewhere. Reload the latest settings and try again.";
    }
    if (error?.status === 422) {
        return "Please check the name and relationship you entered.";
    }
    return "Unable to save these settings. Please try again.";
}

function setSaving(value) {
    saving = value;
    elements.save.disabled = value;
    elements.name.disabled = value;
    elements.relationship.disabled = value;
    elements.save.textContent = value ? "Saving…" : "Save changes";
    if (value) {
        elements.feedback.textContent = "Saving Legacy settings…";
    }
}

async function load() {
    elements.loading.hidden = false;
    elements.loadError.hidden = true;
    elements.content.hidden = true;
    elements.reload.hidden = true;
    elements.feedback.textContent = "";
    localLegacy = selectLegacy();
    setNavigation();
    if (!localLegacy) {
        showLoadError("Choose a Legacy from Your Legacies and try again.");
        return;
    }
    try {
        localLegacy = await state.ensurePersisted(localLegacy.id);
        if (!localLegacy?.backendLegacyId) {
            throw new Error("Legacy persistence unavailable");
        }
        backendLegacy = await api.getOwnedLegacy(localLegacy.backendLegacyId);
        if (
            typeof backendLegacy?.display_name !== "string" ||
            typeof backendLegacy?.relationship !== "string" ||
            typeof backendLegacy?.updated_at !== "string"
        ) {
            throw new Error("Malformed Legacy response");
        }
        elements.name.value = backendLegacy.display_name;
        elements.relationship.value = backendLegacy.relationship;
        const isArchived = backendLegacy.status === "archived";
        elements.archivedBanner.hidden = !isArchived;
        elements.name.disabled = isArchived;
        elements.relationship.disabled = isArchived;
        elements.save.disabled = isArchived;
        elements.loading.hidden = true;
        elements.content.hidden = false;
        elements.name.focus();
    } catch (error) {
        if (error?.status === 401) {
            window.location.replace("login.html");
            return;
        }
        showLoadError(
            error?.status === 404
                ? "This Legacy was not found or is no longer available."
                : "Unable to load these settings. Please try again."
        );
    }
}

async function submit(event) {
    event.preventDefault();
    if (saving || !backendLegacy) {
        return;
    }
    if (backendLegacy.status === "archived") {
        return;
    }
    const values = validate();
    if (!values) {
        elements.feedback.textContent = "Please correct the highlighted fields.";
        return;
    }
    setSaving(true);
    try {
        const updated = await api.updateLegacySettings(
            backendLegacy.legacy_id,
            {
                expected_updated_at: backendLegacy.updated_at,
                ...values
            }
        );
        if (
            updated?.legacy_id !== backendLegacy.legacy_id ||
            typeof updated?.display_name !== "string" ||
            typeof updated?.relationship !== "string" ||
            typeof updated?.updated_at !== "string"
        ) {
            throw new Error("Malformed Legacy response");
        }
        backendLegacy = updated;
        const synchronized = state.updatePersisted(
            updated.legacy_id,
            updated
        );
        if (!synchronized) {
            await state.hydratePersisted();
        }
        elements.name.value = updated.display_name;
        elements.relationship.value = updated.relationship;
        elements.reload.hidden = true;
        elements.feedback.textContent = "Legacy settings saved.";
    } catch (error) {
        if (error?.status === 401) {
            window.location.replace("login.html");
            return;
        }
        elements.feedback.textContent = safeError(error);
        if (error?.status === 409) {
            elements.reload.hidden = false;
            elements.reload.focus();
        }
    } finally {
        setSaving(false);
    }
}

elements.form.addEventListener("submit", submit);
elements.retry.addEventListener("click", load);
elements.reload.addEventListener("click", load);
load();
})();
