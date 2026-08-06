"use strict";

(function initializeLoginPage() {
    const { ApiError, apiRequest, storeSession } = window.WaffleBerryApi;

    // === STATE MANAGEMENT ===
    const state = {
        authMode: "login",
        registrationId: null,
        registrationToken: null,
        email: null,
        fullName: null,
        resendCooldownEnd: null,
        isSubmitting: false,
    };

    // === DOM ELEMENTS ===
    const elements = {
        authTitle: document.getElementById("authTitle"),
        authDescription: document.getElementById("authDescription"),
        authTogglePrompt: document.getElementById("authTogglePrompt"),
        createAccountButton: document.getElementById("createAccountButton"),
        loginForm: document.getElementById("loginForm"),
        loginMessage: document.getElementById("loginMessage"),

        stage1: document.getElementById("stage1-identity"),
        fullNameGroup: document.getElementById("fullNameGroup"),
        fullNameInput: document.getElementById("fullNameInput"),
        emailInput: document.getElementById("emailInput"),
        passwordInput: document.getElementById("passwordInput"),
        togglePassword: document.getElementById("togglePassword"),
        rememberMe: document.getElementById("rememberMe"),
        authSubmitButton: document.getElementById("authSubmitButton"),
        authSubmitText: document.getElementById("authSubmitText"),

        stage2: document.getElementById("stage2-otp"),
        otpEmailDisplay: document.getElementById("otpEmailDisplay"),
        otpExpiryDisplay: document.getElementById("otpExpiryDisplay"),
        otpInput: document.getElementById("otpInput"),
        otpHelp: document.getElementById("otpHelp"),
        verifyOtpButton: document.getElementById("verifyOtpButton"),
        resendOtpButton: document.getElementById("resendOtpButton"),
        changeEmailButton: document.getElementById("changeEmailButton"),
        resendCooldown: document.getElementById("resendCooldown"),

        stage3: document.getElementById("stage3-password"),
        passwordStageSummary: document.getElementById("passwordStageSummary"),
        newPasswordInput: document.getElementById("newPasswordInput"),
        toggleNewPassword: document.getElementById("toggleNewPassword"),
        confirmPasswordInput: document.getElementById("confirmPasswordInput"),
        toggleConfirmPassword: document.getElementById("toggleConfirmPassword"),
        passwordMismatchError: document.getElementById("passwordMismatchError"),
        completeRegistrationButton: document.getElementById("completeRegistrationButton"),
    };

    // === UTILITY FUNCTIONS ===

    function setMessage(message, type = "") {
        if (!elements.loginMessage) return;
        elements.loginMessage.textContent = message;
        elements.loginMessage.classList.toggle("error-state", type === "error");
    }

    function setAuthTitle(title) {
        if (elements.authTitle) elements.authTitle.textContent = title;
    }

    function setAuthDescription(description) {
        if (elements.authDescription) elements.authDescription.textContent = description;
    }

    function showStage(stageNumber) {
        if (elements.stage1) elements.stage1.hidden = stageNumber !== 1;
        if (elements.stage2) elements.stage2.hidden = stageNumber !== 2;
        if (elements.stage3) elements.stage3.hidden = stageNumber !== 3;
    }

    function clearForm() {
        if (elements.fullNameInput) elements.fullNameInput.value = "";
        if (elements.emailInput) elements.emailInput.value = "";
        if (elements.passwordInput) elements.passwordInput.value = "";
        if (elements.otpInput) elements.otpInput.value = "";
        if (elements.newPasswordInput) elements.newPasswordInput.value = "";
        if (elements.confirmPasswordInput) elements.confirmPasswordInput.value = "";
        setMessage("", "");
    }

    // === OTP COUNTDOWN TIMER ===

    function startResendCooldown(seconds) {
        state.resendCooldownEnd = Date.now() + seconds * 1000;
        updateCooldownDisplay();

        const interval = setInterval(() => {
            if (updateCooldownDisplay() <= 0) {
                clearInterval(interval);
            }
        }, 1000);
    }

    function updateCooldownDisplay() {
        if (!state.resendCooldownEnd) return 0;

        const remaining = Math.max(0, Math.ceil((state.resendCooldownEnd - Date.now()) / 1000));
        if (elements.resendCooldown) {
            if (remaining > 0) {
                elements.resendCooldown.textContent = `Resend available in ${remaining}s`;
                if (elements.resendOtpButton) elements.resendOtpButton.disabled = true;
            } else {
                elements.resendCooldown.textContent = "";
                if (elements.resendOtpButton) elements.resendOtpButton.disabled = false;
            }
        }
        return remaining;
    }

<<<<<<< Updated upstream
    storeSession(
        response.access_token,
        response.user
    );

    sessionStorage.removeItem(
        "waffleberryNightModeDiscoveryShownSession"
    );
}
=======
    // === PASSWORD VISIBILITY TOGGLES ===
>>>>>>> Stashed changes

    function setupPasswordToggle(inputEl, buttonEl) {
        if (!buttonEl || !inputEl) return;

        buttonEl.addEventListener("click", (e) => {
            e.preventDefault();
            const isPassword = inputEl.type === "password";
            inputEl.type = isPassword ? "text" : "password";
            buttonEl.textContent = isPassword ? "🙈" : "👁";
            buttonEl.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
        });
    }

    setupPasswordToggle(elements.passwordInput, elements.togglePassword);
    setupPasswordToggle(elements.newPasswordInput, elements.toggleNewPassword);
    setupPasswordToggle(elements.confirmPasswordInput, elements.toggleConfirmPassword);

    // === OTP INPUT HANDLING ===

    if (elements.otpInput) {
        elements.otpInput.addEventListener("input", (e) => {
            e.target.value = e.target.value.replace(/\D/g, "");
        });

        elements.otpInput.addEventListener("paste", (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData("text");
            const digits = text.replace(/\D/g, "");
            e.target.value = digits.substring(0, 6);
        });

        elements.otpInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && elements.otpInput.value.length === 6) {
                e.preventDefault();
                verifyOTP();
            }
        });
    }

    // === REGISTRATION FLOW: REQUEST OTP ===

    async function requestOTP() {
        const fullName = elements.fullNameInput.value.trim();
        const email = elements.emailInput.value.trim();

        if (!fullName || !email) {
            setMessage("Please enter your name and email", "error");
            return;
        }

        if (state.isSubmitting) return;
        state.isSubmitting = true;
        if (elements.authSubmitButton) elements.authSubmitButton.disabled = true;
        setMessage("Sending verification code...", "");

        try {
            const response = await apiRequest("POST", "/registration/email/request-otp", {
                full_name: fullName,
                email: email,
            });

            state.registrationId = response.registration_id;
            state.email = email;
            state.fullName = fullName;

            showStage(2);
            setAuthTitle("Verify your email");
            setAuthDescription("We've sent a verification code to your email");
            
            if (elements.otpEmailDisplay) {
                elements.otpEmailDisplay.textContent = `Code sent to ${response.masked_email}`;
            }
            if (elements.otpExpiryDisplay) {
                elements.otpExpiryDisplay.textContent = `Expires in ${Math.round(response.expires_in_seconds / 60)} minutes`;
            }

            if (response.resend_available_in_seconds > 0) {
                startResendCooldown(response.resend_available_in_seconds);
            }

            setTimeout(() => elements.otpInput.focus(), 100);
            setMessage("", "");
        } catch (error) {
            console.error("OTP request failed:", error);
            setMessage(error.message || "Failed to send verification code", "error");
        } finally {
            state.isSubmitting = false;
            if (elements.authSubmitButton) elements.authSubmitButton.disabled = false;
        }
    }

    // === REGISTRATION FLOW: VERIFY OTP ===

    async function verifyOTP() {
        const otp = elements.otpInput.value.trim();

        if (!otp || otp.length !== 6) {
            setMessage("Please enter a valid 6-digit code", "error");
            return;
        }

        if (state.isSubmitting) return;
        state.isSubmitting = true;
        if (elements.verifyOtpButton) elements.verifyOtpButton.disabled = true;
        setMessage("Verifying code...", "");

        try {
            const response = await apiRequest("POST", "/registration/email/verify-otp", {
                registration_id: state.registrationId,
                otp: otp,
            });

            state.registrationToken = response.registration_token;

            showStage(3);
            setAuthTitle("Create your password");
            setAuthDescription("Secure your account with a strong password");

            if (elements.passwordStageSummary) {
                elements.passwordStageSummary.textContent = `Account for: ${state.email}`;
            }

            setTimeout(() => elements.newPasswordInput.focus(), 100);
            setMessage("", "");
        } catch (error) {
            console.error("OTP verification failed:", error);
            setMessage(error.message || "Invalid code. Please try again.", "error");
        } finally {
            state.isSubmitting = false;
            if (elements.verifyOtpButton) elements.verifyOtpButton.disabled = false;
        }
    }

    // === REGISTRATION FLOW: RESEND OTP ===

    async function resendOTP() {
        if (state.isSubmitting || !state.registrationId) return;

        state.isSubmitting = true;
        if (elements.resendOtpButton) elements.resendOtpButton.disabled = true;
        setMessage("Sending new code...", "");

        try {
            const response = await apiRequest("POST", "/registration/email/resend-otp", {
                registration_id: state.registrationId,
            });

            if (response.status === "cooldown") {
                setMessage(`Please wait ${response.resend_available_in_seconds}s before resending`, "");
                startResendCooldown(response.resend_available_in_seconds);
            } else {
                setMessage("New code sent to your email", "");
                if (elements.otpInput) elements.otpInput.value = "";
                if (elements.otpInput) elements.otpInput.focus();
                startResendCooldown(60);
            }
        } catch (error) {
            console.error("Resend failed:", error);
            setMessage(error.message || "Failed to resend code", "error");
        } finally {
            state.isSubmitting = false;
        }
    }

    // === REGISTRATION FLOW: CHANGE EMAIL ===

    function changeEmail() {
        state.registrationId = null;
        state.registrationToken = null;
        clearForm();
        showStage(1);
        setAuthTitle("Create your account");
        setAuthDescription("Enter your details to get started");
        if (elements.fullNameInput) elements.fullNameInput.focus();
    }

    // === REGISTRATION FLOW: COMPLETE REGISTRATION ===

    async function completeRegistration() {
        const password = elements.newPasswordInput.value;
        const confirmPassword = elements.confirmPasswordInput.value;

        if (!password || password.length < 8) {
            setMessage("Password must be at least 8 characters", "error");
            return;
        }

        if (password !== confirmPassword) {
            if (elements.passwordMismatchError) {
                elements.passwordMismatchError.textContent = "Passwords do not match";
            }
            return;
        }

        if (state.isSubmitting) return;
        state.isSubmitting = true;
        if (elements.completeRegistrationButton) elements.completeRegistrationButton.disabled = true;
        setMessage("Creating account...", "");

        try {
            const response = await apiRequest("POST", "/registration/complete", {
                registration_token: state.registrationToken,
                password: password,
                confirm_password: confirmPassword,
            });

            storeSession(response.access_token, response.user);
            setMessage("Account created! Redirecting...", "");
            setTimeout(() => {
                window.location.href = "/companion-home.html";
            }, 1000);
        } catch (error) {
            console.error("Registration completion failed:", error);
            setMessage(error.message || "Failed to create account", "error");
        } finally {
            state.isSubmitting = false;
            if (elements.completeRegistrationButton) elements.completeRegistrationButton.disabled = false;
        }
    }

    // === PASSWORD VALIDATION ===

    function validatePasswords() {
        const password = elements.newPasswordInput.value;
        const confirm = elements.confirmPasswordInput.value;

        if (password && confirm && password !== confirm) {
            if (elements.passwordMismatchError) {
                elements.passwordMismatchError.textContent = "Passwords do not match";
                elements.passwordMismatchError.style.display = "block";
            }
            if (elements.completeRegistrationButton) elements.completeRegistrationButton.disabled = true;
        } else {
            if (elements.passwordMismatchError) {
                elements.passwordMismatchError.textContent = "";
                elements.passwordMismatchError.style.display = "none";
            }
            if (elements.completeRegistrationButton) elements.completeRegistrationButton.disabled = false;
        }
    }

    // === LOGIN MODE HANDLING ===

    async function handleLogin(e) {
        e.preventDefault();

        if (!state.authMode.startsWith("register")) {
            // LOGIN MODE
            const email = elements.emailInput.value.trim();
            const password = elements.passwordInput.value;

            if (!email || !password) {
                setMessage("Please enter email and password", "error");
                return;
            }

            if (state.isSubmitting) return;
            state.isSubmitting = true;
            if (elements.authSubmitButton) elements.authSubmitButton.disabled = true;

            try {
                const response = await apiRequest("POST", "/users/login", {
                    email: email,
                    password: password,
                });

                storeSession(response.access_token, response.user);
                window.location.href = "/companion-home.html";
            } catch (error) {
                console.error("Login failed:", error);
                setMessage(error.message || "Login failed", "error");
                state.isSubmitting = false;
                if (elements.authSubmitButton) elements.authSubmitButton.disabled = false;
            }
        } else {
            // REGISTRATION MODE - Request OTP
            e.preventDefault();
            requestOTP();
        }
    }

    // === MODE TOGGLE ===

    function toggleAuthMode() {
        if (state.authMode === "login") {
            state.authMode = "register_identity";
            showStage(1);
            setAuthTitle("Create your account");
            setAuthDescription("Sign up to get started with WaffleBerry");
            
            if (elements.fullNameGroup) elements.fullNameGroup.hidden = false;
            if (elements.fullNameInput) elements.fullNameInput.required = true;
            if (elements.authTogglePrompt) elements.authTogglePrompt.textContent = "Already have an account?";
            if (elements.createAccountButton) elements.createAccountButton.textContent = "Sign In";
            if (elements.authSubmitText) elements.authSubmitText.textContent = "Verify Email";
            if (elements.rememberMe) elements.rememberMe.parentElement.hidden = true;

            clearForm();
            if (elements.fullNameInput) elements.fullNameInput.focus();
        } else {
            state.authMode = "login";
            showStage(1);
            clearForm();
            setAuthTitle("Welcome back");
            setAuthDescription("Sign in to continue your memories and conversations with Berry");
            
            if (elements.fullNameGroup) elements.fullNameGroup.hidden = true;
            if (elements.fullNameInput) elements.fullNameInput.required = false;
            if (elements.authTogglePrompt) elements.authTogglePrompt.textContent = "Don't have an account?";
            if (elements.createAccountButton) elements.createAccountButton.textContent = "Create Account";
            if (elements.authSubmitText) elements.authSubmitText.textContent = "Sign in";
            if (elements.rememberMe) elements.rememberMe.parentElement.hidden = false;

            if (elements.emailInput) elements.emailInput.focus();
        }
    }

    // === EVENT LISTENERS ===

    if (elements.loginForm) {
        elements.loginForm.addEventListener("submit", handleLogin);
    }

    if (elements.createAccountButton) {
        elements.createAccountButton.addEventListener("click", (e) => {
            e.preventDefault();
            toggleAuthMode();
        });
    }

    if (elements.verifyOtpButton) {
        elements.verifyOtpButton.addEventListener("click", (e) => {
            e.preventDefault();
            verifyOTP();
        });
    }

    if (elements.resendOtpButton) {
        elements.resendOtpButton.addEventListener("click", (e) => {
            e.preventDefault();
            resendOTP();
        });
    }

    if (elements.changeEmailButton) {
        elements.changeEmailButton.addEventListener("click", (e) => {
            e.preventDefault();
            changeEmail();
        });
    }

    if (elements.completeRegistrationButton) {
        elements.completeRegistrationButton.addEventListener("click", (e) => {
            e.preventDefault();
            completeRegistration();
        });
    }

    if (elements.newPasswordInput) {
        elements.newPasswordInput.addEventListener("input", validatePasswords);
    }

    if (elements.confirmPasswordInput) {
        elements.confirmPasswordInput.addEventListener("input", validatePasswords);
        elements.confirmPasswordInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && !elements.completeRegistrationButton.disabled) {
                e.preventDefault();
                completeRegistration();
            }
        });
    }

    // Initialize
    setAuthTitle("Welcome back");
    setAuthDescription("Sign in to continue your memories and conversations with Berry");
    showStage(1);
})();

