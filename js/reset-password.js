"use strict";

(function initializeResetPassword() {
const {
    ApiError,
    apiRequest,
    authenticateUser
} = window.WaffleBerryApi;

const form =
    document.getElementById("resetPasswordForm");

const passwordInput =
    document.getElementById("passwordInput");

const confirmPasswordInput =
    document.getElementById("confirmPasswordInput");

const submitButton =
    document.getElementById("authSubmitButton");

const loginMessage =
    document.getElementById("loginMessage");

const backButton =
    document.getElementById("backToLoginButton");

const email = new URLSearchParams(
    window.location.search
).get("email")?.trim();

let isSubmitting = false;

function setMessage(message, type = "") {
    if (!loginMessage) {
        return;
    }

    loginMessage.textContent = message;
    loginMessage.classList.toggle(
        "error-state",
        type === "error"
    );
}

function setSubmitting(submitting) {
    isSubmitting = submitting;

    if (submitButton) {
        submitButton.disabled = submitting;
    }
}

function getErrorMessage(error) {
    if (!(error instanceof ApiError)) {
        return "Unable to reset your password.";
    }

    return error.message;
}

if (!email) {
    setMessage(
        "Missing email address.",
        "error"
    );

    setSubmitting(true);
    return;
}

if (form) {
    form.addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            if (isSubmitting) {
                return;
            }

            const password =
                passwordInput.value;

            const confirmPassword =
                confirmPasswordInput.value;

            if (!password || !confirmPassword) {
                setMessage(
                    "Please fill in all fields.",
                    "error"
                );
                return;
            }

            if (password !== confirmPassword) {
                setMessage(
                    "Passwords do not match.",
                    "error"
                );
                return;
            }

            setSubmitting(true);
            setMessage(
                "Resetting your password..."
            );

            try {

                await apiRequest(
                    "/reset-password",
                    {
                        method: "POST",
                        authenticated: false,
                        body: {
                            email,
                            password
                        }
                    }
                );

                setMessage(
                    "Password reset successfully! Signing you in..."
                );

                await authenticateUser(
                    email,
                    password
                );

                window.location.href =
                    "experience.html";

            } catch (error) {

                setMessage(
                    getErrorMessage(error),
                    "error"
                );

            } finally {

                setSubmitting(false);

            }

        }
    );
}

if (backButton) {

    backButton.addEventListener(
        "click",
        () => {

            window.location.href =
                "login.html";

        }
    );

}

})();