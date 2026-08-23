"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

function element(id) {
    return {
        id, value: "", type: "password", hidden: false, required: false,
        checked: false, disabled: false, clientWidth: 320, textContent: "",
        classList: { toggle() {} },
        addEventListener(type, handler) { this[type] = handler; },
        setAttribute(name, value) { this[name] = value; },
        focus() { this.focused = true; },
        showModal() { this.open = true; },
        close() { this.open = false; },
        querySelector(selector) { return selector === "small" ? this.small : null; },
        replaceChildren() { this.replaced = true; },
        small: { textContent: "Loading..." }
    };
}

function loginContext({ clientId = "client-id", authenticateWithGoogle, containerWidth = 320, withResizeObserver = false } = {}) {
    const ids = [
        "loginForm", "fullNameGroup", "fullNameInput", "emailInput",
        "passwordInput", "passwordGroup", "confirmPasswordGroup",
        "confirmPasswordInput", "togglePassword", "createAccountButton",
        "forgotPasswordButton", "rememberMeGroup", "termsAgreementGroup",
        "termsAgreementInput", "authTitle", "authDescription",
        "authSubmitButton", "authSubmitText", "authTogglePrompt",
        "loginMessage", "googleSignIn", "googleTermsDialog",
        "googleTermsForm", "googleTermsAgreement", "googleTermsMessage",
        "googleTermsCancel", "googleTermsSubmit"
    ];
    const elements = Object.fromEntries(ids.map((id) => [id, element(id)]));
    elements.googleSignIn.clientWidth = containerWidth;
    const initialized = [];
    const rendered = [];
    const observers = [];
    class ApiError extends Error {
        constructor(message, options = {}) {
            super(message);
            this.status = options.status || 0;
            this.kind = options.kind || "unknown";
        }
    }
    const context = {
        window: {
            WAFFLEBERRY_GOOGLE_CLIENT_ID: clientId,
            location: { href: "" },
            setTimeout,
            clearTimeout,
            google: { accounts: { id: {
                initialize(options) { initialized.push(options); },
                renderButton(target, options) { rendered.push({ target, options }); }
            } } },
            WaffleBerryApi: {
                ApiError,
                apiRequest: async () => ({}),
                authenticateUser: async () => ({}),
                authenticateWithGoogle: authenticateWithGoogle || (async () => ({})),
                clearStoredSession() {}
            }
        },
        document: { getElementById: (id) => elements[id] || null },
        URLSearchParams,
        console: { info() {}, error() {} }
    };
    if (withResizeObserver) {
        context.window.ResizeObserver = class {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe(target) { this.target = target; }
        };
    }
    vm.runInNewContext(read("js/login.js"), context);
    return { context, elements, initialized, rendered, observers, ApiError };
}

test("login page loads current GIS library after local scripts", () => {
    const html = read("login.html");
    assert.match(html, /https:\/\/accounts\.google\.com\/gsi\/client/);
    assert.ok(html.indexOf("js/login.js") < html.indexOf("accounts.google.com/gsi/client"));
    assert.doesNotMatch(html, /platform\.js|gapi\.auth2/);
});

test("GIS initializes with configured client ID and renders supported button", () => {
    const result = loginContext({ clientId: "configured-client" });
    result.context.window.initializeWaffleBerryGoogleSignIn();
    assert.equal(result.initialized.length, 1);
    assert.equal(result.initialized[0].client_id, "configured-client");
    assert.equal(typeof result.initialized[0].callback, "function");
    assert.equal(result.rendered.length, 1);
    assert.equal(result.rendered[0].target, result.elements.googleSignIn);
    assert.deepEqual(
        { ...result.rendered[0].options },
        {
            type: "standard", theme: "filled_black", size: "large",
            text: "continue_with", shape: "rectangular",
            logo_alignment: "left", locale: "en", width: 320
        }
    );
});

test("GIS width is capped at 400px and respects narrow containers", () => {
    const wide = loginContext({ containerWidth: 640 });
    wide.context.window.initializeWaffleBerryGoogleSignIn();
    assert.equal(wide.rendered[0].options.width, 400);

    const narrow = loginContext({ containerWidth: 286 });
    narrow.context.window.initializeWaffleBerryGoogleSignIn();
    assert.equal(narrow.rendered[0].options.width, 286);
});

test("GIS resize replaces the existing button only when its width changes", async () => {
    const result = loginContext({ containerWidth: 390, withResizeObserver: true });
    result.context.window.initializeWaffleBerryGoogleSignIn();
    assert.equal(result.observers.length, 1);
    assert.equal(result.rendered.length, 1);

    result.observers[0].callback();
    await new Promise((resolve) => setTimeout(resolve, 140));
    assert.equal(result.rendered.length, 1);

    result.elements.googleSignIn.clientWidth = 320;
    result.observers[0].callback();
    await new Promise((resolve) => setTimeout(resolve, 140));
    assert.equal(result.rendered.length, 2);
    assert.equal(result.rendered[1].options.width, 320);
});

