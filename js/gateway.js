"use strict";
(() => {
  const { apiRequest, ensureAuthenticated, logout } = window.LegaryaAuthApi;
  const dialog = document.querySelector("#joinDialog");
  const form = document.querySelector("#joinForm");
  const codeInput = document.querySelector("#collaboratorCode");
  const codeStep = document.querySelector("#codeStep");
  const confirmStep = document.querySelector("#confirmStep");
  const status = document.querySelector("#joinStatus");
  let code = "";
  const legacyDialog = document.querySelector("#legacyJoinDialog");
  const legacyForm = document.querySelector("#legacyJoinForm");
  const legacyCodeInput = document.querySelector("#legacyCode");
  const legacyCodeStep = document.querySelector("#legacyCodeStep");
  const legacyConfirmStep = document.querySelector("#legacyConfirmStep");
  const legacyStatus = document.querySelector("#legacyJoinStatus");
  let legacyCode = "";

  const reset = () => { code = ""; codeStep.hidden = false; confirmStep.hidden = true; status.textContent = ""; form.reset(); };
  const showCodeStep = () => { codeStep.hidden = false; confirmStep.hidden = true; status.textContent = ""; codeInput.focus(); };
  const formatCode = (value) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^COL/, "").slice(0, 8);
    return `COL-${clean.slice(0, 4)}${clean.length > 4 ? `-${clean.slice(4)}` : ""}`;
  };
  codeInput.addEventListener("input", () => { codeInput.value = formatCode(codeInput.value); });
  document.querySelector("#openJoin").addEventListener("click", () => { reset(); dialog.showModal(); requestAnimationFrame(() => codeInput.focus()); });
  document.querySelector("#closeJoin").addEventListener("click", () => dialog.close());
  document.querySelector("#changeCode").addEventListener("click", showCodeStep);
  dialog.addEventListener("close", reset);
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); code = codeInput.value.trim(); status.textContent = "Checking code…";
    try {
      const preview = await apiRequest("/collaborations/preview", { method: "POST", authenticated: true, body: { code } });
      if (preview.access_role === "revoked") { status.textContent = "The owner must restore your collaboration access."; return; }
      if (preview.access_role === "owner") { location.href = `chat.html?legacy=${preview.legacy_id}`; return; }
      document.querySelector("#joinLegacyName").textContent = `You're joining ${preview.subject_name}'s Legacy`;
      document.querySelector("#joinOwnerName").textContent = `Owner: ${preview.owner_name}`;
      codeStep.hidden = true; confirmStep.hidden = false; status.textContent = "";
    } catch (error) { status.textContent = error.message || "That collaborator code isn't valid."; }
  });
  document.querySelector("#confirmJoin").addEventListener("click", async () => {
    const button = document.querySelector("#confirmJoin"); button.disabled = true; status.textContent = "Joining collaboration…";
    try { const result = await apiRequest("/collaborations/join", { method: "POST", authenticated: true, body: { code } }); sessionStorage.setItem(window.LegaryaWorkspaceRole.COLLABORATION_GREETING_KEY, String(result.legacy_id)); location.href = `chat.html?legacy=${result.legacy_id}`; }
    catch (error) { button.disabled = false; status.textContent = error.message || "Unable to join this Legacy."; }
  });
  const resetLegacy = () => { legacyCode = ""; legacyCodeStep.hidden = false; legacyConfirmStep.hidden = true; legacyStatus.textContent = ""; legacyForm.reset(); };
  const formatLegacyCode = (value) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^LEG/, "").slice(0, 8);
    return `LEG-${clean.slice(0, 4)}${clean.length > 4 ? `-${clean.slice(4)}` : ""}`;
  };
  legacyCodeInput.addEventListener("input", () => { legacyCodeInput.value = formatLegacyCode(legacyCodeInput.value); });
  document.querySelector("#openLegacyJoin").addEventListener("click", () => { resetLegacy(); legacyDialog.showModal(); requestAnimationFrame(() => legacyCodeInput.focus()); });
  document.querySelector("#closeLegacyJoin").addEventListener("click", () => legacyDialog.close());
  document.querySelector("#changeLegacyCode").addEventListener("click", () => { legacyCodeStep.hidden = false; legacyConfirmStep.hidden = true; legacyStatus.textContent = ""; legacyCodeInput.focus(); });
  legacyDialog.addEventListener("close", resetLegacy);
  legacyForm.addEventListener("submit", async (event) => {
    event.preventDefault(); legacyCode = legacyCodeInput.value.trim(); legacyStatus.textContent = "Checking Legacy code…";
    try {
      const preview = await apiRequest("/legacy-access/preview", { method: "POST", authenticated: true, body: { code: legacyCode } });
      document.querySelector("#legacyPreviewName").textContent = `You're about to talk with ${preview.subject_name}'s Legacy`;
      legacyCodeStep.hidden = true; legacyConfirmStep.hidden = false; legacyStatus.textContent = "";
    } catch (error) { legacyStatus.textContent = error.message || "That Legacy code isn't valid."; }
  });
  document.querySelector("#beginLegacyConversation").addEventListener("click", async () => {
    const button = document.querySelector("#beginLegacyConversation"); button.disabled = true; legacyStatus.textContent = "Opening AI Legacy…";
    try { const result = await apiRequest("/legacy-access/join", { method: "POST", authenticated: true, body: { code: legacyCode } }); location.href = `legacy-chat.html?legacy=${result.legacy_id}`; }
    catch (error) { button.disabled = false; legacyStatus.textContent = error.message || "Unable to open this Legacy."; }
  });
  document.querySelector("#gatewayLogout").addEventListener("click", async () => { await logout(); location.replace("auth.html?mode=login"); });
  ensureAuthenticated().then((user) => { document.querySelector("#gatewayWelcome").textContent = `Welcome, ${user.full_name || "friend"}.`; }).catch(() => location.replace("auth.html?mode=login"));
})();
