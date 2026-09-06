"use strict";

((root, factory) => {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.LegaRyaPersonalityDashboard = api;
})(typeof window !== "undefined" ? window : null, (root) => {
  const STATES = new Set(["ready", "rebuilding", "stale", "unavailable", "failed"]);
  const EMPTY = "Rya is still learning how this person expressed themselves. Preserve more stories, values, habits, and familiar phrases to deepen their presence.";
  const UNAVAILABLE = "Personality & Presence isn't available right now. Your memories and chat are unaffected.";
  const REFRESHING = "Personality & Presence is refreshing from the latest memories...";
  const canManage = (role) => role === "owner" || role === "collaborator";

  function element(document, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function render(document, data, memories, onEvidence, onRefresh) {
    const section = element(document, "section", "personality-presence");
    section.setAttribute("aria-labelledby", "personalityPresenceHeading");
    const heading = element(document, "h3", "personality-presence-title", "Personality & Presence");
    heading.id = "personalityPresenceHeading";
    section.append(heading);
    if (data.status !== "ready") {
      const message = data.status === "loading" ? "Loading Personality & Presence..." : ["rebuilding", "stale"].includes(data.status) ? REFRESHING : UNAVAILABLE;
      const status = element(document, "p", "personality-presence-state", message);
      status.setAttribute("role", "status");
      section.append(status);
      if (data.status !== "loading") {
        const refresh = element(document, "button", "personality-presence-refresh", "Refresh");
        refresh.type = "button";
        refresh.addEventListener("click", onRefresh);
        section.append(refresh);
      }
      return section;
    }
    section.append(element(document, "p", "personality-presence-intro", "A reflection of what has been preserved, with the memories behind it."));

    function evidence(item) {
      const ids = item.supporting_memory_ids;
      const details = element(document, "details", "personality-evidence");
      const summary = element(document, "summary", "", `Supported by ${ids.length} preserved ${ids.length === 1 ? "memory" : "memories"}`);
      const links = element(document, "ul", "personality-evidence-links");
      ids.forEach((id) => {
        const reference = element(document, "li");
        const memory = memories.get(id);
        const label = memory?.canonical_text ? `View memory: ${memory.canonical_text.slice(0, 110)}` : `View preserved memory ${id}`;
        const button = element(document, "button", "personality-evidence-link", label);
        button.type = "button";
        button.addEventListener("click", () => {
          if (onEvidence(id) === false) summary.textContent = "Refresh the dashboard to view this memory.";
        });
        reference.append(button); links.append(reference);
      });
      details.append(summary, links);
      return details;
    }

    if (!data.observations.length) section.append(element(document, "p", "personality-presence-empty", EMPTY));
    const list = element(document, "div", "personality-observations");
    list.setAttribute("role", "list");
    data.observations.forEach((item) => {
      const row = element(document, "article", "personality-observation");
      row.setAttribute("role", "listitem");
      const meta = element(document, "div", "personality-observation-meta");
      meta.append(element(document, "span", "personality-dimension", item.dimension), element(document, "span", "personality-confidence", item.confidence));
      row.append(meta, element(document, "p", "personality-description", item.description));
      if (item.context && !item.description.toLowerCase().includes(item.context.toLowerCase())) row.append(element(document, "p", "personality-context", item.context));
      if (item.conflicting_accounts) row.append(element(document, "p", "personality-context", "Different preserved accounts need context; this observation is not used for styling."));
      row.append(evidence(item)); list.append(row);
    });
    section.append(list);
    const signatures = element(document, "section", "personality-signatures");
    signatures.append(element(document, "h4", "", "Signature expressions"));
    if (!data.signature_expressions.length) signatures.append(element(document, "p", "personality-context", "No verified familiar expressions have been preserved yet."));
    data.signature_expressions.forEach((item) => {
      const row = element(document, "div", "personality-expression");
      row.append(element(document, "q", "personality-expression-wording", item.expression));
      row.append(element(document, "p", "personality-context", `${item.context} · ${item.language}`));
      row.append(evidence(item)); signatures.append(row);
    });
    section.append(signatures, element(document, "p", "personality-presence-note", "To change this representation, edit the memories that support it."));
    return section;
  }

  function create(options) {
    const { document, dashboard, request, onEvidence = () => false } = options;
    const schedule = options.setTimeout || setTimeout;
    const cancel = options.clearTimeout || clearTimeout;
    let host = options.content;
    let generation = 0, requestSerial = 0, timer = null, abort = null, section = null;
    let legacyId = null, role = null, memories = new Map(), state = null, polls = 0;

    function stop() {
      if (timer !== null) cancel(timer);
      timer = null;
      abort?.abort(); abort = null;
    }
    function begin() {
      generation += 1; requestSerial += 1;
      stop(); section?.remove(); section = null;
      legacyId = null; role = null; state = null; memories = new Map(); polls = 0;
      return generation;
    }
    function draw() {
      if (!state || !canManage(role) || !host) return;
      const currentGeneration = generation;
      const next = render(document, state, memories,
        (id) => currentGeneration === generation && memories.has(id) ? onEvidence(id) : false,
        () => { if (currentGeneration === generation) { polls = 0; void refresh(); } });
      section?.remove(); section = next; host.append(section);
    }
    function mount(content) {
      host = content;
      if (section && canManage(role)) host.append(section);
    }
    function safePayload(payload, expectedId) {
      if (!payload || payload.legacy_id !== expectedId || !STATES.has(payload.status)) throw new Error("Invalid personality scope/state");
      if (payload.status !== "ready") return { status: payload.status, observations: [], signature_expressions: [] };
      if (!Array.isArray(payload.observations) || !Array.isArray(payload.signature_expressions)) throw new Error("Invalid personality data");
      for (const item of [...payload.observations, ...payload.signature_expressions]) {
        if (!Array.isArray(item.supporting_memory_ids) || !item.supporting_memory_ids.length || item.supporting_memory_ids.some((id) => !Number.isSafeInteger(id) || !memories.has(id))) {
          return { status: "stale", observations: [], signature_expressions: [] };
        }
      }
      return payload;
    }
    async function refresh() {
      if (!canManage(role) || !legacyId || dashboard?.hidden) return;
      stop();
      const token = generation, serial = ++requestSerial, expectedId = legacyId;
      abort = typeof AbortController === "function" ? new AbortController() : null;
      try {
        const payload = await request(`/legacies/${expectedId}/personality`, { method: "GET", signal: abort?.signal });
        if (token !== generation || serial !== requestSerial || legacyId !== expectedId) return;
        state = safePayload(payload, expectedId);
      } catch (_) {
        if (token !== generation || serial !== requestSerial) return;
        state = { status: "unavailable", observations: [], signature_expressions: [] };
      }
      draw();
      if (["rebuilding", "stale"].includes(state.status) && polls < 10) {
        polls += 1;
        timer = schedule(() => { timer = null; if (token === generation) void refresh(); }, 3000);
      }
    }
    function load(context, token) {
      if (token !== generation) return;
      if (!canManage(context.role) || !Number.isSafeInteger(context.legacyId) || context.legacyId <= 0 || !Array.isArray(context.memories)) { begin(); return; }
      legacyId = context.legacyId; role = context.role;
      memories = new Map(context.memories.map((memory) => [memory.id, memory]));
      state = { status: "loading", observations: [], signature_expressions: [] };
      draw();
      void refresh();
    }
    // Capture also covers non-bubbling events dispatched on document. No app
    // selection state is read or changed by this component.
    root?.addEventListener?.("legarya-legacy-change", begin, true);
    return { begin, load, mount, close: begin, refresh, destroy() { begin(); root?.removeEventListener?.("legarya-legacy-change", begin, true); } };
  }

  return { create, render, canManage };
});
