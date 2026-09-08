"use strict";
((root) => {
  const api = root.LegaryaAuthApi;
  const q = (id, params = {}) => new URLSearchParams({ legacy_id: id, ...params }).toString();
  const request = (path, options = {}) => api.apiRequest(path, { authenticated: true, ...options });
  const id = (legacy, story) => `/stories/${encodeURIComponent(story)}?${q(legacy)}`;
  root.LegaryaStories = Object.freeze({
    list: (legacy, signal) => request(`/stories?${q(legacy)}`, { signal }),
    published: (legacy, signal) => request(`/stories/published?${q(legacy)}`, { signal }),
    detail: (legacy, story, signal) => request(id(legacy, story), { signal }),
    create: (legacy, body, signal) => request(`/stories?${q(legacy)}`, { method: "POST", body, signal }),
    generate: (legacy, story, requestKey, signal) => request(`${id(legacy, story).replace(/\?/, "/generate?")}`, { method: "POST", body: { request_key: requestKey }, signal }),
    edit: (legacy, story, chapter, body, signal) => request(`${id(legacy, story).replace(/\?/, `/chapters/${encodeURIComponent(chapter)}?`)}`, { method: "PATCH", body, signal }),
    publish: (legacy, story, published, signal) => request(`${id(legacy, story).replace(/\?/, "/publish?")}`, { method: "POST", body: { published }, signal }),
    archive: (legacy, story, signal) => request(`${id(legacy, story).replace(/\?/, "/archive?")}`, { method: "POST", signal }),
    provenance: (legacy, story, signal) => request(`${id(legacy, story).replace(/\?/, "/provenance?")}`, { signal }),
  });
})(window);
