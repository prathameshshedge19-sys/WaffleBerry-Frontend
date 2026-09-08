"use strict";
((root) => {
  function create({ client, getLegacy, onChange = () => {}, uuid = () => crypto.randomUUID(), schedule = setTimeout, cancel = clearTimeout }) {
    let epoch = 0, selection = 0, abort = null, timer = null, polls = 0;
    const requests = new Map();
    const state = { open: false, legacy: null, capabilities: null, sources: [], selected: null, candidates: [], evidence: [], busy: new Set(), loading: false, message: "", error: false, upload: null };
    const emit = () => onChange(state);
    const current = (token) => state.open && epoch === token && getLegacy()?.id === state.legacy?.id;
    const owner = () => state.legacy?.access_role === "owner" && state.capabilities?.enabled;
    const reviewer = () => owner() && state.capabilities?.can_review;
    const stop = () => { cancel(timer); timer = null; };
    function close() { stop(); abort?.abort(); epoch++; selection++; state.open = false; state.sources = []; state.candidates = []; state.evidence = []; state.selected = null; state.upload = null; state.busy.clear(); requests.clear(); emit(); }
    function notice(message, error = false) { state.message = message; state.error = error; emit(); }
    async function refresh() {
      const token = epoch, id = state.legacy.id;
      const rows = await client.list(id, abort.signal);
      if (!current(token)) return;
      state.sources = rows;
      if (state.selected) await select(state.selected.id, false);
      emit(); armPoll();
    }
    function armPoll() {
      stop();
      if (!state.open || !state.sources.some((s) => root.LegaryaMedia.busy(s)) || polls >= 60) return;
      timer = schedule(async () => {
        timer = null; polls++;
        try { await refresh(); } catch (error) { if (error.name !== "AbortError") notice("Status updates paused. Refresh to check again.", true); }
      }, polls < 6 ? 5000 : 15000);
    }
    async function open(sourceId = null) {
      close();
      const legacy = getLegacy();
      if (!legacy || !["owner", "collaborator"].includes(legacy.access_role)) return false;
      state.legacy = { ...legacy }; state.open = true; state.loading = true; state.message = "Loading your sources…"; state.error = false; state.capabilities = null; polls = 0; abort = new AbortController();
      const token = epoch; emit();
      try {
        const capabilities = await client.capabilities(legacy.id, abort.signal);
        if (!current(token)) return false;
        state.capabilities = capabilities;
        if (!capabilities.enabled) { notice("Media & Sources is not available for this Legacy yet."); return false; }
        await refresh();
        if (!current(token)) return false;
        if (sourceId) await select(sourceId);
        notice(""); return true;
      } catch (error) { if (current(token)) notice(root.LegaryaMedia.errorMessage(error), true); return false; }
      finally { if (current(token)) { state.loading = false; emit(); } }
    }
    async function select(sourceId, loading = true) {
      const token = epoch, chosen = ++selection;
      const row = state.sources.find((s) => s.id === sourceId);
      if (!row || ["deleted", "deleting"].includes(row.state)) { state.selected = null; state.candidates = []; state.evidence = []; emit(); return; }
      const changed = state.selected?.id !== sourceId;
      state.selected = row;
      if (changed) { state.candidates = []; state.evidence = []; }
      if (loading) { state.message = "Opening source…"; emit(); }
      try {
        const [candidates, evidence] = await Promise.all([state.legacy.setup_status === "active" ? client.candidates(state.legacy.id, sourceId, abort.signal) : Promise.resolve([]), client.evidence(state.legacy.id, sourceId, abort.signal)]);
        if (!current(token) || chosen !== selection) return;
        state.candidates = candidates; state.evidence = evidence;
        if (loading) state.message = "";
        emit();
      } catch (error) {
        if (current(token) && chosen === selection) {
          if ([403, 404, 410].includes(error.status)) { state.selected = null; state.evidence = []; state.candidates = []; }
          notice(root.LegaryaMedia.errorMessage(error), true);
        }
      }
    }
    async function perform(key, action, success, privileged = false) {
      if (!state.open || state.busy.has(key) || (privileged && !owner())) return false;
      const token = epoch; state.busy.add(key); state.error = false; emit();
      try {
        await action(abort.signal);
        if (!current(token)) return false;
        await refresh();
        if (!current(token)) return false;
        notice(success); return true;
      } catch (error) {
        if (current(token)) {
          if ([403, 404, 409, 410].includes(error.status)) { try { await refresh(); } catch {} }
          notice(root.LegaryaMedia.errorMessage(error), true);
        }
        return false;
      } finally { if (current(token)) { state.busy.delete(key); emit(); } }
    }
    async function upload(file, resume = null) {
      if (!state.capabilities?.enabled || state.busy.has("upload")) return false;
      let format;
      try {
        format = root.LegaryaMedia.fileFormat(file, state.capabilities.formats);
        if (resume && (file.size !== resume.declared_size_bytes || file.name !== resume.original_filename)) throw new Error("Choose the original file with the same name and size to continue this upload.");
      } catch (error) { notice(error.message, true); return false; }
      const id = state.legacy.id;
      const pending = state.upload?.file === file ? state.upload : { file, key: uuid(), source: resume };
      state.upload = pending;
      return perform("upload", async (signal) => {
        notice(`Uploading ${file.name}…`);
        pending.source ||= await client.reserve(id, file, format, pending.key, signal);
        await client.upload(id, pending.source.id, file, signal);
        if (state.upload === pending) state.upload = null;
      }, "Uploaded. Rya will review the source; no memories have been saved.");
    }
    async function decide(candidate, action) {
      if (!reviewer()) return false;
      const key = `${candidate.id}:${candidate.version}:${action}`;
      if (!requests.has(key)) requests.set(key, uuid());
      return perform(candidate.id, (signal) => client.decide(state.legacy.id, candidate, action, requests.get(key), signal), action === "skip" ? "Suggestion skipped. Your source is unchanged." : "Memory preserved. It is available in Memories.", true);
    }
    return { state, open, close, select, refresh: async () => { polls = 0; try { await refresh(); notice(""); } catch (error) { notice(root.LegaryaMedia.errorMessage(error), true); } }, upload, decide, notice,
      draft: (candidate, text) => reviewer() ? perform(candidate.id, (signal) => client.draft(state.legacy.id, candidate, text, signal), "Check the edited wording below, then choose Preserve edited memory.", true) : false,
      remove: (source) => perform(source.id, (signal) => client.remove(state.legacy.id, source.id, signal), "Source removal requested. Preserved memories remain.", true),
      retry: (source) => perform(source.id, (signal) => client.retry(state.legacy.id, source.id, signal), "Processing queued again.", true),
      original: () => client.original(state.legacy.id, state.selected.id, abort.signal),
    };
  }

  function mount(document, auth, getLegacy) {
    const entry = document.querySelector("#openMediaSources");
    if (!entry) return;
    const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
    const button = (text, fn, cls = "") => { const n = el("button", text, cls); n.type = "button"; n.addEventListener("click", fn); return n; };
    const dialog = el("dialog", null, "media-panel"); dialog.setAttribute("aria-labelledby", "mediaTitle");
    const header = el("header", null, "media-header"); const titleWrap = el("div"); titleWrap.append(el("small", "A place for the pieces of a life"));
    const title = el("h2", "Media & Sources"); title.id = "mediaTitle"; titleWrap.append(title);
    const closeButton = button("×", () => panel.close(), "media-close"); closeButton.setAttribute("aria-label", "Close Media & Sources");
    header.append(titleWrap, closeButton);
    const status = el("p", null, "media-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const body = el("div", null, "media-body"); dialog.append(header, status, body); document.body.append(dialog);
    let opener = entry, blobUrl = null, preview = null, previewSource = null, resume = null, previewRequest = 0;
    const edits = new Map(); const confirmations = new Set();
    const revoke = () => { previewRequest++; if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = null; preview = null; previewSource = null; };
    const client = root.LegaryaMedia.createClient(auth);
    const panel = create({ client, getLegacy, onChange: render });
    function choose(source) { revoke(); edits.clear(); confirmations.clear(); panel.select(source.id); }
    async function original(download = false) {
      const source = panel.state.selected;
      if (!source) return;
      const id = source.id;
      const request = ++previewRequest;
      panel.notice("Opening original source…");
      try {
        const blob = await panel.original();
        if (request !== previewRequest || !panel.state.open || panel.state.selected?.id !== id) return;
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        blobUrl = URL.createObjectURL(blob); previewSource = id;
        if (!download && source.kind === "image") { preview = el("img", null, "media-original-image"); preview.src = blobUrl; preview.alt = `Original source: ${source.original_filename}`; }
        else if (!download && source.mime_type === "text/plain") { const text = await blob.text(); if (request !== previewRequest || !panel.state.open || panel.state.selected?.id !== id) return; preview = el("pre", text, "media-extracted"); }
        else { const a = el("a"); a.href = blobUrl; a.download = source.original_filename; document.body.append(a); a.click(); a.remove(); }
        panel.notice(download ? "Original downloaded." : "Original source opened.");
      } catch (error) { if (request === previewRequest && panel.state.open) panel.notice(root.LegaryaMedia.errorMessage(error), true); }
    }
    function evidenceBlock(items) {
      const block = el("details", null, "media-evidence"); block.append(el("summary", `Supporting evidence · ${items.length}`));
      items.forEach((item) => { const quote = el("blockquote"); quote.append(el("small", root.LegaryaMedia.locatorLabel(item.locator)), el("p", item.text || "Visual observation from this image; no identity is confirmed by appearance.")); block.append(quote); });
      return block;
    }
    function candidateCard(candidate, state) {
      const card = el("article", null, "media-candidate"); card.dataset.candidateId = candidate.id;
      const pending = candidate.review_state === "pending", privileged = state.legacy.access_role === "owner" && state.capabilities.can_review;
      card.append(el("small", pending ? "Rya suggestion · not saved" : ({ preserved: "Preserved memory", skipped: "Skipped", cancelled: "Source removed" })[candidate.review_state] || "Reviewed", "media-eyebrow"));
      card.append(el("p", candidate.proposal.canonical_text || "This source's extracted content has been removed.", "media-proposal"));
      if (candidate.proposal.uncertainty) card.append(el("p", candidate.proposal.uncertainty, "media-note"));
      card.append(evidenceBlock(candidate.evidence));
      if (!pending || !privileged) return card;
      const disabled = state.busy.has(candidate.id);
      const actions = el("div", null, "media-actions");
      const preserve = button("Preserve", () => panel.decide(candidate, "preserve"), "media-primary");
      const edit = button("Edit", () => { edits.set(candidate.id, candidate.review_draft?.canonical_text || candidate.proposal.canonical_text); render(state); body.querySelector("textarea")?.focus(); });
      const skip = button("Skip", () => panel.decide(candidate, "skip"));
      [preserve, edit, skip].forEach((n) => { n.disabled = disabled; actions.append(n); });
      if (edits.has(candidate.id)) {
        const form = el("form", null, "media-edit"); const label = el("label", "Your wording");
        const textarea = el("textarea"); textarea.value = edits.get(candidate.id); textarea.maxLength = 1200; textarea.minLength = 3; textarea.required = true; textarea.setAttribute("aria-label", "Edit suggested memory"); textarea.disabled = disabled;
        textarea.addEventListener("input", () => edits.set(candidate.id, textarea.value)); label.append(textarea);
        const prepare = button("Preview edited wording", () => {}); prepare.type = "submit"; prepare.disabled = disabled;
        form.append(label, el("p", "Your edit will be recorded as owner wording, not a quotation from the source.", "media-note"), prepare, button("Cancel edit", () => { edits.delete(candidate.id); render(state); }));
        form.addEventListener("submit", async (event) => { event.preventDefault(); if (await panel.draft(candidate, textarea.value.trim())) { edits.delete(candidate.id); render(panel.state); } }); card.append(form);
      } else {
        card.append(actions);
        if (candidate.review_draft) { const draft = el("section", null, "media-edit-preview"); draft.append(el("strong", "Edited wording · ready for your approval"), el("p", candidate.review_draft.canonical_text)); const confirm = button("Preserve edited memory", () => panel.decide(candidate, "edit_preserve"), "media-primary"); confirm.disabled = disabled; draft.append(confirm); card.append(draft); }
      }
      return card;
    }
    function render(state) {
      if (!state.open) { if (dialog.open) dialog.close(); revoke(); edits.clear(); confirmations.clear(); resume = null; body.replaceChildren(); status.textContent = ""; opener?.focus(); return; }
      if (!dialog.open) { dialog.showModal(); closeButton.focus(); }
      status.textContent = state.message; status.classList.toggle("is-error", state.error); body.replaceChildren();
      if (previewSource && previewSource !== state.selected?.id) revoke();
      if (state.loading && !state.capabilities) { body.append(el("p", "Gathering your sources…", "media-empty")); return; }
      if (!state.capabilities?.enabled) return;
      const toolbar = el("section", null, "media-upload");
      toolbar.append(el("p", "Photos, letters and documents can help tell a life story. Rya's suggestions become memories only when the owner preserves them."));
      if (state.legacy.access_role === "collaborator") toolbar.append(el("p", "You can see your own contributions. This Legacy's owner can read your uploads and reviews suggestions before preserving them.", "media-note"));
      const input = el("input"); input.type = "file"; input.accept = state.capabilities.formats.flatMap((f) => f.extensions).join(","); input.setAttribute("aria-label", resume ? "Select the original file to continue upload" : "Add a source file"); input.disabled = state.busy.has("upload");
      input.addEventListener("change", () => { if (input.files[0]) { panel.upload(input.files[0], resume); resume = null; } });
      toolbar.append(input, el("small", `PDF or UTF-8 text up to ${Math.floor(state.capabilities.formats.find((f) => f.kind === "document").max_bytes / 1048576)} MB · JPEG, PNG or WebP up to ${Math.floor(state.capabilities.formats.find((f) => f.kind === "image").max_bytes / 1048576)} MB`));
      toolbar.addEventListener("dragover", (event) => event.preventDefault()); toolbar.addEventListener("drop", (event) => { event.preventDefault(); if (event.dataTransfer.files.length !== 1) panel.notice("Add one file at a time so each source can finish safely.", true); else panel.upload(event.dataTransfer.files[0]); });
      if (state.upload && !state.busy.has("upload")) toolbar.append(button("Retry upload", () => panel.upload(state.upload.file)));
      toolbar.append(button("Refresh", () => panel.refresh())); body.append(toolbar);
      const layout = el("div", null, "media-layout"), library = el("section", null, "media-library"); library.setAttribute("aria-label", "Source library");
      const sources = state.sources.filter((s) => s.state !== "deleted");
      library.append(el("h3", `Your sources · ${sources.length}`));
      if (!sources.length) library.append(el("div", "Start with a letter, a favourite photograph or a note. Keep the original, explore its story, and choose what to preserve.", "media-empty"));
      sources.forEach((source) => {
        const card = button("", () => choose(source), "media-source"); card.disabled = source.state === "deleting";
        card.setAttribute("aria-pressed", String(state.selected?.id === source.id));
        card.append(el("span", ({ document: "▤", image: "▧", audio: "♫", video: "▷" })[source.kind], "media-type"), el("strong", source.original_filename), el("span", root.LegaryaMedia.statusLabel(source, state.selected?.id === source.id ? state.candidates : null), "media-state"));
        const date = new Date(source.created_at); card.append(el("small", `${source.uploader_name || "Contributor"} · ${Number.isNaN(date.valueOf()) ? "" : date.toLocaleDateString()}`)); library.append(card);
      }); layout.append(library);
      const detail = el("section", null, "media-detail"); detail.setAttribute("aria-label", "Source details"); layout.append(detail); body.append(layout);
      const source = state.selected;
      if (!source) { detail.append(el("p", "Choose a source to see its original, evidence and Rya's suggestions.", "media-empty")); return; }
      detail.append(el("h3", source.original_filename), el("p", root.LegaryaMedia.statusLabel(source, state.candidates), "media-state"));
      const sourceActions = el("div", null, "media-actions");
      if (source.safety_state === "clean") { sourceActions.append(button(source.kind === "image" || source.mime_type === "text/plain" ? "View original" : "Download original", () => original()), button("Download", () => original(true))); }
      if (source.state === "uploading") sourceActions.append(button("Continue upload", () => { resume = source; input.click(); }));
      if (state.legacy.access_role === "owner") {
        if (["failed", "partially_ready"].includes(source.state)) { const retry = button("Retry processing", () => panel.retry(source)); retry.disabled = state.busy.has(source.id); sourceActions.append(retry); }
        sourceActions.append(button("Delete source", () => { confirmations.add(source.id); render(state); }));
      }
      detail.append(sourceActions, el("p", "The original is kept as source material. Extracted text and suggestions are separate from the original.", "media-note"));
      if (confirmations.has(source.id)) { const confirmation = el("section", null, "media-confirm"); confirmation.append(el("strong", "Delete this source?"), el("p", "The original and extracted material will be removed. Already preserved memories remain, with a note that their original source is unavailable.")); const remove = button("Delete source and extracted material", () => panel.remove(source), "media-danger"); remove.disabled = state.busy.has(source.id); confirmation.append(button("Keep source", () => { confirmations.delete(source.id); render(state); }), remove); detail.append(confirmation); }
      if (preview) detail.append(preview);
      if (state.evidence.length) { const extracted = el("details", null, "media-extraction"); extracted.append(el("summary", "Extracted content · may contain errors")); state.evidence.forEach((item) => { if (item.text) extracted.append(el("small", root.LegaryaMedia.locatorLabel(item.locator)), el("p", item.text)); }); detail.append(extracted); }
      if (state.legacy.setup_status !== "active") { detail.append(el("p", "Your files are saved privately. You can view, download or delete them now. Memory suggestion review becomes available after identity setup with Rya.", "media-note")); return; }
      if (source.state === "failed") detail.append(el("p", "We couldn't finish reviewing this file. The original remains uploaded. The owner can retry processing.", "media-note"));
      detail.append(el("h3", "Rya's suggestions"), el("p", state.capabilities.coverage_note, "media-note"));
      if (!state.candidates.length) detail.append(el("p", ["ready", "partially_ready"].includes(source.state) ? "Rya didn't find any clear memories to suggest. You can still view and manage this source." : "Suggestions will appear here after processing.", "media-empty"));
      else {
        const counts = { preserved: 0, skipped: 0, pending: 0 }; state.candidates.forEach((c) => { if (c.review_state in counts) counts[c.review_state]++; });
        detail.append(el("p", counts.pending ? `${counts.pending} suggestions to review · ${counts.preserved} preserved` : `Review complete. ${counts.preserved} preserved, ${counts.skipped} skipped.`, "media-review-summary"));
        state.candidates.forEach((candidate) => detail.append(candidateCard(candidate, state)));
      }
    }
    entry.addEventListener("click", () => { opener = entry; panel.open(); });
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); panel.close(); });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) panel.close(); });
    const contextChanged = () => { const legacy = getLegacy(); entry.hidden = !legacy || !["owner", "collaborator"].includes(legacy.access_role); if (panel.state.open && (entry.hidden || legacy?.id !== panel.state.legacy?.id || legacy?.access_role !== panel.state.legacy?.access_role || legacy?.setup_status !== panel.state.legacy?.setup_status)) panel.close(); };
    root.addEventListener("legarya-legacy-change", contextChanged);
    root.addEventListener("pagehide", () => panel.close());
    document.addEventListener("visibilitychange", () => { if (document.hidden) panel.close(); });
    contextChanged();
    root.LegaryaMediaPanel = { open: (legacyId, sourceId, trigger) => { if (getLegacy()?.id !== legacyId) return; opener = trigger || entry; panel.open(sourceId); } };
    return panel;
  }
  const api = { create, mount };
  if (typeof module !== "undefined") module.exports = api;
  else { root.LegaryaMediaSources = api; mount(document, root.LegaryaAuthApi, () => root.LegaryaWorkspace?.getActiveLegacy()); }
})(typeof window !== "undefined" ? window : this);
