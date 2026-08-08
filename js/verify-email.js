"use strict";
(function () {
const { ApiError, apiRequest } = window.WaffleBerryApi;
const email = new URLSearchParams(window.location.search).get("email")?.trim();
const otpForm = document.getElementById("verificationForm");
const passwordForm = document.getElementById("passwordCreationForm");
const otp = document.getElementById("otpInput");
const password = document.getElementById("passwordInput");
const confirmation = document.getElementById("confirmPasswordInput");
const resend = document.getElementById("resendOtpButton");
const output = document.getElementById("verificationMessage");
const description = document.getElementById("verificationDescription");
let authorization = null;
let submitting = false;
const show = (text, error = false) => {
    output.textContent = text;
    output.classList.toggle("error-state", error);
};
const failure = (error, fallback) => show(error instanceof ApiError ? error.message : fallback, true);
if (!email) { show("Please start registration again.", true); return; }
description.textContent = `We sent a 6-digit OTP to ${email}.`;
otp.addEventListener("input", () => { otp.value = otp.value.replace(/\D/g, ""); });
otpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    if (!/^\d{6}$/.test(otp.value.trim())) return show("Please enter the 6-digit verification code.", true);
    submitting = true;
    try {
        const result = await apiRequest("/verify-email", {
            method: "POST", authenticated: false, body: { email, otp: otp.value.trim() }
        });
        authorization = result.authorization;
        otpForm.hidden = true;
        resend.parentElement.hidden = true;
        passwordForm.hidden = false;
        password.focus();
        show("Email verified. Create your password to finish registration.");
    } catch (error) { failure(error, "Unable to verify your email."); }
    finally { submitting = false; }
});
passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    if (password.value !== confirmation.value) return show("Passwords do not match.", true);
    if (password.value.length < 8 || !/[A-Za-z]/.test(password.value) || !/\d/.test(password.value)) {
        return show("Password must be at least 8 characters and include a letter and number.", true);
    }
    submitting = true;
    try {
        await apiRequest("/complete-registration", {
            method: "POST", authenticated: false,
            body: { verification_token: authorization, password: password.value }
        });
        authorization = null;
        window.location.href = "login.html";
    } catch (error) { failure(error, "Unable to create your account."); }
    finally { submitting = false; }
});
resend.addEventListener("click", async () => {
    if (submitting) return;
    submitting = true;
    try {
        const result = await apiRequest("/resend-otp", {
            method: "POST", authenticated: false,
            body: { email, purpose: "email_verification" }
        });
        show(result.message || "A new verification code has been sent.");
    } catch (error) { failure(error, "Unable to resend the code."); }
    finally { submitting = false; }
});
})();
