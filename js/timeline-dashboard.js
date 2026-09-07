"use strict";
((root) => {
  const entry = document.querySelector("#openTimeline");
  const dashboard = document.querySelector("#timelineDashboard");
  if (!entry || !dashboard || !root.LegaryaTimeline) return;
  const content = document.querySelector("#timelineContent");
  const status = document.querySelector("#timelineStatus");
  const close = document.querySelector("#closeTimeline");
  const backdrop = document.querySelector("#timelineBackdrop");
  let epoch = 0, opener = entry, controller = null, selected = null;
  const legacy = () => root.LegaryaWorkspace?.getActiveLegacy?.() || null;
  const owner = () => legacy()?.access_role === "owner";
  const el = (tag, text = "", cls = "") => { const node = document.createElement(tag); node.textContent = text; if (cls) node.className = cls; return node; };
  const precision = (event) => {
    if (event.date_label) return event.date_label;
    if (event.date_precision === "life_period") return "During a life period";
    if (event.date_precision === "unknown") return "Date unknown";
    if (event.date_start) return new Date(`${event.date_start}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: event.date_precision === "day" ? "long" : undefined, day: event.date_precision === "day" ? "numeric" : undefined });
    return "Date unknown";
  };
  const support = (event) => `${event.memory_count || 0} ${event.memory_count === 1 ? "family memory" : "family memories"} · ${event.source_count || 0} ${event.source_count === 1 ? "source" : "sources"}`;
  const setStatus = (message = "", error = false) => { status.textContent = message; status.classList.toggle("is-error", error); };
  const closePanel = () => { controller?.abort(); epoch++; dashboard.hidden = true; selected = null; content.replaceChildren(); setStatus(); opener?.focus(); };
  const dateGroup = (event) => event.date_start ? String(new Date(`${event.date_start}T00:00:00Z`).getUTCFullYear()) : "Date unknown";
  function card(event) {
    const article = el("article", "", "timeline-event"); article.tabIndex = 0; article.dataset.eventId = event.id;
    const date = el("p", precision(event), "timeline-event-date"); date.dataset.precision = event.date_precision; article.append(date, el("h3", event.title));
    if (event.description) article.append(el("p", event.description, "timeline-event-description"));
    if (event.place_label) article.append(el("p", `At ${event.place_label}`, "timeline-event-place"));
    const footer = el("p", support(event), "timeline-event-support"); article.append(footer);
    if (event.review_state === "conflict") { const conflict = el("p", "Date needs clarification · Two recollections are preserved.", "timeline-event-conflict"); conflict.setAttribute("role", "note"); article.append(conflict); }
    if (event.is_approximate) article.classList.add("is-approximate");
    article.addEventListener("click", () => detail(event.id)); article.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); detail(event.id); } });
    return article;
  }
  function render(events, gaps) {
    content.replaceChildren();
    if (!events.length) { content.append(el("div", "As you preserve memories, important moments can appear here. Family memories belong here even when there is no source file.", "timeline-empty")); if (gaps?.known_years?.length) content.append(el("p", "There are fewer preserved memories from some periods. You can return to them whenever you feel ready.", "timeline-gap")); return; }
    const groups = new Map(); events.forEach((event) => { const key = dateGroup(event); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(event); });
    groups.forEach((items, key) => { const section = el("section", "", "timeline-group"); section.append(el("h2", key)); items.forEach((event) => section.append(card(event))); content.append(section); });
    if (gaps?.known_years?.length) content.append(el("p", "There are fewer preserved memories from some periods. These are invitations to remember more, not missing proof.", "timeline-gap"));
  }
  async function refresh() {
    const current = legacy(); if (!current || !["owner", "collaborator"].includes(current.access_role)) return;
    controller?.abort(); controller = new AbortController(); const token = ++epoch; setStatus("Gathering the chronology…");
    try { const [events, gaps] = await Promise.all([root.LegaryaTimeline.list(current.id, { limit: 100 }, controller.signal), root.LegaryaTimeline.gaps(current.id, controller.signal)]); if (token !== epoch || legacy()?.id !== current.id) return; render(events || [], gaps || {}); setStatus(); }
    catch (error) { if (error.name !== "AbortError" && token === epoch) { content.replaceChildren(el("div", "The timeline could not be loaded. Please try again.", "timeline-empty")); setStatus("We could not open the timeline right now.", true); } }
  }
  async function detail(id) {
    const current = legacy(); const token = ++epoch; setStatus("Opening moment…");
    try { const event = await root.LegaryaTimeline.detail(current.id, id); if (token !== epoch || legacy()?.id !== current.id) return; selected = event; renderDetail(event); }
    catch (error) { if (token === epoch) setStatus("This moment is no longer available.", true); }
  }
  function renderDetail(event) {
    content.replaceChildren(); const back = el("button", "← Back to timeline", "timeline-back"); back.addEventListener("click", refresh); content.append(back);
    const article = el("article", "", "timeline-detail"); article.append(el("p", precision(event), "timeline-event-date"), el("h2", event.title)); if (event.description) article.append(el("p", event.description, "timeline-detail-description")); if (event.place_label) article.append(el("p", `At ${event.place_label}`, "timeline-event-place")); article.append(el("p", support(event), "timeline-event-support"));
    if (event.review_state === "conflict") { article.append(el("p", "Date needs clarification. Two recollections are preserved; no date has been silently chosen.", "timeline-event-conflict")); }
    if (event.source_count) article.append(el("p", "Source-backed support is additional to family memory.", "timeline-source-note")); else article.append(el("p", "Family memory · No source file is required.", "timeline-family-note"));
    if (owner()) { const actions = el("div", "", "timeline-actions"); if (event.review_state === "conflict") { const resolve = el("button", "Mark reviewed"); resolve.addEventListener("click", async () => { await root.LegaryaTimeline.review(legacy().id, event.id, "resolve"); await refresh(); }); actions.append(resolve); } const remove = el("button", "Remove from Timeline", "timeline-danger"); remove.addEventListener("click", async () => { if (!window.confirm("Remove this event from the timeline? Canonical memories, sources, and personality will remain.")) return; await root.LegaryaTimeline.remove(legacy().id, event.id); await refresh(); }); actions.append(remove); article.append(actions); }
    content.append(article);
  }
  function open() { const current = legacy(); if (!current || !["owner", "collaborator"].includes(current.access_role)) return; opener = document.activeElement || entry; dashboard.hidden = false; close.focus(); refresh(); }
  entry.addEventListener("click", open); close.addEventListener("click", closePanel); backdrop.addEventListener("click", closePanel); document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !dashboard.hidden) closePanel(); });
  const sync = () => { const current = legacy(); entry.hidden = !current || !["owner", "collaborator"].includes(current.access_role); if (dashboard.hidden) return; if (!entry.hidden) refresh(); else closePanel(); };
  root.addEventListener("legarya-legacy-change", sync); root.addEventListener("pagehide", closePanel); sync();
})(window);
