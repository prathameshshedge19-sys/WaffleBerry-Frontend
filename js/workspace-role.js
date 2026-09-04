"use strict";

(() => {
  const COLLABORATION_GREETING_KEY = "legarya:collaboration-entry-greeting";

  const policyFor = (legacy) => {
    const role = legacy?.access_role || "none";
    return Object.freeze({
      role,
      isOwner: role === "owner",
      isCollaborator: role === "collaborator",
      canCreateLegacy: role === "owner",
      canManageCollaborators: role === "owner",
      canShareLegacy: role === "owner",
      selectorLockedToCurrentLegacy: role === "collaborator",
      canUseMemories: role === "owner" || role === "collaborator",
    });
  };

  window.LegaryaWorkspaceRole = Object.freeze({ COLLABORATION_GREETING_KEY, policyFor });
})();
