"use strict";
(() => {
  const { apiRequest } = window.LegaryaAuthApi;
  const openButton = document.querySelector("#openLegacyAccess");
  const panel = document.querySelector("#legacyAccessPanel");
  const closeButton = document.querySelector("#closeLegacyAccess");
  const codeValue = document.querySelector("#legacyCodeValue");
  const copyButton = document.querySelector("#copyLegacyCode");
  const generateButton = document.querySelector("#regenerateLegacyCode");
  const disableButton = document.querySelector("#disableLegacyCode");
  const viewerList = document.querySelector("#legacyViewerList");
  const status = document.querySelector("#legacyAccessStatus");
  let legacyId = null;
  let code = null;
  const setStatus = (text = "", error = false) => { status.textContent = text; status.classList.toggle("is-error", error); };
  const close = () => { panel.hidden = true; document.body.classList.remove("memory-dashboard-open"); openButton.focus(); };
  const render = (data) => {
    code = data.code; codeValue.textContent = data.code || data.code_hint || "Not generated";
    codeValue.classList.toggle("is-disabled", !data.code_enabled); copyButton.disabled = !data.code;
    generateButton.textContent = data.code_enabled ? "Regenerate" : "Generate code"; disableButton.hidden = !data.code_enabled;
    viewerList.replaceChildren();
    if (!data.viewers.length) { const empty = document.createElement("p"); empty.className = "collaborator-empty"; empty.textContent = "No one has opened this Legacy yet."; viewerList.append(empty); return; }
    data.viewers.forEach((viewer) => {
      const row = document.createElement("article"); row.className = "collaborator-row";
      const copy = document.createElement("div"); const name = document.createElement("strong"); name.textContent = viewer.full_name;
      const meta = document.createElement("small"); meta.textContent = `Read-only access · Joined ${new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(new Date(viewer.joined_at))}`;
      copy.append(name, meta); row.append(copy); viewerList.append(row);
    });
  };
  async function load() { const data = await apiRequest(`/legacy-access/legacies/${legacyId}`, { authenticated:true }); render(data); }
  openButton.addEventListener("click", async () => {
    legacyId = window.LegaryaWorkspace?.getActiveLegacy()?.id; if (!legacyId) return;
    panel.hidden = false; document.body.classList.add("memory-dashboard-open"); closeButton.focus(); setStatus("Loading Legacy access…");
    try { await load(); setStatus(); } catch (error) { setStatus(error.message || "Legacy access could not be loaded.", true); }
  });
  copyButton.addEventListener("click", async () => { if (!code) return; try { await navigator.clipboard.writeText(code); setStatus("Legacy code copied."); } catch { setStatus("Copy was blocked. Select the code and copy it manually.", true); } });
  generateButton.addEventListener("click", async () => {
    if (code && !confirm("Regenerating this Legacy code will stop new access through the old code. Existing viewers will keep access.")) return;
    generateButton.disabled=true; setStatus(code ? "Regenerating Legacy code…" : "Generating Legacy code…");
    try { render(await apiRequest(`/legacy-access/legacies/${legacyId}/code`,{method:"POST",authenticated:true})); setStatus("Legacy code is ready."); } catch(error){setStatus(error.message||"Unable to generate a Legacy code.",true)} finally{generateButton.disabled=false}
  });
  disableButton.addEventListener("click", async () => {
    if (!confirm("Disable new access through this Legacy code? Existing viewers will keep their read-only access.")) return;
    try { await apiRequest(`/legacy-access/legacies/${legacyId}/code`,{method:"DELETE",authenticated:true}); await load(); setStatus("New viewer joins are disabled. Existing viewers still have access."); } catch(error){setStatus(error.message||"Unable to disable this code.",true)}
  });
  closeButton.addEventListener("click",close); document.querySelector("#legacyAccessBackdrop").addEventListener("click",close);
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!panel.hidden)close()});
})();
