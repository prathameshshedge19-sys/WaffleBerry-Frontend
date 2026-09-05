import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const configSource = await readFile(new URL("../js/auth-config.js", import.meta.url), "utf8");
const apiSource = await readFile(new URL("../js/auth-api.js", import.meta.url), "utf8");
const routing = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));

for (const hostname of ["waffleberry.app", "www.waffleberry.app"]) {
  test(`${hostname}: login survives navigation with third-party cookies blocked`, async () => {
    const origin = `https://${hostname}`;
    let cookie = false;
    const storage = new Map();
    const calls = [];
    const loadPage = () => {
      const context = vm.createContext({
        window: {}, location: { hostname, protocol: "https:" },
        localStorage: {
          removeItem: key => storage.delete(key),
          setItem: (key, value) => storage.set(key, value),
        },
        fetch: async (path, options) => {
          const url = new URL(path, origin);
          const acceptsCookie = url.origin === origin && options.credentials === "include";
          calls.push(url.pathname);
          let status = 200;
          if (url.pathname.endsWith("/login")) cookie = acceptsCookie;
          if (url.pathname.endsWith("/refresh") && !(acceptsCookie && cookie)) status = 401;
          if (url.pathname.endsWith("/logout")) { cookie = false; status = 204; }
          if (url.pathname.endsWith("/me")) assert.equal(options.headers.Authorization, "Bearer test-token");
          return {
            status, ok: status < 400,
            text: async () => JSON.stringify(url.pathname.endsWith("/me")
              ? { id: 1 } : { access_token: "test-token", token_type: "bearer", user: { id: 1 } }),
          };
        },
      });
      vm.runInContext(configSource, context);
      vm.runInContext(apiSource, context);
      return context.window.LegaryaAuthApi;
    };
    await loadPage().authenticateUser("test@example.com", "test-password", true);
    assert.equal((await loadPage().ensureAuthenticated()).id, 1);
    assert.equal((await loadPage().ensureAuthenticated()).id, 1);
    await loadPage().logout();
    assert.equal(await loadPage().refreshSession(), false);
    assert.equal(storage.has("accessToken"), false);
    assert.ok(calls.includes("/api/v1/auth/refresh"));
    assert.ok(routing.rewrites.some(rule => rule.source === "/api/v1/:path*"
      && rule.destination === "https://89-167-14-211.sslip.io/api/v1/:path*"));
  });
}

test("localhost keeps its existing backend and gateway", () => {
  const context = vm.createContext({ window: {}, location: { hostname: "localhost", protocol: "http:" } });
  vm.runInContext(configSource, context);
  assert.equal(context.window.LEGARYA_AUTH_CONFIG.apiBaseUrl, "http://localhost:8100/api/v1");
  assert.equal(context.window.LEGARYA_AUTH_CONFIG.successUrl, "http://localhost:5600/gateway.html");
});
