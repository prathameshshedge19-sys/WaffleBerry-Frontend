"use strict";
(() => {
  const { apiRequest, ApiError } = window.LegaryaAuthApi;
  const token = new URLSearchParams(location.search).get("token") || "";
  let destination = null;
  const chatDestination = data => {
    if (!Number.isInteger(data.legacy_id) || data.legacy_id < 1 || !["viewer", "collaborator"].includes(data.role)) throw new Error("The invitation returned an invalid destination. Please try again.");
    return `${data.role === "viewer" ? "legacy-chat" : "chat"}.html?legacy=${data.legacy_id}`;
  };
  const title = document.querySelector("#inviteTitle"), copy = document.querySelector("#inviteCopy"), details = document.querySelector("#inviteDetails"), status = document.querySelector("#inviteStatus"), back = document.querySelector("#inviteBack"), accept = document.querySelector("#acceptInvite");
  const fail = (message) => { title.textContent = "Invitation unavailable"; copy.textContent = message; details.hidden = true; back.hidden = false; };
  async function preview() {
    if (!token) return fail("This invitation link is incomplete.");
    try {
      const data = await apiRequest(`/access/invites/${encodeURIComponent(token)}`, { authenticated: true });
      if (data.status === "accepted") {
        destination = chatDestination(data);
        accept.textContent = data.role === "viewer" ? "Open Legacy chat" : "Open Rya workspace";
        status.textContent = "You already accepted this invitation. Your access is ready.";
      }
      title.textContent = `Join ${data.subject_name}'s Legacy`; copy.textContent = data.role === "collaborator" ? "You were invited to help preserve and shape this Legacy." : "You were invited to privately speak with this Legacy in read-only mode.";
      document.querySelector("#inviteLegacy").textContent = data.subject_name; document.querySelector("#inviteOwner").textContent = data.owner_name; document.querySelector("#inviteRole").textContent = data.role === "collaborator" ? "Collaborator — build and edit" : "Viewer — talk, read only"; details.hidden = false;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { const next = `invite.html?token=${encodeURIComponent(token)}`; location.replace(`auth.html?mode=login&next=${encodeURIComponent(next)}`); return; }
      fail(error.message || "This invitation is invalid, expired, or has already been used.");
    }
  }
  accept.addEventListener("click", async () => {
    accept.disabled = true;
    try {
      if (!destination) {
        status.textContent = "Accepting invitation…";
        const data = await apiRequest(`/access/invites/${encodeURIComponent(token)}/accept`, { method: "POST", authenticated: true });
        destination = chatDestination(data);
      }
      status.textContent = "Access granted. Opening your Legacy…";
      // Keep a normal link available if navigation is interrupted.
      back.href = destination; back.textContent = "Open your Legacy"; back.hidden = false;
      location.replace(destination);
    } catch (error) { status.textContent = error.message || "The invitation could not be accepted. Reopen this email to check your access."; accept.disabled = false; }
  });
  preview();
})();
