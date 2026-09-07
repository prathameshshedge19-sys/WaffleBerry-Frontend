"use strict";
((root) => {
  const api = root.LegaryaAuthApi;
  const query = (legacyId, params = {}) => new URLSearchParams({ legacy_id: legacyId, ...params }).toString();
  const request = (path, options = {}) => api.apiRequest(path, { authenticated: true, ...options });
  root.LegaryaTimeline = Object.freeze({
    list: (legacyId, params, signal) => request(`/timeline?${query(legacyId, params)}`, { signal }),
    detail: (legacyId, eventId, signal) => request(`/timeline/${encodeURIComponent(eventId)}?${query(legacyId)}`, { signal }),
    gaps: (legacyId, signal) => request(`/timeline/gaps?${query(legacyId)}`, { signal }),
    patch: (legacyId, eventId, body, signal) => request(`/timeline/${encodeURIComponent(eventId)}?${query(legacyId)}`, { method: "PATCH", body, signal }),
    review: (legacyId, eventId, action, signal) => request(`/timeline/${encodeURIComponent(eventId)}/review?${query(legacyId)}`, { method: "POST", body: { action }, signal }),
    remove: (legacyId, eventId, signal) => request(`/timeline/${encodeURIComponent(eventId)}?${query(legacyId)}`, { method: "DELETE", signal }),
  });
})(window);
