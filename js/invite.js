"use strict";
(() => {
  const { apiRequest, ApiError } = window.LegaryaAuthApi;
  const token = new URLSearchParams(location.search).get("token") || "";
  const title = document.querySelector("#inviteTitle"), copy = document.querySelector("#inviteCopy"), details = document.querySelector("#inviteDetails"), status = document.querySelector("#inviteStatus"), back = document.querySelector("#inviteBack"), accept = document.querySelector("#acceptInvite");
  const fail = (message) => { title.textContent = "Invitation unavailable"; copy.textContent = message; details.hidden = true; back.hidden = false; };
  async function preview() {
    if (!token) return fail("This invitation link is incomplete.");
    try {
      const data = await apiRequest(`/access/invites/${encodeURIComponent(token)}`, { authenticated: true });
      title.textContent = `Join ${data.subject_name}'s Legacy`; copy.textContent = data.role === "collaborator" ? "You were invited to help preserve and shape this Legacy." : "You were invited to privately speak with this Legacy in read-only mode.";
      document.querySelector("#inviteLegacy").textContent = data.subject_name; document.querySelector("#inviteOwner").textContent = data.owner_name; document.querySelector("#inviteRole").textContent = data.role === "collaborator" ? "Collaborator — build and edit" : "Viewer — talk, read only"; details.hidden = false;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { const next = `invite.html?token=${encodeURIComponent(token)}`; location.replace(`auth.html?mode=login&next=${encodeURIComponent(next)}`); return; }
      fail(error.message || "This invitation is invalid, expired, or has already been used.");
    }
  }
  accept.addEventListener("click", async () => { accept.disabled = true; status.textContent = "Accepting invitation…"; try { const data = await apiRequest(`/access/invites/${encodeURIComponent(token)}/accept`, { method: "POST", authenticated: true }); status.textContent = "Access granted. Opening your Legacy…"; location.replace(data.role === "viewer" ? `legacy-chat.html?legacy=${data.legacy_id}` : `chat.html?legacy=${data.legacy_id}`); } catch (error) { status.textContent = error.message || "The invitation could not be accepted."; accept.disabled = false; } });
  preview();
})();
