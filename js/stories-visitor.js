"use strict";
(() => {
  const button = document.querySelector("#openVisitorStories"), panel = document.querySelector("#visitorStoriesPanel");
  if (!button || !panel || !window.LegaryaStories) return;
  const content = document.querySelector("#visitorStoriesContent"), close = document.querySelector("#closeVisitorStories"), legacyId = Number(new URLSearchParams(location.search).get("legacy"));
  const text = (tag, value, cls = "") => { const node = document.createElement(tag); node.textContent = value; if (cls) node.className = cls; return node; };
  async function open() { panel.hidden = false; content.replaceChildren(text("p", "Loading published Stories…", "story-meta")); try { const stories = await window.LegaryaStories.published(legacyId); content.replaceChildren(); if (!stories.length) { content.append(text("div", "Published Stories will appear here when this Legacy’s owner chooses to share them.", "story-empty")); return; } stories.forEach((story) => { const article = text("article", "", "story-chapter"); article.append(text("p", story.title, "story-eyebrow")); (story.current_version?.chapters || []).forEach((chapter) => { article.append(text("h4", chapter.title), text("div", chapter.narrative_text, "story-narrative")); }); content.append(article); }); } catch { content.replaceChildren(text("div", "Published Stories are not available right now.", "story-empty")); } close.focus(); }
  button.addEventListener("click", open); close.addEventListener("click", () => { panel.hidden = true; button.focus(); });
})();
