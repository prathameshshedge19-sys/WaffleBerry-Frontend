"use strict";

(() => {
  const { ApiError, apiRequest } = window.LegaryaAuthApi;
  const email = new URLSearchParams(location.search).get("email")?.trim();
  const resetToken = sessionStorage.getItem("passwordResetAuthorization");
  const form = document.querySelector("#resetPasswordForm");
  const passwordInput = document.querySelector("#passwordInput");
  const confirmationInput = document.querySelector("#confirmPasswordInput");
  const submit = document.querySelector("#submitButton");
  const message = document.querySelector("#authMessage");
  let submitting = false;

  const show = (text, error = false) => {
    message.textContent = text;
    message.classList.toggle("error-state", error);
  };

  if (!email || !resetToken) {
    show("Your password reset authorization is missing or expired. Request a new code.", true);
    submit.disabled = true;
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const password = passwordInput.value;
    if (password !== confirmationInput.value) return show("Passwords do not match.", true);
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return show("Password must be at least eight characters and include a letter and number.", true);
    }
    submitting = true;
    submit.disabled = true;
    show("Resetting your password...");
    try {
      await apiRequest("/auth/reset-password", {
        method: "POST",
        body: { email, password, reset_token: resetToken },
      });
      sessionStorage.removeItem("passwordResetAuthorization");
      location.href = "auth.html?mode=login&reset=success";
    } catch (error) {
      show(error instanceof ApiError ? error.message : "Unable to reset your password.", true);
    } finally {
      submitting = false;
      submit.disabled = false;
    }
  });
})();
