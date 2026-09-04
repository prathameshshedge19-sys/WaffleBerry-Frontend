"use strict";

(() => {
  const { ApiError, apiRequest } = window.LegaryaAuthApi;
  const form = document.querySelector("#forgotPasswordForm");
  const emailInput = document.querySelector("#emailInput");
  const submit = document.querySelector("#submitButton");
  const message = document.querySelector("#authMessage");
  let submitting = false;

  const show = (text, error = false) => {
    message.textContent = text;
    message.classList.toggle("error-state", error);
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const email = emailInput.value.trim();
    if (!email) return show("Please enter your email address.", true);
    submitting = true;
    submit.disabled = true;
    show("Sending your verification code...");
    try {
      await apiRequest("/auth/forgot-password", { method: "POST", body: { email } });
      location.href = `verify-reset-otp.html?${new URLSearchParams({ email })}`;
    } catch (error) {
      show(error instanceof ApiError ? error.message : "Unable to send the verification code.", true);
    } finally {
      submitting = false;
      submit.disabled = false;
    }
  });
})();
