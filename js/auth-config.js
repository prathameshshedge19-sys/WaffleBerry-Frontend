"use strict";

(() => {
  const runtime = window.LEGARYA_RUNTIME_CONFIG;
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isBundledAndroid = runtime?.clientPlatform === "android";
  const isLocal = localHosts.has(location.hostname) && !isBundledAndroid;
  const localHostname = location.hostname === "::1" ? "[::1]" : location.hostname;

  window.LEGARYA_AUTH_CONFIG = Object.freeze({
    apiBaseUrl: isBundledAndroid
      ? runtime.apiBaseUrl
      : isLocal
      ? `${location.protocol}//${localHostname}:8100/api/v1`
      : "/api/v1",
    mediaBaseUrl: isBundledAndroid
      ? runtime.mediaBaseUrl
      : isLocal
      ? `${location.protocol}//${localHostname}:8100/api/v1`
      : "https://89-167-14-211.sslip.io/api/v1",
    wssUrl: isBundledAndroid ? runtime.wssUrl : null,
    clientPlatform: runtime?.clientPlatform || "web",
    clientVersion: runtime?.clientVersion || null,
    frontendSha: runtime?.frontendSha || null,
    googleClientId: "480630043805-0vdcrq26tkag2iijmj78bi4kbh54cb67.apps.googleusercontent.com",
    successUrl: isBundledAndroid
      ? "/gateway.html"
      : isLocal
      ? `${location.protocol}//${localHostname}:5600/gateway.html`
      : "/gateway.html",
  });
})();
