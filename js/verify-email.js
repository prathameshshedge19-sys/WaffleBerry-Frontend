"use strict";

(() => {
  const { ApiError, apiRequest, storeAuthenticatedSession } = window.LegaryaAuthApi;
  const config = window.LEGARYA_AUTH_CONFIG;
  const email = new URLSearchParams(location.search).get("email")?.trim();
  const verificationForm = document.querySelector("#verificationForm");
  const passwordForm = document.querySelector("#passwordCreationForm");
  const otpInput = document.querySelector("#otpInput");
  const passwordInput = document.querySelector("#passwordInput");
  const confirmationInput = document.querySelector("#confirmPasswordInput");
  const resend = document.querySelector("#resendOtpButton");
  const resendRow = document.querySelector("#resendRow");
  const message = document.querySelector("#authMessage");
  const description = document.querySelector("#verificationDescription");
  let authorization = null;
  let submitting = false;

  const show = (text, error = false) => {
    message.textContent = text;
    message.classList.toggle("error-state", error);
  };
  const fail = (error, fallback) => show(error instanceof ApiError ? error.message : fallback, true);

  if (!email) {
    show("Please start registration again.", true);
    [...verificationForm.elements].forEach((control) => { control.disabled = true; });
    return;
  }
  description.textContent = `We sent a six-digit code to ${email}.`;
  otpInput.addEventListener("input", () => { otpInput.value = otpInput.value.replace(/\D/g, ""); });

  verificationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const otp = otpInput.value.trim();
    if (!/^\d{6}$/.test(otp)) return show("Please enter the six-digit verification code.", true);
    submitting = true;
    show("Verifying your email...");
    try {
      const result = await apiRequest("/auth/verify-email", { method: "POST", body: { email, otp } });
      authorization = result.authorization;
      verificationForm.hidden = true;
      resendRow.hidden = true;
      passwordForm.hidden = false;
      passwordInput.focus();
      show("Email verified. Create your password to finish registration.");
    } catch (error) { fail(error, "Unable to verify your email."); }
    finally { submitting = false; }
  });

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const password = passwordInput.value;
    if (password !== confirmationInput.value) return show("Passwords do not match.", true);
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return show("Password must be at least eight characters and include a letter and number.", true);
    }
    submitting = true;
    show("Creating your account...");
    try {
      const result = await apiRequest("/auth/complete-registration", {
        method: "POST",
        body: { verification_token: authorization, password },
      });
      storeAuthenticatedSession(result);
      authorization = null;
      location.href = config.successUrl;
    } catch (error) { fail(error, "Unable to create your account."); }
    finally { submitting = false; }
  });

  resend.addEventListener("click", async () => {
    if (submitting) return;
    submitting = true;
    resend.disabled = true;
    show("Sending a new code...");
    try {
      const result = await apiRequest("/auth/resend-otp", { method: "POST", body: { email, purpose: "registration" } });
      show(result?.message || "A new verification code has been sent.");
    } catch (error) { fail(error, "Unable to resend the code."); }
    finally { submitting = false; resend.disabled = false; }
  });
})();
