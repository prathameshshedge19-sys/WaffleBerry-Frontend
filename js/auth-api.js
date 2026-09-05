"use strict";

(() => {
  const config = window.LEGARYA_AUTH_CONFIG;
  if (!config?.apiBaseUrl) throw new Error("LegaRya authentication is not configured.");

  const API_BASE_URL = config.apiBaseUrl.replace(/\/+$/, "");
  const STORAGE_KEYS = Object.freeze({
    ACCESS_TOKEN: "accessToken",
    CURRENT_USER: "currentUser",
    ACTIVE_CONVERSATION_ID: "activeConversationId",
  });
  let accessToken = null;
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);

  class ApiError extends Error {
    constructor(message, options = {}) {
      super(message);
      this.name = "ApiError";
      this.status = options.status || 0;
      this.kind = options.kind || "unknown";
      this.details = options.details || null;
    }
  }

  const parseResponse = async (response) => {
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  };

  const validationMessage = (details) => {
    if (!Array.isArray(details)) return "Please check the information you entered.";
    const messages = details.map((item) => item?.msg).filter(Boolean);
    return messages.length ? messages.join(" ") : "Please check the information you entered.";
  };

  const errorMessage = (status, data) => {
    if (status === 401) return "Your session has expired. Please sign in again.";
    if (status === 422) return validationMessage(data?.detail);
    if (typeof data?.detail?.message === "string") return data.detail.message;
    if (typeof data?.detail === "string") return data.detail;
    return "The request could not be completed.";
  };

  const errorKind = (status, data) => {
    if (typeof data?.detail?.code === "string") return data.detail.code;
    if (status === 401) return "authentication";
    if (status === 422) return "validation";
    if (status === 429) return "rate-limit";
    if (status >= 500) return "server";
    return "request";
  };

  const storeSession = (accessTokenValue, currentUser) => {
    accessToken = accessTokenValue;
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(currentUser));
  };

  const clearStoredSession = () => {
    accessToken = null;
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID);
  };

  const storeAuthenticatedSession = (response) => {
    if (!response?.access_token || response.token_type !== "bearer" || !response.user) {
      throw new ApiError("The server returned an invalid authentication response.", { kind: "server" });
    }
    storeSession(response.access_token, response.user);
  };

  const refreshSession = async () => {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      return false;
    }
    const data = await parseResponse(response);
    if (!response.ok) return false;
    storeAuthenticatedSession(data);
    return true;
  };

  const apiRequest = async (path, options = {}) => {
    const { method = "GET", body, authenticated = false, signal, retry = true } = options;
    const headers = { "Content-Type": "application/json" };
    if (authenticated) {
      if (!accessToken && retry && await refreshSession()) {
        return apiRequest(path, { method, body, authenticated, signal, retry: false });
      }
      if (!accessToken) throw new ApiError("Please sign in to continue.", { status: 401, kind: "authentication" });
      headers.Authorization = `Bearer ${accessToken}`;
    }

    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        credentials: "include",
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new ApiError("Unable to reach Legarya. Please try again.", { kind: "network" });
    }

    const data = await parseResponse(response);
    if (response.status === 401 && authenticated && retry && await refreshSession()) {
      return apiRequest(path, { method, body, authenticated, signal, retry: false });
    }
    if (!response.ok) {
      const kind = errorKind(response.status, data);
      if (kind === "legacy_access_changed") {
        window.setTimeout(() => location.replace("gateway.html"), 1400);
      }
      if (new Set(["localhost", "127.0.0.1"]).has(location.hostname)) {
        console.warn("[LegaRya API] Request failed", {
          method,
          path,
          status: response.status,
          kind,
        });
      }
      throw new ApiError(errorMessage(response.status, data), {
        status: response.status,
        kind,
        details: data,
      });
    }
    return data;
  };

  const streamRequest = async (path, options = {}) => {
    const { method = "POST", body, authenticated = false, signal, retry = true } = options;
    const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
    if (authenticated) {
      if (!accessToken && retry && await refreshSession()) {
        return streamRequest(path, { method, body, authenticated, signal, retry: false });
      }
      if (!accessToken) throw new ApiError("Please sign in to continue.", { status: 401, kind: "authentication" });
      headers.Authorization = `Bearer ${accessToken}`;
    }

    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        credentials: "include",
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new ApiError("Unable to reach Legarya. Please try again.", { kind: "network" });
    }

    if (response.status === 401 && authenticated && retry && await refreshSession()) {
      return streamRequest(path, { method, body, authenticated, signal, retry: false });
    }
    if (!response.ok) {
      const data = await parseResponse(response);
      const kind = errorKind(response.status, data);
      if (kind === "legacy_access_changed") {
        window.setTimeout(() => location.replace("gateway.html"), 1400);
      }
      if (new Set(["localhost", "127.0.0.1"]).has(location.hostname)) {
        console.warn("[LegaRya API] Stream request failed", {
          method,
          path,
          status: response.status,
          kind,
        });
      }
      throw new ApiError(errorMessage(response.status, data), {
        status: response.status,
        kind,
        details: data,
      });
    }
    if (!response.body) {
      throw new ApiError("The streaming response was unavailable.", { kind: "stream_unavailable" });
    }
    return response;
  };

  const authenticatedFetch = async (path, options = {}, retry = true) => {
    if (!accessToken && retry && await refreshSession()) return authenticatedFetch(path, options, false);
    if (!accessToken) throw new ApiError("Please sign in to continue.", { status: 401, kind: "authentication" });
    let response;
    try {
      const headers = new Headers(options.headers || {});
      headers.set("Authorization", `Bearer ${accessToken}`);
      response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, credentials: "include" });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new ApiError("Unable to reach Legarya. Please try again.", { kind: "network" });
    }
    if (response.status === 401 && retry && await refreshSession()) return authenticatedFetch(path, options, false);
    if (!response.ok) {
      const data = await parseResponse(response);
      throw new ApiError(errorMessage(response.status, data), {
        status: response.status,
        kind: errorKind(response.status, data),
        details: data,
      });
    }
    return response;
  };

  const authenticateUser = async (email, password, rememberMe = false) => {
    const response = await apiRequest("/auth/login", {
      method: "POST",
      body: { email, password, remember_me: rememberMe === true },
    });
    storeAuthenticatedSession(response);
    return response;
  };

  const ensureAuthenticated = async () => {
    try {
      const user = await apiRequest("/auth/me", { authenticated: true });
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      return user;
    } catch (error) {
      clearStoredSession();
      throw error;
    }
  };

  const logout = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } finally {
      clearStoredSession();
    }
  };

  const authenticateWithGoogle = async (credential, acceptedTerms = false) => {
    const response = await apiRequest("/auth/google", {
      method: "POST",
      body: { credential, accepted_terms: acceptedTerms === true },
    });
    storeAuthenticatedSession(response);
    return response;
  };

  window.LegaryaAuthApi = Object.freeze({
    API_BASE_URL,
    STORAGE_KEYS,
    ApiError,
    apiRequest,
    authenticatedFetch,
    streamRequest,
    authenticateUser,
    authenticateWithGoogle,
    clearStoredSession,
    ensureAuthenticated,
    logout,
    refreshSession,
    storeAuthenticatedSession,
  });
})();
