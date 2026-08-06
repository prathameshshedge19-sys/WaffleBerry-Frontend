"use strict";

(function initializeVoiceSettings() {
const { apiRequest } = window.WaffleBerryApi;
const dialog = document.getElementById("voiceSettingsDialog");
const form = document.getElementById("voiceSettingsForm");
const options = document.getElementById("voiceSettingsOptions");
const status = document.getElementById("voiceSettingsStatus");
const saveButton = document.getElementById("voiceSettingsSave");
const closeButton = document.getElementById("voiceSettingsClose");
const cancelButton = document.getElementById("voiceSettingsCancel");
const openButtons = document.querySelectorAll("[data-open-voice-settings]");

let returnFocusTarget = null;
let isLoading = false;
let isSaving = false;
let selectedVoice = null;

function setStatus(message, type = "") {
    status.textContent = message;
    status.classList.toggle("error-state", type === "error");
}

function createOption(id, name, recommendation, checked) {
    const label = document.createElement("label");
    label.className = "voice-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "berryVoice";
    input.value = id;
    input.checked = checked || (id === "" && selectedVoice === null);
    const copy = document.createElement("span");
    copy.className = "voice-option-copy";
    const title = document.createElement("strong");
    title.textContent = name;
    const detail = document.createElement("span");
    detail.textContent = recommendation;
    copy.append(title, detail);
    label.append(input, copy);
    return label;
}

function createSection(title, voices) {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = title;
    fieldset.append(legend);
    voices.forEach((voice) => {
        fieldset.append(createOption(
            voice.id,
            voice.name,
            voice.recommendation,
            selectedVoice === voice.id
        ));
    });
    return fieldset;
}

function renderOptions(preference) {
    selectedVoice = preference.selected_voice;
    const automatic = createSection("Automatic", [{
        id: "",
        name: "Automatic",
        recommendation: "Berry chooses a voice based on the selected relationship."
    }]);
    const male = createSection(
        "Male voices",
        preference.available_voices.male
    );
    const female = createSection(
        "Female voices",
        preference.available_voices.female
    );
    options.replaceChildren(automatic, male, female);
    options.setAttribute("aria-busy", "false");
    saveButton.disabled = false;
}

async function loadPreference() {
    isLoading = true;
    saveButton.disabled = true;
    setStatus("");
    try {
        const preference = await apiRequest(
            "/user/voice-preference"
        );
        renderOptions(preference);
    } catch {
        options.setAttribute("aria-busy", "false");
        options.replaceChildren();
        setStatus(
            "Voice choices could not be loaded. Please try again.",
            "error"
        );
    } finally {
        isLoading = false;
    }
}

function openSettings(event) {
    if (dialog.open || isLoading || document.querySelector("dialog[open]")) {
        return;
    }
    returnFocusTarget = event.currentTarget;
    dialog.showModal();
    closeButton.focus();
    loadPreference();
}

function closeSettings() {
    if (!isSaving && dialog.open) {
        dialog.close();
    }
}

async function savePreference(event) {
    event.preventDefault();
    if (isSaving || isLoading) return;

    const selected = form.elements.berryVoice?.value ?? "";
    isSaving = true;
    saveButton.disabled = true;
    setStatus("Saving voice...");
    try {
        const preference = await apiRequest(
            "/user/voice-preference",
            {
                method: "PUT",
                body: { voice: selected || null }
            }
        );
        selectedVoice = preference.selected_voice;
        setStatus("Voice updated");
        document.dispatchEvent(
            new CustomEvent("waffleberry:voicepreferencechange")
        );
        window.setTimeout(() => dialog.close(), 350);
    } catch {
        setStatus(
            "Your voice preference could not be saved. Please try again.",
            "error"
        );
        saveButton.disabled = false;
    } finally {
        isSaving = false;
    }
}

function trapFocus(event) {
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.querySelectorAll(
        "button:not([disabled]), input:not([disabled])"
    ));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

openButtons.forEach((button) => button.addEventListener("click", openSettings));
closeButton?.addEventListener("click", closeSettings);
cancelButton?.addEventListener("click", closeSettings);
form?.addEventListener("submit", savePreference);
dialog?.addEventListener("keydown", trapFocus);
dialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSettings();
});
dialog?.addEventListener("close", () => {
    returnFocusTarget?.focus();
    returnFocusTarget = null;
});
})();
