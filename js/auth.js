"use strict";

(() => {
  const { ApiError, apiRequest, authenticateUser, authenticateWithGoogle, clearStoredSession, refreshSession } = window.LegaryaAuthApi;
  const config = window.LEGARYA_AUTH_CONFIG;
  const form = document.querySelector("#authForm");
  const modeButtons = [...document.querySelectorAll("[data-auth-mode]")];
  const fullNameGroup = document.querySelector("#fullNameGroup");
  const fullNameInput = document.querySelector("#fullNameInput");
  const emailInput = document.querySelector("#emailInput");
  const passwordGroup = document.querySelector("#passwordGroup");
  const passwordInput = document.querySelector("#passwordInput");
  const rememberGroup = document.querySelector("#rememberGroup");
  const rememberInput = document.querySelector("#rememberInput");
  const termsGroup = document.querySelector("#termsGroup");
  const termsInput = document.querySelector("#termsInput");
  const submit = document.querySelector("#authSubmit");
  const submitText = document.querySelector("#authSubmitText");
  const title = document.querySelector("#authTitle");
  const description = document.querySelector("#authDescription");
  const toggle = document.querySelector("#authToggle");
  const togglePrompt = document.querySelector("#authTogglePrompt");
  const message = document.querySelector("#authMessage");
  const passwordToggle = document.querySelector("#togglePassword");
  const googleContainer = document.querySelector("#googleSignIn");
  const googleDialog = document.querySelector("#googleTermsDialog");
  const googleForm = document.querySelector("#googleTermsForm");
  const googleTermsInput = document.querySelector("#googleTermsInput");
  const googleTermsMessage = document.querySelector("#googleTermsMessage");
  const googleCancel = document.querySelector("#googleTermsCancel");
  const googleSubmit = document.querySelector("#googleTermsSubmit");
  let mode = "login";
  let submitting = false;
  let googleInitialized = false;
  let googleWidth = 0;
  let pendingGoogleCredential = null;

  const showMessage = (text = "", error = false) => {
    message.textContent = text;
    message.classList.toggle("error-state", error);
  };

  const finishAuthentication = () => {
    const next = new URLSearchParams(location.search).get("next");
    location.href = next && /^invite\.html\?token=[A-Za-z0-9_-]+$/.test(next) ? next : config.successUrl;
  };

  const setMode = (nextMode, updateUrl = true) => {
    mode = nextMode === "register" ? "register" : "login";
    const registering = mode === "register";
    fullNameGroup.hidden = !registering;
    fullNameInput.required = registering;
    passwordGroup.hidden = registering;
    passwordInput.required = !registering;
    rememberGroup.hidden = registering;
    termsGroup.hidden = !registering;
    if (!registering) termsInput.checked = false;
    title.textContent = registering ? "Begin your Legacy" : "Welcome back";
    description.innerHTML = registering
      ? 'Create your <span class="legarya-word"><span class="legarya-prefix">Lega</span><span class="rya-glow">Rya</span></span> account and start preserving what matters.'
      : 'Continue your memories, stories and conversations with <span class="rya-glow">Rya</span>.';
    submitText.textContent = registering ? "Continue" : "Sign In";
    togglePrompt.textContent = registering ? "Already have an account?" : "Don't have an account?";
    toggle.textContent = registering ? "Sign In" : "Create Account";
    document.title = `${registering ? "Create Account" : "Sign In"} | LegaRya`;
    modeButtons.forEach((button) => button.setAttribute("aria-selected", String(button.dataset.authMode === mode)));
    showMessage();
    if (updateUrl) {
      const params = new URLSearchParams(location.search); params.set("mode", mode);
      history.replaceState(null, "", `auth.html?${params}`);
    }
  };

  const setSubmitting = (active) => {
    submitting = active;
    submit.disabled = active;
    toggle.disabled = active;
  };

  modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.authMode)));
  toggle.addEventListener("click", () => setMode(mode === "login" ? "register" : "login"));

  passwordToggle.addEventListener("click", () => {
    const hidden = passwordInput.type === "password";
    passwordInput.type = hidden ? "text" : "password";
    passwordToggle.textContent = hidden ? "Hide" : "Show";
    passwordToggle.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const email = emailInput.value.trim();
    const registering = mode === "register";
    const fullName = fullNameInput.value.trim();
    if (!email || (registering && !fullName) || (!registering && !passwordInput.value)) {
      showMessage(registering ? "Please enter your full name and email." : "Please enter your email and password.", true);
      return;
    }
    if (registering && !termsInput.checked) {
      showMessage("Please accept the Terms & Conditions to continue.", true);
      return;
    }

    setSubmitting(true);
    showMessage(registering ? "Preparing your account..." : "Signing you in...");
    try {
      if (registering) {
        await apiRequest("/auth/register", { method: "POST", body: { full_name: fullName, email, accepted_terms: true } });
        location.href = `verify-email.html?${new URLSearchParams({ email })}`;
      } else {
        await authenticateUser(email, passwordInput.value, rememberInput.checked);
        finishAuthentication();
      }
    } catch (error) {
      clearStoredSession();
      const text = error instanceof ApiError && error.status === 401 ? "Invalid email or password." : error.message || "Unable to continue.";
      showMessage(text, true);
    } finally {
      setSubmitting(false);
    }
  });

  const googleErrorMessage = (error) => {
    if (!(error instanceof ApiError)) return "Google sign-in failed. Please try again.";
    if (error.kind === "google_auth_unavailable") return "Google sign-in is temporarily unavailable.";
    if (error.kind === "google_identity_conflict") return "Use the sign-in method already connected to this email.";
    return "Google sign-in failed. Please try again.";
  };

  const handleGoogleCredential = async (response) => {
    if (submitting || !response?.credential) return;
    setSubmitting(true);
    showMessage("Signing you in with Google...");
    try {
      await authenticateWithGoogle(response.credential);
      finishAuthentication();
    } catch (error) {
      clearStoredSession();
      if (error instanceof ApiError && error.kind === "terms_required") {
        pendingGoogleCredential = response.credential;
        googleTermsInput.checked = false;
        googleTermsMessage.textContent = "";
        googleDialog.showModal();
      } else showMessage(googleErrorMessage(error), true);
    } finally {
      setSubmitting(false);
    }
  };

  window.initializeLegaryaGoogleSignIn = () => {
    if (googleInitialized || !googleContainer) return;
    const googleAccounts = window.google?.accounts?.id;
    if (!config.googleClientId || !googleAccounts) {
      googleContainer.querySelector("button").textContent = "Google Sign-In unavailable";
      return;
    }
    googleInitialized = true;
    googleAccounts.initialize({ client_id: config.googleClientId, callback: handleGoogleCredential });
    const renderButton = () => {
      const width = Math.min(400, Math.floor(googleContainer.clientWidth));
      if (!width || width === googleWidth) return;
      googleWidth = width;
      googleContainer.replaceChildren();
      googleAccounts.renderButton(googleContainer, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "left",
        width,
      });
    };
    renderButton();
    if (window.ResizeObserver) new ResizeObserver(() => setTimeout(renderButton, 100)).observe(googleContainer);
  };

  googleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!googleTermsInput.checked) {
      googleTermsMessage.textContent = "Please accept the Terms & Conditions to continue.";
      googleTermsMessage.classList.add("error-state");
      return;
    }
    if (!pendingGoogleCredential) return googleDialog.close();
    googleSubmit.disabled = true;
    googleCancel.disabled = true;
    try {
      await authenticateWithGoogle(pendingGoogleCredential, true);
      pendingGoogleCredential = null;
      googleDialog.close();
      finishAuthentication();
    } catch (error) {
      googleTermsMessage.textContent = googleErrorMessage(error);
      googleTermsMessage.classList.add("error-state");
    } finally {
      googleSubmit.disabled = false;
      googleCancel.disabled = false;
    }
  });

  const closeGoogleTerms = () => {
    pendingGoogleCredential = null;
    if (googleDialog.open) googleDialog.close();
  };
  googleCancel.addEventListener("click", closeGoogleTerms);
  googleDialog.addEventListener("cancel", closeGoogleTerms);

  const requestedMode = new URLSearchParams(location.search).get("mode");
  setMode(requestedMode === "register" ? "register" : "login", false);
  if (new URLSearchParams(location.search).get("reset") === "success") {
    showMessage("Your password has been reset. You can now sign in.");
  }
  refreshSession().then((restored) => {
    if (restored) finishAuthentication();
  });
})();