test("Google and Apple controls share the responsive provider layout", () => {
    const html = read("login.html");
    const css = read("css/style.css");
    assert.match(html, /provider-button-stack[\s\S]*googleSignIn[\s\S]*appleSignIn/);
    assert.match(css, /\.provider-button\s*\{[\s\S]*max-width:\s*400px/);
});

test("missing Google client ID leaves a graceful disabled placeholder", () => {
    const result = loginContext({ clientId: "" });
    result.context.window.initializeWaffleBerryGoogleSignIn();
    assert.equal(result.initialized.length, 0);
    assert.equal(result.rendered.length, 0);
    assert.equal(result.elements.googleSignIn.small.textContent, "Not configured");
});

test("Google API helper forwards only credential and accepted_terms false, includes cookies, and stores session", async () => {
    const requests = [];
    const stored = new Map();
    const responseBody = {
        access_token: "waffle-token", token_type: "bearer",
        user: { user_id: 1, email: "person@example.com" }
    };
    const context = {
        window: { location: { hostname: "localhost" }, WAFFLEBERRY_API_BASE_URL: "http://127.0.0.1:8000/api/v1" },
        localStorage: {
            getItem: (key) => stored.get(key) || null,
            setItem: (key, value) => stored.set(key, value),
            removeItem: (key) => stored.delete(key)
        },
        fetch: async (url, options) => {
            requests.push({ url, options });
            return { ok: true, status: 200, text: async () => JSON.stringify(responseBody) };
        },
        URL, AbortController, TextDecoder, setTimeout, clearTimeout
    };
    vm.runInNewContext(read("js/api.js"), context);
    await context.window.WaffleBerryApi.authenticateWithGoogle("google-credential");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://127.0.0.1:8000/api/v1/auth/google");
    assert.equal(requests[0].options.credentials, "include");
    assert.deepEqual(JSON.parse(requests[0].options.body), {
        credential: "google-credential", accepted_terms: false
    });
    assert.equal(stored.get("accessToken"), "waffle-token");
    assert.equal(JSON.parse(stored.get("currentUser")).user_id, 1);
});

test("Google API helper sends only the same credential and accepted_terms true for approved registration", async () => {
    const requests = [];
    const context = {
        window: { location: { hostname: "localhost" }, WAFFLEBERRY_API_BASE_URL: "http://127.0.0.1:8000/api/v1" },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        fetch: async (_url, options) => {
            requests.push(JSON.parse(options.body));
            return { ok: true, status: 200, text: async () => JSON.stringify({
                access_token: "token", token_type: "bearer", user: { user_id: 1 }
            }) };
        },
        URL, AbortController, TextDecoder, setTimeout, clearTimeout
    };
    vm.runInNewContext(read("js/api.js"), context);
    await context.window.WaffleBerryApi.authenticateWithGoogle("same-credential", true);
    assert.deepEqual(requests, [{ credential: "same-credential", accepted_terms: true }]);
});

test("Google success navigates once and duplicate callbacks are suppressed", async () => {
    let resolveRequest;
    const credentials = [];
    const pending = new Promise((resolve) => { resolveRequest = resolve; });
    const result = loginContext({
        authenticateWithGoogle: async (credential) => {
            credentials.push(credential);
            await pending;
        }
    });
    result.context.window.initializeWaffleBerryGoogleSignIn();
    const callback = result.initialized[0].callback;
    const first = callback({ credential: "credential-one" });
    const duplicate = callback({ credential: "credential-two" });
    assert.deepEqual(credentials, ["credential-one"]);
    resolveRequest();
    await Promise.all([first, duplicate]);
    assert.equal(result.context.window.location.href, "experience.html");
    assert.notEqual(result.elements.googleTermsDialog.open, true);
});

for (const [kind, message] of [
    ["google_auth_unavailable", "Google sign-in is temporarily unavailable. Please try again later."],
    ["google_identity_conflict", "This Google account cannot be linked automatically. Please sign in using your existing WaffleBerry account."],
    ["authentication", "Google sign-in failed. Please try again."]
]) {
    test(`Google ${kind} error uses safe dedicated feedback`, async () => {
        let errorClass;
        const result = loginContext({
            authenticateWithGoogle: async () => {
                throw new errorClass("provider detail", { kind });
            }
        });
        errorClass = result.ApiError;
        result.context.window.initializeWaffleBerryGoogleSignIn();
        await result.initialized[0].callback({ credential: "credential" });
        assert.equal(result.elements.loginMessage.textContent, message);
        assert.equal(result.context.window.location.href, "");
    });
}

test("terms_required opens an unchecked Google registration Terms dialog", async () => {
    let ApiErrorClass;
    const calls = [];
    const result = loginContext({ authenticateWithGoogle: async (...args) => {
        calls.push(args);
        throw new ApiErrorClass("Terms", { kind: "terms_required" });
    } });
    ApiErrorClass = result.ApiError;
    result.context.window.initializeWaffleBerryGoogleSignIn();
    await result.initialized[0].callback({ credential: "pending-credential" });
    assert.equal(result.elements.googleTermsDialog.open, true);
    assert.equal(result.elements.googleTermsAgreement.checked, false);
    assert.deepEqual(calls, [["pending-credential"]]);
});

test("unchecked Google Terms submission validates without another backend call", async () => {
    let ApiErrorClass;
    let calls = 0;
    const result = loginContext({ authenticateWithGoogle: async () => {
        calls += 1;
        throw new ApiErrorClass("Terms", { kind: "terms_required" });
    } });
    ApiErrorClass = result.ApiError;
    result.context.window.initializeWaffleBerryGoogleSignIn();
    await result.initialized[0].callback({ credential: "pending" });
    await result.elements.googleTermsForm.submit({ preventDefault() {} });
    assert.equal(calls, 1);
    assert.equal(result.elements.googleTermsMessage.textContent, "Please accept the Terms & Conditions to continue.");
});

test("accepted Google Terms resubmit the same credential once and navigate", async () => {
    let ApiErrorClass;
    const calls = [];
    const result = loginContext({ authenticateWithGoogle: async (...args) => {
        calls.push(args);
        if (calls.length === 1) throw new ApiErrorClass("Terms", { kind: "terms_required" });
        return {};
    } });
    ApiErrorClass = result.ApiError;
    result.context.window.initializeWaffleBerryGoogleSignIn();
    await result.initialized[0].callback({ credential: "same-credential" });
    result.elements.googleTermsAgreement.checked = true;
    await result.elements.googleTermsForm.submit({ preventDefault() {} });
    assert.deepEqual(calls, [["same-credential"], ["same-credential", true]]);
    assert.equal(result.context.window.location.href, "experience.html");
    assert.equal(result.elements.googleTermsDialog.open, false);
});

test("cancelling Google Terms clears pending registration", async () => {
    let ApiErrorClass;
    let calls = 0;
    const result = loginContext({ authenticateWithGoogle: async () => {
        calls += 1;
        throw new ApiErrorClass("Terms", { kind: "terms_required" });
    } });
    ApiErrorClass = result.ApiError;
    result.context.window.initializeWaffleBerryGoogleSignIn();
    await result.initialized[0].callback({ credential: "pending" });
    result.elements.googleTermsCancel.click();
    result.elements.googleTermsAgreement.checked = true;
    await result.elements.googleTermsForm.submit({ preventDefault() {} });
    assert.equal(calls, 1);
    assert.equal(result.elements.googleTermsDialog.open, false);
    assert.equal(result.elements.googleTermsAgreement.checked, false);
});

test("duplicate final Google registration submissions are prevented", async () => {
    let ApiErrorClass;
    let resolveFinal;
    const calls = [];
    const finalRequest = new Promise((resolve) => { resolveFinal = resolve; });
    const result = loginContext({ authenticateWithGoogle: async (...args) => {
        calls.push(args);
        if (calls.length === 1) throw new ApiErrorClass("Terms", { kind: "terms_required" });
        await finalRequest;
    } });
    ApiErrorClass = result.ApiError;
    result.context.window.initializeWaffleBerryGoogleSignIn();
    await result.initialized[0].callback({ credential: "pending" });
    result.elements.googleTermsAgreement.checked = true;
    const first = result.elements.googleTermsForm.submit({ preventDefault() {} });
    const duplicate = result.elements.googleTermsForm.submit({ preventDefault() {} });
    assert.equal(calls.length, 2);
    resolveFinal();
    await Promise.all([first, duplicate]);
});

test("expired Google credential closes and resets registration safely", async () => {
    let ApiErrorClass;
    let calls = 0;
    const result = loginContext({ authenticateWithGoogle: async () => {
        calls += 1;
        throw new ApiErrorClass("unsafe provider detail", {
            kind: calls === 1 ? "terms_required" : "invalid_google_credential"
        });
    } });
    ApiErrorClass = result.ApiError;
    result.context.window.initializeWaffleBerryGoogleSignIn();
    await result.initialized[0].callback({ credential: "expired" });
    result.elements.googleTermsAgreement.checked = true;
    await result.elements.googleTermsForm.submit({ preventDefault() {} });
    assert.equal(result.elements.googleTermsDialog.open, false);
    assert.equal(result.elements.googleTermsAgreement.checked, false);
    assert.equal(result.elements.loginMessage.textContent, "Your Google sign-in session expired. Please try again.");
});

test("Google Terms markup is unchecked, linked, accessible, and credentials stay out of storage", () => {
    const html = read("login.html");
    const source = read("js/login.js");
    const checkbox = html.match(/<input id="googleTermsAgreement"[^>]*>/)?.[0] || "";
    assert.match(checkbox, /type="checkbox"/);
    assert.doesNotMatch(checkbox, /checked/);
    assert.match(html, /googleTermsDialog[\s\S]*href="terms\.html"[\s\S]*rel="noopener noreferrer"/);
    assert.doesNotMatch(source, /(?:localStorage|sessionStorage).*pendingGoogleCredential/);
    assert.doesNotMatch(source, /console\.[a-z]+\([^)]*pendingGoogleCredential/);
});

test("normal email login and registration flows remain present", () => {
    const source = read("js/login.js");
    assert.match(source, /await authenticateUser\(email, password\)/);
    assert.match(source, /apiRequest\(\s*"\/users"/);
    assert.match(source, /accepted_terms:\s*true/);
});
