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
