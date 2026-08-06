"use strict";

(function initializeForgotPasswordPage() {

const {
    ApiError,
    apiRequest
} = window.WaffleBerryApi;

const forgotPasswordForm =
    document.getElementById("forgotPasswordForm");

const emailInput =
    document.getElementById("emailInput");

const loginMessage =
    document.getElementById("loginMessage");

const backToLoginButton =
    document.getElementById("backToLoginButton");

const authSubmitButton =
    document.getElementById("authSubmitButton");

function setMessage(message, type = "") {

    loginMessage.textContent = message;

    loginMessage.classList.toggle(
        "error-state",
        type === "error"
    );
}

if (backToLoginButton) {

    backToLoginButton.addEventListener(
        "click",
        () => {
            window.location.href = "login.html";
        }
    );
}

if (forgotPasswordForm) {

    forgotPasswordForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            const email =
                emailInput.value.trim();

            if (!email) {

                setMessage(
                    "Please enter your email address.",
                    "error"
                );

                return;
            }

            authSubmitButton.disabled = true;

            setMessage(
                "Sending OTP..."
            );

            try {

                await apiRequest(
                    "/forgot-password",
                    {
                        method: "POST",
                        authenticated: false,
                        body: {
                            email
                        }
                    }
                );

                window.location.href =
                    `verify-reset-otp.html?email=${encodeURIComponent(email)}`;

            } catch (error) {

                if (error instanceof ApiError) {

                    setMessage(
                        error.message,
                        "error"
                    );

                } else {

                    setMessage(
                        "Something went wrong.",
                        "error"
                    );
                }

            } finally {

                authSubmitButton.disabled = false;
            }
        }
    );
}

})();