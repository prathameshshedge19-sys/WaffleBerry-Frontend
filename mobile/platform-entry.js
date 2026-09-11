import { registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Keyboard } from "@capacitor/keyboard";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

const Native = registerPlugin("LegaryaNative");
const TRUSTED_ORIGIN = "https://localhost";
const INVITE_LINK_ORIGIN = "https://www.waffleberry.app";
const SAFE_APP_PATHS = new Set([
  "/", "/index.html", "/auth.html", "/gateway.html", "/invite.html",
  "/forgot-password.html", "/reset-password.html", "/verify-email.html",
  "/verify-reset-otp.html", "/chat.html", "/legacy-chat.html",
  "/privacy.html", "/terms.html",
]);
const SAFE_EXTERNAL_SCHEMES = new Set(["https:", "http:"]);
let lifecycleGeneration = 0;
let foreground = true;
const chromiumMajor = Number(/(?:Chrome|Chromium)\/(\d+)/.exec(navigator.userAgent)?.[1] || 0);
const staticVisualFallback = chromiumMajor > 0 && chromiumMajor < 80;

document.documentElement.dataset.legaryaPlatform = "android";
if (staticVisualFallback) {
  document.documentElement.dataset.legaryaStaticVisual = "true";
  window.LEGARYA_FORCE_STATIC_RYA = true;
}

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function trustedInternalUrl(value) {
  try {
    const url = new URL(value, TRUSTED_ORIGIN);
    return url.origin === TRUSTED_ORIGIN && SAFE_APP_PATHS.has(url.pathname) ? url : null;
  } catch {
    return null;
  }
}

function invitationAppLink(value) {
  try {
    const url = new URL(value);
    if (url.origin !== INVITE_LINK_ORIGIN || url.pathname !== "/invite.html") return null;
    return trustedInternalUrl(`/invite.html${url.search}${url.hash}`);
  } catch {
    return null;
  }
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return SAFE_EXTERNAL_SCHEMES.has(url.protocol) && url.origin !== TRUSTED_ORIGIN ? url : null;
  } catch {
    return null;
  }
}

async function openExternal(value) {
  const url = safeExternalUrl(value);
  if (!url) throw new TypeError("Only external HTTP(S) URLs can be opened.");
  await Browser.open({ url: url.href, presentationStyle: "popover" });
}

async function endSensitivePresentation(reason) {
  window.LegaryaLiveVoice?.invalidate?.();
  window.LegaryaVoice?.stopAll?.();
  emit("legarya:android-sensitive-stop", { reason, generation: lifecycleGeneration });
  try { await Native.releaseAudioFocus(); } catch {}
}

function closeTopSurface() {
  const dialog = [...document.querySelectorAll("dialog[open]")].at(-1);
  if (dialog) {
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    if (dialog.open) dialog.close();
    return true;
  }
  const surface = [...document.querySelectorAll('[aria-modal="true"]:not([hidden]), .drawer.open, .drawer.is-open, .menu.open')].at(-1);
  if (!surface) return false;
  surface.querySelector('[data-close], [aria-label="Close"]')?.click();
  return true;
}

async function handleBack() {
  if (document.querySelector("[data-live-voice][open], .live-call[open], body[data-live-voice-active='true']")) {
    await endSensitivePresentation("hardware-back");
    return;
  }
  if (closeTopSurface()) return;
  if (history.length > 1) history.back();
  else await App.exitApp();
}

App.addListener("appStateChange", async ({ isActive }) => {
  foreground = isActive;
  lifecycleGeneration += 1;
  emit("legarya:app-state", { state: isActive ? "active" : "background", generation: lifecycleGeneration });
  if (!isActive) await endSensitivePresentation("background");
  else emit("legarya:android-resume-revalidate", { generation: lifecycleGeneration });
});
App.addListener("backButton", () => { void handleBack(); });
App.addListener("appUrlOpen", ({ url }) => {
  const target = invitationAppLink(url);
  if (target) location.replace(`${target.pathname}${target.search}${target.hash}`);
});

Keyboard.addListener("keyboardWillShow", ({ keyboardHeight }) => {
  document.documentElement.style.setProperty("--legarya-keyboard-height", `${Math.max(0, keyboardHeight || 0)}px`);
  document.documentElement.dataset.keyboardVisible = "true";
});
Keyboard.addListener("keyboardWillHide", () => {
  document.documentElement.style.setProperty("--legarya-keyboard-height", "0px");
  document.documentElement.dataset.keyboardVisible = "false";
});

document.addEventListener("click", (event) => {
  const anchor = event.target.closest?.("a[href]");
  if (!anchor) return;
  const external = safeExternalUrl(anchor.href);
  if (!external) return;
  event.preventDefault();
  void openExternal(external.href);
}, true);

window.addEventListener("legarya:session-ending", () => {
  lifecycleGeneration += 1;
  void endSensitivePresentation("session-ending");
});
window.addEventListener("legarya:session-cleared", () => {
  void Native.clearSessionData();
});

async function initializeSystemUi() {
  try { await StatusBar.setOverlaysWebView({ overlay: false }); } catch {}
  try { await StatusBar.setBackgroundColor({ color: "#050504" }); } catch {}
  try { await StatusBar.setStyle({ style: Style.Dark }); } catch {}
  try { await Native.configureTrustedWebView(); } catch {}
  try { await SplashScreen.hide({ fadeOutDuration: 250 }); } catch {}
}

window.LegaryaPlatform = Object.freeze({
  kind: "android",
  trustedOrigin: TRUSTED_ORIGIN,
  isForeground: () => foreground,
  lifecycleGeneration: () => lifecycleGeneration,
  usesStaticVisualFallback: () => staticVisualFallback,
  openExternal,
  googleSignIn: options => Native.googleSignIn(options),
  armMicrophone: owner => Native.armMicrophone({ owner }),
  openMicrophoneSettings: () => Native.openAppSettings(),
  requestAudioFocus: owner => Native.requestAudioFocus({ owner }),
  releaseAudioFocus: () => Native.releaseAudioFocus(),
  pickPhoto: () => Native.pickPhoto(),
  pickDocument: () => Native.pickDocument(),
  clearSessionData: () => Native.clearSessionData(),
});

void initializeSystemUi();
