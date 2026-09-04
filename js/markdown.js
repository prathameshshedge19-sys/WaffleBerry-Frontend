"use strict";

(() => {
  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const available = Boolean(window.marked?.parse && window.DOMPurify?.sanitize);
  const renderer = available ? new window.marked.Renderer() : null;

  if (renderer) {
    // Model-authored HTML is displayed as text; only Markdown creates elements.
    renderer.html = ({ text }) => escapeHtml(text);
  }

  const render = (container, source) => {
    const markdown = typeof source === "string" ? source : "";
    container.classList.add("markdown-content");

    if (!available) {
      container.textContent = markdown;
      return;
    }

    const parsed = window.marked.parse(markdown, {
      renderer,
      gfm: true,
      breaks: true,
      async: false,
    });
    const fragment = window.DOMPurify.sanitize(parsed, {
      RETURN_DOM_FRAGMENT: true,
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["style", "iframe", "object", "embed", "form", "input", "button"],
      FORBID_ATTR: ["style"],
    });

    fragment.querySelectorAll("a").forEach((anchor) => {
      anchor.rel = "noopener noreferrer";
    });
    container.replaceChildren(fragment);
  };

  window.LegaryaMarkdown = Object.freeze({ available, render });
})();
