"use strict";

(function initializeLoginPage() {
const {
    ApiError,
    apiRequest,
    authenticateUser,
    clearStoredSession
} = window.WaffleBerryApi;

const loginForm =
    document.getElementById("loginForm");

const fullNameGroup =
    document.getElementById("fullNameGroup");

const fullNameInput =
    document.getElementById("fullNameInput");

const emailInput =
    document.getElementById("emailInput");

const passwordInput =
    document.getElementById("passwordInput");
const passwordGroup = document.getElementById("passwordGroup");

const confirmPasswordGroup =
    document.getElementById("confirmPasswordGroup");

const confirmPasswordInput =
    document.getElementById("confirmPasswordInput");

const togglePassword =
    document.getElementById("togglePassword");

const createAccountButton =
    document.getElementById(
        "createAccountButton"
    );

const forgotPasswordButton =
    document.getElementById("forgotPasswordButton");
const rememberMeGroup =
    document.getElementById("rememberMeGroup");

const authTitle =
    document.getElementById("authTitle");

const authDescription =
    document.getElementById(
        "authDescription"
    );

const authSubmitButton =
    document.getElementById(
        "authSubmitButton"
    );

const authSubmitText =
    document.getElementById(
        "authSubmitText"
    );

const authTogglePrompt =
    document.getElementById(
        "authTogglePrompt"
    );

const loginMessage =
    document.getElementById("loginMessage");

let authMode = "login";
let isSubmitting = false;


function setLoginMessage(message, type = "") {
    if (!loginMessage) {
        return;
    }

    loginMessage.textContent = message;
    loginMessage.classList.toggle(
        "error-state",
        type === "error"
    );
}


function setAuthMode(mode) {
    authMode = mode;

    const isRegisterMode =
        authMode === "register";

    if (fullNameGroup) {
        fullNameGroup.hidden =
            !isRegisterMode;
    }

    if (fullNameInput) {
        fullNameInput.required =
            isRegisterMode;
    }

    if (confirmPasswordGroup) {
        confirmPasswordGroup.hidden = true;
    }

    if (confirmPasswordInput) {
        confirmPasswordInput.required =
            false;
    }

    if (forgotPasswordButton) {
        forgotPasswordButton.hidden =
            isRegisterMode;
    }

    if (rememberMeGroup) {
        rememberMeGroup.hidden =
            isRegisterMode;
    }

    if (authTitle) {
        authTitle.textContent =
            isRegisterMode
                ? "Create your account"
                : "Welcome back";
    }

    if (authDescription) {
        authDescription.textContent =
            isRegisterMode
                ? "Join Waffle Berry to preserve your memories and conversations."
                : "Sign in to continue your memories and conversations with Berry.";
    }

    if (authSubmitText) {
        authSubmitText.textContent =
            isRegisterMode
                ? "Continue"
                : "Sign in";
    }

    if (authTogglePrompt) {
        authTogglePrompt.textContent =
            isRegisterMode
                ? "Already have an account?"
                : "Don't have an account?";
    }

    if (createAccountButton) {
        createAccountButton.textContent =
            isRegisterMode
                ? "Sign In"
                : "Create Account";
    }

    if (passwordInput) {
        passwordInput.required = !isRegisterMode;
        passwordInput.autocomplete =
            isRegisterMode
                ? "new-password"
                : "current-password";
    }
    if (passwordGroup) {
        passwordGroup.hidden = isRegisterMode;
    }

    setLoginMessage("");
}


function setSubmitting(submitting) {
    isSubmitting = submitting;

    if (authSubmitButton) {
        authSubmitButton.disabled =
            submitting;
    }

    if (createAccountButton) {
        createAccountButton.disabled =
            submitting;
    }
}





function getLoginErrorMessage(error) {
    if (!(error instanceof ApiError)) {
        return "Unable to sign in. Please try again.";
    }

    if (error.status === 401) {
        return "Invalid email or password.";
    }

    return error.message;
}


if (
    loginForm &&
    emailInput &&
    passwordInput
) {
    loginForm.addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            console.info("[signup] Form submitted.");

            if (isSubmitting) {
                return;
            }

            const email =
                emailInput.value.trim();
            const password =
                passwordInput.value;
            const confirmPassword =
                confirmPasswordInput
                    ? confirmPasswordInput.value
                    : "";
            const isRegisterMode =
                authMode === "register";
            const fullName =
                fullNameInput
                    ? fullNameInput.value.trim()
                    : "";

            if (
                !email ||
                (!isRegisterMode && !password) ||
                (isRegisterMode && !fullName)
            ) {
                setLoginMessage(
                    isRegisterMode
                        ? "Please enter your full name and email."
                        : "Please enter your email and password.",
                    "error"
                );
                return;
            }

            setSubmitting(true);
            setLoginMessage(
                isRegisterMode
                    ? "Creating your account..."
                    : "Signing you in..."
            );

            try {
                if (isRegisterMode) {
                    console.info(
                        "[signup] Sending POST /api/v1/users."
                    );
                    await apiRequest(
                        "/users",
                        {
                            method: "POST",
                            authenticated: false,
                            body: {
                                full_name:
                                    fullName,
                                email
                            }
                        }
                    );

                    console.info(
                        "[signup] Account creation response received."
                    );

                    const verificationParameters =
                        new URLSearchParams({ email });

                    window.location.href =
                        `verify-email.html?${verificationParameters}`;
                    return;
                }

                await authenticateUser(email, password);

                setLoginMessage(
                    "Signing you in..."
                );

                window.location.href =
                    "experience.html";
            } catch (error) {
                console.error(
                    "[signup] Account creation request failed.",
                    error
                );
                clearStoredSession();
                setLoginMessage(
                    getLoginErrorMessage(error),
                    "error"
                );
            } finally {
                setSubmitting(false);
            }
        }
    );
}


if (createAccountButton) {
    createAccountButton.addEventListener(
        "click",
        () => {
            if (isSubmitting) {
                return;
            }

            setAuthMode(
                authMode === "login"
                    ? "register"
                    : "login"
            );
        }
    );
}
if (
    forgotPasswordButton) {
    forgotPasswordButton.addEventListener(
        "click",
        () => {
            if (isSubmitting) {
                return;
            }

            window.location.href =
                "forgot-password.html";
        }
    );
}


if (
    togglePassword &&
    passwordInput
) {
    togglePassword.addEventListener(
        "click",
        () => {
            const passwordIsHidden =
                passwordInput.type ===
                "password";

            passwordInput.type =
                passwordIsHidden
                    ? "text"
                    : "password";

            togglePassword.textContent =
                passwordIsHidden
                    ? "🙈"
                    : "👁";

            togglePassword.setAttribute(
                "aria-label",
                passwordIsHidden
                    ? "Hide password"
                    : "Show password"
            );
        }
    );
}


setAuthMode("login");
})();
