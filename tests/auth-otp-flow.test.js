"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

test("login and completed registration share canonical session storage", () => {
    const api = read("js/api.js");
    const verify = read("js/verify-email.js");
    assert.match(api, /function storeAuthenticatedSession\(response\)/);
    assert.match(api, /async function authenticateUser[\s\S]*storeAuthenticatedSession\(response\)/);
    assert.match(api, /storeSession\(\s*response\.access_token,\s*response\.user\s*\)/);
    assert.equal((verify.match(/storeAuthenticatedSession\(/g) || []).length, 1);
});
