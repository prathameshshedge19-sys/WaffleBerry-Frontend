"use strict";

(function initializeResetOtpVerification() {
const {
    ApiError,
    apiRequest,
} = window.WaffleBerryApi;

const verificationForm =
    document.getElementById("verificationForm");
const otpInput = document.getElementById("otpInput");
const verifyButton =
    document.getElementById("verifyButton");
const resendOtpButton =
    document.getElementById("resendOtpButton");
const verificationMessage =
    document.getElementById("verificationMessage");
const verificationDescription =
    document.getElementById(
        "verificationDescription"
    );
const email = new URLSearchParams(
    window.location.search
).get("email")?.trim();
const verificationWasResent = new URLSearchParams(
    window.location.search
).get("resent") === "true";

let isSubmitting = false;


function setVerificationMessage(
    message,
    type = ""
) {
    if (!verificationMessage) {
        return;
    }

    verificationMessage.textContent = message;
    verificationMessage.classList.toggle(
        "error-state",
        type === "error"
    );
}


function setSubmitting(submitting) {
    isSubmitting = submitting;

    if (verifyButton) {
        verifyButton.disabled = submitting;
    }

    if (resendOtpButton) {
        resendOtpButton.disabled = submitting;
    }
}


function getVerificationErrorMessage(error) {
    if (!(error instanceof ApiError)) {
        return "Unable to verify your reset code. Please try again.";
    }

    return error.message;
}


function isValidOtp(otp) {
    return /^\d{6}$/.test(otp);
}


if (!email) {
    setVerificationMessage(
        "Please enter your email again to reset your password.",
        "error"
    );
    setSubmitting(true);
    return;
}

if (verificationDescription) {
    verificationDescription.textContent =
        `We sent a 6-digit password reset code to ${email}.`;
}

if (verificationWasResent) {
    setVerificationMessage(
        "A new password reset code has been sent."
    );
}

if (otpInput) {
    otpInput.addEventListener("input", () => {
        otpInput.value = otpInput.value.replace(
            /\D/g,
            ""
        );
    });
}

if (verificationForm && otpInput) {
    verificationForm.addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            if (isSubmitting) {
                return;
            }

            const otp = otpInput.value.trim();

            if (!isValidOtp(otp)) {
                setVerificationMessage(
                    "Please enter the 6-digit verification code.",
                    "error"
                );
                return;
            }

            setSubmitting(true);
            setVerificationMessage("Verifying reset code...");

            try {
                const response = await apiRequest("/verify-reset-otp", {
                    method: "POST",
                    authenticated: false,
                    body: { email, otp }
                });
            setVerificationMessage(
                "Code verified successfully!"
            );

            await new Promise((resolve) => {
                window.setTimeout(resolve, 500);
            });

            sessionStorage.setItem("passwordResetAuthorization", response.authorization);
            window.location.href =
                `reset-password.html?email=${encodeURIComponent(email)}`;    
            } catch (error) {
                setVerificationMessage(
                    getVerificationErrorMessage(error),
                    "error"
                );
            } finally {
                setSubmitting(false);
            }
        }
    );
}

if (resendOtpButton) {
    resendOtpButton.addEventListener(
        "click",
        async () => {
            if (isSubmitting) {
                return;
            }

            setSubmitting(true);
            setVerificationMessage("Sending a new reset code...");

            try {
                const response = await apiRequest(
                    "/resend-otp",
                    {
                        method: "POST",
                        authenticated: false,
                        body: { email, purpose: "password_reset" }
                    }
                );

                setVerificationMessage(
                    response?.message ||
                    "A new password reset code has been sent."
                );
            } catch (error) {
                setVerificationMessage(
                    getVerificationErrorMessage(error),
                    "error"
                );
            } finally {
                setSubmitting(false);
            }
        }
    );
}
})();
