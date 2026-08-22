"use strict";

/**
 * WaffleBerry public runtime configuration.
 *
 * IMPORTANT:
 * - Never put API keys or secrets here.
 * - This file is public and downloaded by every browser.
 */

const LOCAL_API_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

window.WAFFLEBERRY_API_BASE_URL = LOCAL_API_HOSTNAMES.has(
    window.location.hostname
)
    ? "http://127.0.0.1:8000/api/v1"
    : "https://89-167-14-211.sslip.io/api/v1";

// Public Google Identity Services OAuth Web Client ID. This is intentionally
// not a secret. Configure the same Web Client ID accepted by the backend.
window.WAFFLEBERRY_GOOGLE_CLIENT_ID = "480630043805-0vdcrq26tkag2iijmj78bi4kbh54cb67.apps.googleusercontent.com";
