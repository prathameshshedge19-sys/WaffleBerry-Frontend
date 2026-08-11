"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("registration collects password only after OTP verification", () => {
    const login = read("js/login.js");
    const loginHtml = read("login.html");
    const verify = read("js/verify-email.js");
    assert.match(loginHtml, /<div class="form-group">\s*<label for="emailInput">/);
    assert.match(loginHtml, /<div id="passwordGroup" class="form-group">\s*<div class="password-label-row">/);
    assert.match(loginHtml, /id="rememberMeGroup"/);
    assert.match(login, /passwordGroup\.hidden = isRegisterMode/);
    assert.match(login, /rememberMeGroup\.hidden =\s*isRegisterMode/);
    assert.match(login, /forgotPasswordButton\.hidden =\s*isRegisterMode/);
    assert.match(login, /isRegisterMode\s*\? "Continue"/);
    assert.doesNotMatch(login, /pendingVerificationCredentials/);
    assert.match(verify, /\/complete-registration/);
    assert.match(verify, /Passwords do not match/);
    assert.match(verify, /verification_token:\s*authorization/);
    assert.match(verify, /storeAuthenticatedSession\(result\)/);
    assert.match(verify, /window\.location\.href = "experience\.html"/);
    assert.doesNotMatch(verify, /window\.location\.href = "login\.html"/);
});

test("login loads runtime config before one API utility", () => {
    const html = read("login.html");
    assert.ok(html.indexOf("js/config.js") < html.indexOf("js/api.js"));
    assert.equal((html.match(/js\/api\.js/g) || []).length, 1);
});

test("password reset carries OTP authorization and explicit resend purpose", () => {
    const verify = read("js/verify-reset-otp.js");
    const reset = read("js/reset-password.js");
    assert.match(verify, /purpose:\s*"password_reset"/);
    assert.match(verify, /passwordResetAuthorization/);
    assert.match(reset, /reset_token:\s*resetToken/);
    assert.match(reset, /Passwords do not match/);
    assert.doesNotMatch(reset, /authenticateUser/);
});

test("API helper never stores pending plaintext registration credentials", () => {
    assert.doesNotMatch(read("js/api.js"), /pendingVerificationCredentials/);
});

for (const page of ["verify-email.html", "forgot-password.html", "reset-password.html"]) {
    test(`${page} loads runtime config before the API utility`, () => {
        const html = read(page);
        assert.ok(html.indexOf("js/config.js") < html.indexOf("js/api.js"));
        assert.equal((html.match(/js\/config\.js/g) || []).length, 1);
        assert.equal((html.match(/js\/api\.js/g) || []).length, 1);
    });
}

test("runtime config allows WaffleBerryApi to initialize", () => {
    const context = {
        window: { location: { hostname: "waffleberry.app" } },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        fetch: async () => { throw new Error("unexpected request"); },
        URL,
        AbortController,
        TextDecoder,
        setTimeout,
        clearTimeout
    };
    vm.runInNewContext(read("js/config.js"), context);
    vm.runInNewContext(read("js/api.js"), context);
    assert.equal(typeof context.window.WaffleBerryApi.apiRequest, "function");
});

test("OTP form submits to the existing email verification API", async () => {
    const elements = Object.fromEntries([
        "verificationForm", "passwordCreationForm", "otpInput", "passwordInput",
        "confirmPasswordInput", "resendOtpButton", "verificationMessage",
        "verificationDescription"
    ].map((id) => [id, {
        value: id === "otpInput" ? "123456" : "",
        hidden: false,
        parentElement: { hidden: false },
        classList: { toggle() {} },
        addEventListener(type, handler) { this[type] = handler; },
        focus() {}
    }]));
    const requests = [];
    const context = {
        window: {
            location: { search: "?email=user%40example.com" },
            WaffleBerryApi: {
                ApiError: class ApiError extends Error {},
                apiRequest: async (...args) => {
                    requests.push(args);
                    return { authorization: "verification-token" };
                },
                storeAuthenticatedSession() {}
            }
        },
        document: { getElementById: (id) => elements[id] },
        URLSearchParams
    };
    vm.runInNewContext(read("js/verify-email.js"), context);
    await elements.verificationForm.submit({ preventDefault() {} });
    assert.deepEqual(JSON.parse(JSON.stringify(requests)), [["/verify-email", {
        method: "POST",
        authenticated: false,
        body: { email: "user@example.com", otp: "123456" }
    }]]);
});

test("login and completed registration share canonical session storage", () => {
    const api = read("js/api.js");
    const verify = read("js/verify-email.js");
    assert.match(api, /function storeAuthenticatedSession\(response\)/);
    assert.match(api, /async function authenticateUser[\s\S]*storeAuthenticatedSession\(response\)/);
    assert.match(api, /storeSession\(\s*response\.access_token,\s*response\.user\s*\)/);
    assert.equal((verify.match(/storeAuthenticatedSession\(/g) || []).length, 1);
});
