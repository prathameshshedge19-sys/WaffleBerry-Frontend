"use strict";
((root) => {
  const statuses = Object.freeze({ uploading: "Upload not finished", queued: "Uploaded · waiting for Rya", processing: "Rya is reviewing", ready: "Ready to review", partially_ready: "Review available", failed: "Needs attention", deleting: "Removing source", deleted: "Source removed" });
  const statusLabel = (source, candidates) => {
    if (["ready", "partially_ready"].includes(source.state) && candidates) {
      if (!candidates.length) return "No suggestions found";
      if (candidates.every((c) => c.review_state !== "pending")) return "Review complete";
    }
    return statuses[source.state] || "Checking status";
  };
  const busy = (source) => ["uploading", "queued", "processing", "deleting"].includes(source.state);
  const time = (ms) => { const seconds = Math.floor(Math.max(0, Number(ms) || 0) / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; };
  const locatorLabel = (locator = {}) => {
    if (locator.kind === "page_text") return `Page ${locator.page}`;
    if (["time_span", "video_audio"].includes(locator.kind)) return `${time(locator.start_ms)}–${time(locator.end_ms)}${locator.kind === "video_audio" ? " · audio from video" : ""}`;
    return ({ image: "Image observation", text_span: "Text excerpt", owner_edit: "Owner's edited wording", removed: "Original source no longer available" })[locator.kind] || "Source evidence";
  };
  const fileFormat = (file, formats) => {
    const extension = `.${file.name.split(".").pop().toLowerCase()}`;
    const format = formats.find((item) => item.extensions.includes(extension) && (!file.type || file.type === item.mime_type));
    if (!format) throw new Error("Choose a PDF, UTF-8 text file, JPEG, PNG or WebP image. Audio/video understanding is not available yet.");
    if (!file.size) throw new Error("This file is empty. Choose a file with content.");
    if (file.size > format.max_bytes) throw new Error(`This file is too large. The limit is ${Math.floor(format.max_bytes / 1048576)} MB.`);
    return format;
  };
  const errorMessage = (error) => {
    if (error?.name === "AbortError") return "Upload interrupted. You can continue it from this source.";
    if (error?.status >= 500) return "This service is temporarily unavailable. Please try again shortly.";
    return ({ 401: "Your session expired. Sign in again to continue.", 403: "You no longer have permission for this action.", 404: "This source is unavailable or Media & Sources is not enabled.", 409: "This item changed in another session. Check its latest state before trying again.", 410: "Original source no longer available.", 413: "This file exceeds the upload limit.", 415: "This file format is not supported." })[error?.status] || error?.message || "We couldn't complete that action. Please try again.";
  };
  function createClient(auth) {
    const json = (path, options = {}) => auth.apiRequest(path, { ...options, authenticated: true });
    const base = (id) => `/legacies/${Number(id)}/sources`;
    const review = (id) => `/media-review/legacies/${Number(id)}`;
    return Object.freeze({
      capabilities: (id, signal) => json(`${base(id)}/capabilities`, { signal }),
      list: (id, signal) => json(base(id), { signal }),
      source: (id, sourceId, signal) => json(`${base(id)}/${sourceId}`, { signal }),
      evidence: (id, sourceId, signal) => json(`${base(id)}/${sourceId}/evidence`, { signal }),
      candidates: (id, sourceId, signal) => json(`${review(id)}/sources/${sourceId}/candidates`, { signal }),
      reserve: (id, file, format, key, signal) => json(base(id), { method: "POST", signal, body: { filename: file.name, kind: format.kind, mime_type: format.mime_type, size_bytes: file.size, upload_request_key: key } }),
      upload: async (id, sourceId, file, signal) => (await auth.authenticatedMediaFetch(`${base(id)}/${sourceId}/content`, { method: "PUT", body: file, signal, headers: { "Content-Type": "application/octet-stream" } })).json(),
      original: async (id, sourceId, signal) => (await auth.authenticatedMediaFetch(`${base(id)}/${sourceId}/content`, { signal, cache: "no-store" })).blob(),
      retry: (id, sourceId, signal) => json(`${base(id)}/${sourceId}/retry`, { method: "POST", signal }),
      remove: (id, sourceId, signal) => json(`${base(id)}/${sourceId}`, { method: "DELETE", signal }),
      draft: (id, candidate, text, signal) => json(`${review(id)}/candidates/${candidate.id}/draft`, { method: "PUT", signal, body: { canonical_text: text, expected_version: candidate.version } }),
      decide: (id, candidate, action, key, signal) => json(`${review(id)}/candidates/${candidate.id}/review`, { method: "POST", signal, body: { action, expected_version: candidate.version, review_request_key: key } }),
    });
  }
  const api = Object.freeze({ createClient, statusLabel, busy, locatorLabel, fileFormat, errorMessage });
  if (typeof module !== "undefined") module.exports = api;
  else root.LegaryaMedia = api;
})(typeof window !== "undefined" ? window : this);
