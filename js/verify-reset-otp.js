"use strict";

(() => {
  const { ApiError, apiRequest } = window.LegaryaAuthApi;
  const email = new URLSearchParams(location.search).get("email")?.trim();
  const form = document.querySelector("#verificationForm");
  const otpInput = document.querySelector("#otpInput");
  const verify = document.querySelector("#verifyButton");
  const resend = document.querySelector("#resendOtpButton");
  const message = document.querySelector("#authMessage");
  const description = document.querySelector("#verificationDescription");
  let submitting = false;

  const show = (text, error = false) => {
    message.textContent = text;
    message.classList.toggle("error-state", error);
  };
  const fail = (error, fallback) => show(error instanceof ApiError ? error.message : fallback, true);
  const busy = (active) => { submitting = active; verify.disabled = active; resend.disabled = active; };

  if (!email) {
    show("Please enter your email again to reset your password.", true);
    busy(true);
    return;
  }
  description.textContent = `We sent a six-digit password reset code to ${email}.`;
  otpInput.addEventListener("input", () => { otpInput.value = otpInput.value.replace(/\D/g, ""); });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const otp = otpInput.value.trim();
    if (!/^\d{6}$/.test(otp)) return show("Please enter the six-digit verification code.", true);
    busy(true);
    show("Verifying your reset code...");
    try {
      const result = await apiRequest("/auth/verify-reset-otp", { method: "POST", body: { email, otp } });
      sessionStorage.setItem("passwordResetAuthorization", result.authorization);
      location.href = `reset-password.html?${new URLSearchParams({ email })}`;
    } catch (error) { fail(error, "Unable to verify your reset code."); }
    finally { busy(false); }
  });

  resend.addEventListener("click", async () => {
    if (submitting) return;
    busy(true);
    show("Sending a new reset code...");
    try {
      const result = await apiRequest("/auth/resend-otp", { method: "POST", body: { email, purpose: "password_reset" } });
      show(result?.message || "A new password reset code has been sent.");
    } catch (error) { fail(error, "Unable to resend the code."); }
    finally { busy(false); }
  });
})();
