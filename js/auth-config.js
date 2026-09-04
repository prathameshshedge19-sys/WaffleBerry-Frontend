"use strict";

(() => {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isLocal = localHosts.has(location.hostname);
  const localHostname = location.hostname === "::1" ? "[::1]" : location.hostname;

  window.LEGARYA_AUTH_CONFIG = Object.freeze({
    apiBaseUrl: isLocal
      ? `${location.protocol}//${localHostname}:8100/api/v1`
      : "https://89-167-14-211.sslip.io/api/v1",
    googleClientId: "480630043805-0vdcrq26tkag2iijmj78bi4kbh54cb67.apps.googleusercontent.com",
    successUrl: isLocal
      ? `${location.protocol}//${localHostname}:5600/gateway.html`
      : "/gateway.html",
  });
})();
