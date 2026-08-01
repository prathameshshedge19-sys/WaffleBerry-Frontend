"use strict";

// Public runtime configuration only. Set this URL to the deployed backend
// before publishing to Vercel. Never place API keys or backend secrets here.
window.WAFFLEBERRY_API_BASE_URL = "https://89-167-14-211.sslip.io/api/v1";
    window.WAFFLEBERRY_API_BASE_URL ||
    (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
        ? "http://127.0.0.1:8000/api/v1"
        : "");
