"use strict";
(() => {
  const { apiRequest } = window.LegaryaAuthApi;
  const openButton = document.querySelector("#openCollaborators");
  const panel = document.querySelector("#collaboratorPanel");
  const closeButton = document.querySelector("#closeCollaborators");
  const backdrop = document.querySelector("#collaboratorPanelBackdrop");
  const codeValue = document.querySelector("#collaboratorCodeValue");
  const copyButton = document.querySelector("#copyCollaboratorCode");
  const regenerateButton = document.querySelector("#regenerateCollaboratorCode");
  const disableButton = document.querySelector("#disableCollaboratorCode");
  const list = document.querySelector("#collaboratorList");
  const status = document.querySelector("#collaboratorPanelStatus");
  let legacyId = null;
  let currentCode = null;

  const setStatus = (text = "", error = false) => { status.textContent = text; status.classList.toggle("is-error", error); };
  const close = () => { panel.hidden = true; document.body.classList.remove("memory-dashboard-open"); openButton.focus(); };
  const render = (data) => {
    currentCode = data.code;
    codeValue.textContent = data.code || data.code_hint || "Not generated";
    codeValue.classList.toggle("is-disabled", !data.code_enabled);
    copyButton.disabled = !data.code;
    regenerateButton.textContent = data.code_enabled ? "Regenerate" : "Generate code";
    disableButton.hidden = !data.code_enabled;
    list.replaceChildren();
    if (!data.collaborators.length) {
      const empty = document.createElement("p"); empty.className = "collaborator-empty"; empty.textContent = "No collaborators yet."; list.append(empty); return;
    }
    data.collaborators.forEach((member) => {
      const row = document.createElement("article"); row.className = "collaborator-row";
      const identity = document.createElement("div");
      const name = document.createElement("strong"); name.textContent = member.full_name;
      const joined = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(member.joined_at));
      const meta = document.createElement("small"); meta.textContent = `${member.status === "active" ? "Active" : "Access revoked"} · Joined ${joined}`;
      identity.append(name, meta);
      const action = document.createElement("button"); action.type = "button"; action.textContent = member.status === "active" ? "Remove" : "Restore";
      action.className = member.status === "active" ? "collaborator-remove" : "collaborator-restore";
      action.addEventListener("click", async () => {
        if (member.status === "active" && !confirm(`Remove ${member.full_name}'s access? Their existing contributions will remain.`)) return;
        action.disabled = true; setStatus(member.status === "active" ? "Removing collaborator…" : "Restoring access…");
        try {
          if (member.status === "active") await apiRequest(`/collaborations/legacies/${legacyId}/members/${member.membership_id}`, { method: "DELETE", authenticated: true });
          else await apiRequest(`/collaborations/legacies/${legacyId}/members/${member.membership_id}/restore`, { method: "POST", authenticated: true });
          await load(); setStatus(member.status === "active" ? "Collaborator access removed. Historical contributions remain." : "Collaboration access restored.");
        } catch (error) { action.disabled = false; setStatus(error.message || "Unable to update collaborator access.", true); }
      });
      row.append(identity, action); list.append(row);
    });
  };
  async function load() { const data = await apiRequest(`/collaborations/legacies/${legacyId}`, { authenticated: true }); render(data); return data; }
  openButton.addEventListener("click", async () => {
    legacyId = window.LegaryaWorkspace?.getActiveLegacy()?.id;
    if (!legacyId) return;
    panel.hidden = false; document.body.classList.add("memory-dashboard-open"); closeButton.focus(); setStatus("Loading collaborators…");
    try { await load(); setStatus(); } catch (error) { setStatus(error.message || "Collaborators could not be loaded.", true); }
  });
  copyButton.addEventListener("click", async () => {
    if (!currentCode) return;
    try { await navigator.clipboard.writeText(currentCode); setStatus("Collaborator code copied."); }
    catch { setStatus("Copy was blocked. Select the code and copy it manually.", true); }
  });
  regenerateButton.addEventListener("click", async () => {
    if (currentCode && !confirm("Regenerating this code will make the previous code stop working. Existing collaborators will keep access.")) return;
    regenerateButton.disabled = true; setStatus(currentCode ? "Regenerating code…" : "Generating code…");
    try { render(await apiRequest(`/collaborations/legacies/${legacyId}/code`, { method: "POST", authenticated: true })); setStatus("Collaborator code is ready."); }
    catch (error) { setStatus(error.message || "Unable to generate a code.", true); }
    finally { regenerateButton.disabled = false; }
  });
  disableButton.addEventListener("click", async () => {
    if (!confirm("Disable this code? Existing collaborators will keep access.")) return;
    try { await apiRequest(`/collaborations/legacies/${legacyId}/code`, { method: "DELETE", authenticated: true }); await load(); setStatus("New joins are disabled. Existing collaborators still have access."); }
    catch (error) { setStatus(error.message || "Unable to disable the code.", true); }
  });
  closeButton.addEventListener("click", close); backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !panel.hidden) close(); });
})();
