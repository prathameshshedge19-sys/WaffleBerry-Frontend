"use strict";

(function initializeEmailVerification() {
const {
    ApiError,
    apiRequest,
    authenticateUser,
    getPendingVerificationCredentials,
    clearPendingVerificationCredentials
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
        return "Unable to verify your email. Please try again.";
    }

    return error.message;
}


function isValidOtp(otp) {
    return /^\d{6}$/.test(otp);
}


if (!email) {
    setVerificationMessage(
        "Please create your account again to receive a verification code.",
        "error"
    );
    setSubmitting(true);
    return;
}

if (verificationDescription) {
    verificationDescription.textContent =
        `We sent a 6-digit OTP to ${email}.`;
}

if (verificationWasResent) {
    setVerificationMessage(
        "Your account is awaiting email verification. A new verification code has been sent."
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
            setVerificationMessage("Verifying your email...");

            try {
                await apiRequest("/verify-email", {
                    method: "POST",
                    authenticated: false,
                    body: { email, otp }
                });

                setVerificationMessage(
                    "Email verified successfully! Signing you in..."
                );

                await new Promise((resolve) => {
                    window.setTimeout(resolve, 500);
                });

                const credentials =
                    getPendingVerificationCredentials();

                if (
                    !credentials ||
                    credentials.email !== email
                ) {
                    window.location.href = "login.html";
                    return;
                }

                await authenticateUser(
                    credentials.email,
                    credentials.password
                );
                clearPendingVerificationCredentials();

                window.location.href = "experience.html";
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
            setVerificationMessage("Sending a new verification code...");

            try {
                const response = await apiRequest(
                    "/resend-otp",
                    {
                        method: "POST",
                        authenticated: false,
                        body: { email }
                    }
                );

                setVerificationMessage(
                    response?.message ||
                    "A new verification code has been sent."
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
