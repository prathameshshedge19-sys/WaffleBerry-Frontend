"use strict";

((root) => {
  const validId = (value) => Number.isInteger(value) && value > 0;

  const createChatSession = () => {
    const session = {
      selectedLegacyId: null,
      activeConversationId: null,
      isNewChat: true,
      navigationVersion: 0,
      pendingConversation: null,

      selectLegacy(legacyId) {
        this.selectedLegacyId = validId(legacyId) ? legacyId : null;
      },

      beginNewChat() {
        this.navigationVersion += 1;
        this.activeConversationId = null;
        this.isNewChat = true;
        this.pendingConversation = null;
      },

      beginConversationLoad() {
        this.navigationVersion += 1;
        this.isNewChat = false;
        return {
          legacyId: this.selectedLegacyId,
          version: this.navigationVersion,
        };
      },

      applyConversationLoad(load, conversationId) {
        if (
          load.version !== this.navigationVersion
          || load.legacyId !== this.selectedLegacyId
          || this.isNewChat
        ) return false;
        if (!validId(conversationId)) throw new Error("Invalid conversation id.");
        this.activeConversationId = conversationId;
        return true;
      },

      requireSelectedLegacy() {
        if (!validId(this.selectedLegacyId)) {
          const error = new Error("A Legacy must be selected before starting a conversation.");
          error.code = "missing_selected_legacy";
          throw error;
        }
        return this.selectedLegacyId;
      },

      activateConversation(conversationId, legacyId) {
        const selectedLegacyId = this.requireSelectedLegacy();
        if (!validId(conversationId) || legacyId !== selectedLegacyId) {
          const error = new Error("The conversation does not belong to the selected Legacy.");
          error.code = "conversation_scope_mismatch";
          throw error;
        }
        this.activeConversationId = conversationId;
        this.isNewChat = false;
      },

      canSend(content, sending) {
        return !sending && Boolean(content.trim()) && validId(this.selectedLegacyId);
      },

      async ensureConversation(createConversation) {
        if (validId(this.activeConversationId)) {
          return { conversationId: this.activeConversationId, created: false };
        }
        if (this.pendingConversation) return this.pendingConversation;

        const selectedLegacyId = this.requireSelectedLegacy();
        const navigationVersion = this.navigationVersion;
        const pending = (async () => {
          const created = await createConversation(selectedLegacyId);
          if (
            navigationVersion !== this.navigationVersion
            || selectedLegacyId !== this.selectedLegacyId
          ) {
            const error = new Error("The chat selection changed while starting the conversation.");
            error.code = "stale_chat_state";
            throw error;
          }
          this.activateConversation(created.id, created.legacy_id);
          return { conversationId: created.id, created: true, conversation: created };
        })();
        this.pendingConversation = pending;
        try {
          return await pending;
        } finally {
          if (this.pendingConversation === pending) this.pendingConversation = null;
        }
      },
    };
    return session;
  };

  root.LegaryaChatSession = { createChatSession };
})(globalThis);
