"use strict";
(() => {
  const { apiRequest } = window.LegaryaAuthApi;
  const $ = (value) => document.querySelector(value);
  const openButton = $("#openCollaborators"), panel = $("#collaboratorPanel"), status = $("#collaboratorPanelStatus");
  const memberLists = { collaborator: $("#collaboratorList"), viewer: $("#accessViewerList") };
  let legacyId = null, state = null;
  const say = (text = "", error = false) => { status.textContent = text; status.classList.toggle("is-error", error); };
  const empty = (text) => { const p = document.createElement("p"); p.className = "collaborator-empty"; p.textContent = text; return p; };
  const date = (value) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));

  function renderMembers(role, members) {
    const list = memberLists[role]; list.replaceChildren();
    if (!members.length) return list.append(empty(`No ${role === "viewer" ? "viewers" : "collaborators"} yet.`));
    members.forEach((member) => {
      const row = document.createElement("article"); row.className = "collaborator-row";
      const identity = document.createElement("div"), name = document.createElement("strong"), meta = document.createElement("small");
      name.textContent = member.full_name; meta.textContent = `${member.email} · ${member.status === "active" ? "Active" : "Access revoked"} · Joined ${date(member.joined_at)}`; identity.append(name, meta);
      const button = document.createElement("button"); button.type = "button"; button.textContent = member.status === "active" ? "Revoke" : "Restore";
      button.className = member.status === "active" ? "collaborator-remove" : "collaborator-restore";
      button.addEventListener("click", async () => {
        const action = member.status === "active" ? "revoke" : "restore";
        if (action === "revoke" && !confirm(`Revoke ${member.full_name}'s ${role} access? Existing conversations and contributions will remain.`)) return;
        button.disabled = true; say(`${action === "revoke" ? "Revoking" : "Restoring"} access…`);
        try { await apiRequest(`/access/legacies/${legacyId}/members/${role}/${member.membership_id || member.access_id}/${action}`, { method: "POST", authenticated: true }); await load(); say(action === "revoke" ? "Access revoked. Existing history remains preserved." : "Access restored."); }
        catch (error) { say(error.message || "Access could not be updated.", true); button.disabled = false; }
      });
      row.append(identity, button); list.append(row);
    });
  }

  function renderCodes() {
    ["collaborator", "viewer"].forEach((role) => {
      const code = state.codes[role], wrap = $(`[data-code-role="${role}"]`), value = $(role === "viewer" ? "#viewerCodeValue" : "#collaboratorCodeValue");
      value.textContent = code.code || code.hint || "Not generated"; value.classList.toggle("is-disabled", !code.enabled);
      wrap.querySelector('[data-code-action="copy"]').disabled = !code.code;
      wrap.querySelector('[data-code-action="regenerate"]').textContent = code.code || code.hint ? "Regenerate" : "Generate";
      wrap.querySelector('[data-code-action="disable"]').hidden = !code.enabled;
      wrap.querySelector('[data-code-action="enable"]').hidden = code.enabled || !code.hint;
    });
  }

  function renderInvites() {
    const list = $("#accessInviteList"); list.replaceChildren();
    if (!state.pending_invites.length) return list.append(empty("No pending invitations."));
    state.pending_invites.forEach((invite) => {
      const row = document.createElement("article"); row.className = "collaborator-row";
      const copy = document.createElement("div"), email = document.createElement("strong"), meta = document.createElement("small"), button = document.createElement("button");
      email.textContent = invite.email; meta.textContent = `${invite.role} · expires ${date(invite.expires_at)}`; copy.append(email, meta);
      button.type = "button"; button.textContent = "Revoke"; button.className = "collaborator-remove";
      button.addEventListener("click", async () => { if (!confirm("Revoke this pending invitation?")) return; try { await apiRequest(`/access/legacies/${legacyId}/invites/${invite.id}`, { method: "DELETE", authenticated: true }); await load(); say("Invitation revoked."); } catch (error) { say(error.message, true); } });
      row.append(copy, button); list.append(row);
    });
  }

  function renderEvents() {
    const list = $("#accessEventList"); list.replaceChildren();
    if (!state.events.length) return list.append(empty("Access changes will appear here."));
    state.events.forEach((event) => { const row = document.createElement("div"), when = document.createElement("small"); row.className = "access-event-row"; row.append(document.createTextNode(event.event_type.replaceAll("_", " "))); when.textContent = `${event.actor_name || "System"} · ${date(event.created_at)}`; row.append(when); list.append(row); });
  }

  function render(data) {
    state = data; $("#accessOwner").textContent = `${data.owner.full_name} · ${data.owner.email}`;
    $("#accessCollaboratorCount").textContent = data.counts.collaborators; $("#accessViewerCount").textContent = data.counts.viewers;
    renderCodes(); renderMembers("collaborator", data.collaborators); renderMembers("viewer", data.viewers); renderInvites(); renderEvents();
  }
  async function load() { render(await apiRequest(`/access/legacies/${legacyId}`, { authenticated: true })); }
  function close() { panel.hidden = true; document.body.classList.remove("memory-dashboard-open"); openButton.focus(); }
  openButton.addEventListener("click", async () => { legacyId = window.LegaryaWorkspace?.getActiveLegacy()?.id; if (!legacyId) return; panel.hidden = false; document.body.classList.add("memory-dashboard-open"); $("#closeCollaborators").focus(); say("Loading access…"); try { await load(); say(); } catch (error) { say(error.message || "Access could not be loaded.", true); } });
  $("#closeCollaborators").addEventListener("click", close); $("#collaboratorPanelBackdrop").addEventListener("click", close);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !panel.hidden) close(); });
  $("#accessInviteForm").addEventListener("submit", async (event) => { event.preventDefault(); const email = $("#accessInviteEmail").value.trim(), role = $("#accessInviteRole").value; say("Sending private invitation…"); try { await apiRequest(`/access/legacies/${legacyId}/invites`, { method: "POST", authenticated: true, body: { email, role } }); event.target.reset(); await load(); say("Invitation sent. The link is private, single-use, and expires in 7 days."); } catch (error) { say(error.message || "Invitation could not be sent.", true); } });
  document.querySelectorAll("[data-code-role]").forEach((wrap) => wrap.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-code-action]"); if (!button) return; const role = wrap.dataset.codeRole, action = button.dataset.codeAction, code = state.codes[role];
    if (action === "copy") { try { await navigator.clipboard.writeText(code.code); say(`${role === "viewer" ? "Legacy" : "Collaborator"} code copied.`); } catch { say("Copy was blocked. Select and copy the code manually.", true); } return; }
    if (action === "regenerate" && code.hint && !confirm("Regenerate this code? The previous code will stop working, while everyone with existing access keeps it.")) return;
    if (action === "disable" && !confirm("Disable new code joins? Everyone with existing access will keep it.")) return;
    button.disabled = true; say(`${action === "disable" ? "Disabling" : action === "enable" ? "Enabling" : "Generating"} code…`);
    try { if (action === "disable") await apiRequest(`/access/legacies/${legacyId}/codes/${role}`, { method: "DELETE", authenticated: true }); else await apiRequest(`/access/legacies/${legacyId}/codes/${role}/${action}`, { method: "POST", authenticated: true }); await load(); say(action === "disable" ? "New joins disabled. Existing access remains active." : "Code is ready."); } catch (error) { say(error.message || "Code could not be updated.", true); } finally { button.disabled = false; }
  }));
})();
