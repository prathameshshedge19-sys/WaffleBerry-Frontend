"use strict";

(() => {
  if (!new Set(["localhost", "127.0.0.1"]).has(location.hostname)) return;
  const errors = [];
  const originalError = console.error.bind(console);
  console.error = (...args) => {
    errors.push(args.map(String).join(" ").slice(0, 1200));
    originalError(...args);
  };
  addEventListener("error", (event) => errors.push(`${event.message} at ${event.filename}:${event.lineno}`));
  addEventListener("unhandledrejection", (event) => errors.push(`Unhandled: ${String(event.reason)}`));

  addEventListener("load", () => {
    const switchTest = new URLSearchParams(location.search).has("auth-switch-test");
    if (switchTest) {
      setTimeout(() => document.querySelector('[data-auth-mode="register"]')?.click(), 500);
    }
    setTimeout(() => {
      const selected = document.querySelector('[data-auth-mode][aria-selected="true"]');
      const panelBounds = document.querySelector(".auth-panel")?.getBoundingClientRect();
      const googleBounds = document.querySelector("#googleSignIn")?.getBoundingClientRect();
      const centerDelta = panelBounds && googleBounds
        ? Math.abs((panelBounds.left + panelBounds.width / 2) - (googleBounds.left + googleBounds.width / 2))
        : null;
      fetch("/client-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "legarya-auth",
          path: `${location.pathname}${location.search}`,
          selectedMode: selected?.dataset.authMode || null,
          fullNameVisible: !document.querySelector("#fullNameGroup")?.hidden,
          passwordVisible: !document.querySelector("#passwordGroup")?.hidden,
          googleRendered: Boolean(document.querySelector("#googleSignIn iframe")),
          viewport: [innerWidth, innerHeight],
          documentHeight: document.documentElement.scrollHeight,
          fitsViewport: document.documentElement.scrollHeight <= innerHeight + 2,
          googleCenterDelta: centerDelta === null ? null : Number(centerDelta.toFixed(2)),
          switchTest,
          errors,
        }),
      }).catch(() => {});
    }, switchTest ? 1300 : 2200);
  });
})();
