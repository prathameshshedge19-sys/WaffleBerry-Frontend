import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createDevAuth } from "../js/realtime-dev-auth.mjs";

const config = fs.readFileSync(new URL("../js/auth-config.js", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../js/auth-api.js", import.meta.url), "utf8");

function harness({ acceptCookie = true } = {}) {
  let cookie = false;
  const calls = [], storage = new Map();
  function page() {
    const states = [];
    const context = vm.createContext({ window: {}, location: { hostname: "127.0.0.1", protocol: "http:" },
      console: { warn() {} },
      localStorage: { removeItem: (key) => storage.delete(key), setItem: (key, value) => storage.set(key, value) },
      fetch: async (url, options) => {
        calls.push({ url, options });
        assert.ok(url.startsWith("http://127.0.0.1:8100/api/v1/"));
        assert.equal(options.credentials, "include");
        let status = 200, data;
        const session = { access_token: "test-token", token_type: "bearer", user: { id: 1, email: "l15-mic@example.com" } };
        if (url.endsWith("/login")) {
          if (JSON.parse(options.body).password !== "correct") { status = 401; data = { detail: "Invalid email or password." }; }
          else { cookie = acceptCookie; data = session; }
        } else if (url.endsWith("/refresh")) {
          if (cookie) data = session;
          else { status = 401; data = { detail: "Invalid or expired session." }; }
        } else {
          assert.equal(options.headers.Authorization, "Bearer test-token");
          data = url.endsWith("/me") ? session.user : { session_id: "test-session" };
        }
        return { status, ok: status < 400, text: async () => JSON.stringify(data) };
      },
    });
    vm.runInContext(config, context);
    vm.runInContext(source, context);
    const auth = context.window.LegaryaAuthApi;
    const dev = createDevAuth({ auth, onState: (state) => states.push(state) });
    return { auth, dev, states };
  }
  return { page, calls, storage };
}

test("fresh developer page requests sign-in without falsely claiming expiry", async () => {
  const h = harness(), page = h.page();
  await page.dev.ready;
  assert.equal(page.states.at(-1).state, "signed_out");
  assert.match(page.states.at(-1).message, /Sign in to the local test account/);
  assert.ok(!page.states.some((state) => /expired/i.test(state.message)));
  assert.equal(await page.dev.requireSession(), false);
  assert.equal(h.calls.length, 1, "signed-out controls do not start protected requests or microphone");
});

test("reproduces shared login 401 wording and fixes only the developer-page display", async () => {
  const h = harness(), page = h.page();
  await page.dev.ready;
  await assert.rejects(page.auth.authenticateUser("l15-mic@example.com", "wrong"), /Your session has expired/);
  assert.equal(await page.dev.login("l15-mic@example.com", "wrong"), false);
  assert.match(page.states.at(-1).message, /Sign-in failed/);
  assert.doesNotMatch(page.states.at(-1).message, /expired/i);
  assert.equal(page.states.at(-1).signedIn, false);
  assert.ok(h.calls.every(({ url }) => !url.endsWith("/me")), "no token was issued, so verification must not run");
});

test("login stores shared memory token before /me and realtime authorization", async () => {
  const h = harness(), page = h.page();
  await page.dev.ready;
  assert.equal(await page.dev.login(" l15-mic@example.com ", "correct"), true);
  assert.equal(page.states.at(-1).signedIn, true);
  assert.equal(h.storage.has("accessToken"), false);
  assert.equal(await page.dev.requireSession(), true);
  await page.auth.apiRequest("/realtime/sessions", { method: "POST", authenticated: true, body: { legacy_id: 1, mode: "rya" } });
  assert.deepEqual(h.calls.map(({ url }) => new URL(url).pathname), [
    "/api/v1/auth/refresh", "/api/v1/auth/login", "/api/v1/auth/me", "/api/v1/auth/me", "/api/v1/realtime/sessions",
  ]);
  assert.ok(!page.states.some((state) => /expired/i.test(state.message)));
});

test("fresh page instance restores using the shared refresh-cookie flow", async () => {
  const h = harness(), first = h.page();
  await first.dev.ready;
  await first.dev.login("l15-mic@example.com", "correct");
  const second = h.page();
  await second.dev.ready;
  assert.equal(second.states.at(-1).signedIn, true);
  assert.equal(h.storage.has("accessToken"), false);
  assert.deepEqual(h.calls.slice(-2).map(({ url }) => new URL(url).pathname), ["/api/v1/auth/refresh", "/api/v1/auth/me"]);
});

test("blocked or missing refresh cookie gives a clear sign-in prompt after reload", async () => {
  const h = harness({ acceptCookie: false }), first = h.page();
  await first.dev.ready;
  assert.equal(await first.dev.login("l15-mic@example.com", "correct"), true);
  const second = h.page(); await second.dev.ready;
  assert.equal(second.states.at(-1).signedIn, false);
  assert.doesNotMatch(second.states.at(-1).message, /expired/i);
});

test("login waits for restoration so a late failure cannot clear the new token", async () => {
  let finishRestore;
  const order = [], states = [];
  let checked = 0;
  const auth = {
    async ensureAuthenticated() {
      checked += 1;
      if (checked === 1) return new Promise((_, reject) => { finishRestore = () => { order.push("restore_failed"); reject({ status: 401 }); }; });
      order.push("verified"); return { email: "test@example.com" };
    },
    async authenticateUser() { order.push("login_stored"); },
  };
  const dev = createDevAuth({ auth, onState: (state) => states.push(state) });
  const login = dev.login("test@example.com", "password");
  assert.deepEqual(order, []);
  finishRestore(); assert.equal(await login, true);
  assert.deepEqual(order, ["restore_failed", "login_stored", "verified"]);
  assert.equal(states.at(-1).signedIn, true);
});

test("successful login response is not mistaken for verified session when /me fails", async () => {
  const states = [];
  const dev = createDevAuth({ auth: {
    async ensureAuthenticated() { throw { status: 401 }; },
    async authenticateUser() {},
  }, onState: (state) => states.push(state) });
  await dev.ready;
  assert.equal(await dev.login("test@example.com", "password"), false);
  assert.match(states.at(-1).message, /could not verify the new session/);
  assert.equal(states.at(-1).signedIn, false);
});

test("developer controls begin disabled and authentication uses shared client only", () => {
  const html = fs.readFileSync(new URL("../realtime-dev.html", import.meta.url), "utf8");
  for (const id of ["login", "start", "reconnect", "refresh"]) assert.match(html, new RegExp(`<button id="${id}" disabled>`));
  const helper = fs.readFileSync(new URL("../js/realtime-dev-auth.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(helper, /\bfetch\(|localStorage|document\.cookie|sessionStorage/);
  assert.match(html, /js\/auth-api\.js\?v=1\.5/);
});
