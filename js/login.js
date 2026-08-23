"use strict";

(function initializeLoginPage() {
const {
    ApiError,
    apiRequest,
    authenticateUser,
    authenticateWithGoogle,
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
const termsAgreementGroup =
    document.getElementById("termsAgreementGroup");
const termsAgreementInput =
    document.getElementById("termsAgreementInput");

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
const googleSignIn =
    document.getElementById("googleSignIn");
const googleTermsDialog =
    document.getElementById("googleTermsDialog");
const googleTermsForm =
    document.getElementById("googleTermsForm");
const googleTermsAgreement =
    document.getElementById("googleTermsAgreement");
const googleTermsMessage =
    document.getElementById("googleTermsMessage");
const googleTermsCancel =
    document.getElementById("googleTermsCancel");
const googleTermsSubmit =
    document.getElementById("googleTermsSubmit");

let authMode = "login";
let isSubmitting = false;
let isGoogleSubmitting = false;
let googleInitialized = false;
let googleButtonWidth = 0;
let googleResizeTimer = 0;
let googleResizeObserver = null;
let pendingGoogleCredential = null;
let isGoogleRegistrationSubmitting = false;
let googleAuthenticationComplete = false;


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

    if (termsAgreementGroup) {
        termsAgreementGroup.hidden =
            !isRegisterMode;
    }

    if (termsAgreementInput) {
        if (!isRegisterMode) {
            termsAgreementInput.checked = false;
        }
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


function setGoogleSubmitting(submitting) {
    isGoogleSubmitting = submitting;
    if (googleSignIn) {
        googleSignIn.classList.toggle("is-loading", submitting);
        googleSignIn.setAttribute("aria-busy", String(submitting));
    }
}


function setGoogleTermsMessage(message) {
    if (googleTermsMessage) {
        googleTermsMessage.textContent = message;
        googleTermsMessage.classList.toggle("error-state", Boolean(message));
    }
}


function resetGoogleTermsFlow() {
    pendingGoogleCredential = null;
    isGoogleRegistrationSubmitting = false;
    if (googleTermsAgreement) googleTermsAgreement.checked = false;
    if (googleTermsSubmit) googleTermsSubmit.disabled = false;
    if (googleTermsCancel) googleTermsCancel.disabled = false;
    setGoogleTermsMessage("");
}


function closeGoogleTermsFlow() {
    if (googleTermsDialog?.open) googleTermsDialog.close();
    resetGoogleTermsFlow();
}


function handleGoogleTermsRequired(credential) {
    pendingGoogleCredential = credential;
    if (googleTermsAgreement) googleTermsAgreement.checked = false;
    setGoogleTermsMessage("");
    setLoginMessage("");
    googleTermsDialog?.showModal();
    googleTermsAgreement?.focus();
}


function getGoogleErrorMessage(error) {
    if (!(error instanceof ApiError)) {
        return "Google sign-in failed. Please try again.";
    }
    if (error.kind === "google_auth_unavailable") {
        return "Google sign-in is temporarily unavailable. Please try again later.";
    }
    if (error.kind === "google_identity_conflict") {
        return "This Google account cannot be linked automatically. Please sign in using your existing WaffleBerry account.";
    }
    return "Google sign-in failed. Please try again.";
}


async function handleGoogleCredential(response) {
    if (
        isGoogleSubmitting ||
        isSubmitting ||
        googleAuthenticationComplete ||
        !response?.credential
    ) {
        return;
    }

    setGoogleSubmitting(true);
    setLoginMessage("Signing you in with Google...");
    try {
        await authenticateWithGoogle(response.credential);
        googleAuthenticationComplete = true;
        window.location.href = "experience.html";
    } catch (error) {
        clearStoredSession();
        if (error instanceof ApiError && error.kind === "terms_required") {
            handleGoogleTermsRequired(response.credential);
        } else {
            setLoginMessage(getGoogleErrorMessage(error), "error");
        }
    } finally {
        setGoogleSubmitting(false);
    }
}


if (googleTermsForm) {
    googleTermsForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (isGoogleRegistrationSubmitting || googleAuthenticationComplete) return;
        if (!googleTermsAgreement?.checked) {
            setGoogleTermsMessage("Please accept the Terms & Conditions to continue.");
            return;
        }
        if (!pendingGoogleCredential) {
            closeGoogleTermsFlow();
            setLoginMessage("Your Google sign-in session expired. Please try again.", "error");
            return;
        }

        isGoogleRegistrationSubmitting = true;
        googleTermsSubmit.disabled = true;
        if (googleTermsCancel) googleTermsCancel.disabled = true;
        setGoogleTermsMessage("Creating your account...");
        try {
            await authenticateWithGoogle(pendingGoogleCredential, true);
            googleAuthenticationComplete = true;
            pendingGoogleCredential = null;
            if (googleTermsDialog.open) googleTermsDialog.close();
            window.location.href = "experience.html";
        } catch (error) {
            if (error instanceof ApiError && error.kind === "invalid_google_credential") {
                closeGoogleTermsFlow();
                setLoginMessage("Your Google sign-in session expired. Please try again.", "error");
                return;
            }
            if (error instanceof ApiError && ["google_auth_unavailable", "google_identity_conflict"].includes(error.kind)) {
                closeGoogleTermsFlow();
                setLoginMessage(getGoogleErrorMessage(error), "error");
                return;
            }
            setGoogleTermsMessage("Unable to create your account. Please try again.");
        } finally {
            isGoogleRegistrationSubmitting = false;
            if (googleTermsSubmit) googleTermsSubmit.disabled = false;
            if (googleTermsCancel) googleTermsCancel.disabled = false;
        }
    });
}

googleTermsCancel?.addEventListener("click", closeGoogleTermsFlow);
googleTermsDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeGoogleTermsFlow();
});


function initializeGoogleSignIn() {
    if (googleInitialized || !googleSignIn) {
        return;
    }
    const clientId = String(
        window.WAFFLEBERRY_GOOGLE_CLIENT_ID || ""
    ).trim();
    const googleAccounts = window.google?.accounts?.id;
    if (!clientId || !googleAccounts) {
        const status = googleSignIn.querySelector("small");
        if (status) {
            status.textContent = clientId ? "Unavailable" : "Not configured";
        }
        return;
    }

    googleInitialized = true;
    googleAccounts.initialize({
        client_id: clientId,
        callback: handleGoogleCredential
    });

    const renderGoogleButton = () => {
        const availableWidth = Math.floor(googleSignIn.clientWidth || 0);
        if (availableWidth <= 0) return;

        const width = Math.min(400, availableWidth);
        if (width === googleButtonWidth) return;

        googleButtonWidth = width;
        googleSignIn.replaceChildren();
        googleAccounts.renderButton(
            googleSignIn,
            {
                type: "standard",
                theme: "filled_black",
                size: "large",
                text: "continue_with",
                shape: "rectangular",
                logo_alignment: "left",
                locale: "en",
                width
            }
        );
    };

    renderGoogleButton();

    if (window.ResizeObserver) {
        googleResizeObserver = new window.ResizeObserver(() => {
            window.clearTimeout(googleResizeTimer);
            googleResizeTimer = window.setTimeout(renderGoogleButton, 120);
        });
        googleResizeObserver.observe(googleSignIn);
    }
}

window.initializeWaffleBerryGoogleSignIn = initializeGoogleSignIn;





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

            if (
                isRegisterMode &&
                (!termsAgreementInput ||
                    !termsAgreementInput.checked)
            ) {
                setLoginMessage(
                    "Please accept the Terms & Conditions to continue.",
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
                                email,
                                accepted_terms: true
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
