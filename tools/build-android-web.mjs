import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, lstat, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild, transform as transformJavaScript } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist", "android-web");
const config = JSON.parse(await readFile(path.join(root, "mobile", "runtime-config.android.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const frontendSha = process.env.LEGARYA_FRONTEND_SHA || execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

const htmlFiles = [
  "index.html", "auth.html", "gateway.html", "forgot-password.html", "invite.html",
  "chat.html", "legacy-chat.html", "privacy.html", "reset-password.html", "terms.html",
  "verify-email.html", "verify-reset-otp.html",
];
const cssFiles = [
  "auth.css", "back-navigation.css", "chat-header.css", "chat.css", "gateway.css", "i18n.css",
  "invite.css", "legacy-chat.css", "legacy-deletion.css", "live-voice.css", "media-sources.css",
  "personality-dashboard.css", "plan-usage.css", "product-guide.css", "rya-core.css", "stories.css",
  "style.css", "timeline.css", "visual-presence.css",
];
const jsFiles = [
  "access-management.js", "audio-ownership.js", "auth.js", "auth-api.js", "auth-config.js",
  "auth-diagnostics.js", "chat.js", "chat-session.js", "collaborators.js", "display-picture.mjs",
  "display-picture-settings.mjs", "forgot-password.js", "gateway.js", "i18n.js", "invite.js",
  "legacy-chat.js", "legacy-chat-portrait.mjs", "legacy-deletion.js", "legarya-soundscape.js",
  "live-voice.mjs", "live-voice-policy.mjs", "markdown.js", "media-client.js", "media-sources.js",
  "memory-dashboard.js", "memory-earth.js", "microphone-ownership.js", "personality-dashboard.js",
  "plan-copy.mjs", "plan-usage.mjs", "playback-envelope.mjs", "product-guide.js", "progression.js",
  "progress-presentation.js", "realtime-client.mjs", "realtime-pcm.mjs", "realtime-playback.mjs",
  "realtime-worklet.js", "request-deadline.js", "reset-password.js", "rya.bundle.js", "rya.js",
  "rya-intro.js", "rya-renderer.mjs", "rya-speech-state.js", "rya-touch-reactions.js",
  "share-legacy.js", "site.js", "stories-client.js", "stories-dashboard.js", "stories-visitor.js",
  "three.core.min.js", "three.module.min.js", "timeline-client.js", "timeline-dashboard.js",
  "vendor/marked.umd.js", "vendor/purify.min.js", "verify-email.js", "verify-reset-otp.js",
  "visual-crop.mjs", "visual-source-ready.mjs", "voice-chat.js", "workspace-role.js",
];
const rootAssets = ["favicon.ico", "favicon.svg", "favicon-32x32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "site.webmanifest"];
const recursiveDirectories = ["assets", "locales"];
const forbiddenNames = [
  "server.mjs", "vercel.json", ".vercelignore", "realtime-dev.html", "realtime-dev.mjs",
  "realtime-dev-auth.mjs", "portrait-motion.mjs", "legacy-portrait-renderer.mjs",
  "visual-presence-client.mjs", "visual-presence-controller.mjs", "visual-presence-settings.mjs",
];
const csp = [
  "default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "font-src 'self'",
  "img-src 'self' data: blob:", "media-src 'self' blob:", "worker-src 'self' blob:",
  "connect-src 'self' https://89-167-14-211.sslip.io wss://89-167-14-211.sslip.io",
  "form-action 'self'",
].join("; ");

async function ensurePlainFile(source) {
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Required plain file missing: ${path.relative(root, source)}`);
}

async function copyRequired(relativeSource, relativeTarget = relativeSource) {
  const source = path.join(root, relativeSource);
  await ensurePlainFile(source);
  const target = path.join(output, relativeTarget);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}

async function writeCompatibleJavaScript(relativeSource) {
  const source = path.join(root, "js", relativeSource);
  await ensurePlainFile(source);
  const target = path.join(output, "js", relativeSource);
  await mkdir(path.dirname(target), { recursive: true });
  const transformed = await transformJavaScript(await readFile(source, "utf8"), {
    loader: "js",
    target: "chrome53",
    sourcefile: relativeSource,
    legalComments: "none",
    sourcemap: false,
  });
  await writeFile(target, transformed.code);
}

async function copyTree(relativeDirectory) {
  const sourceRoot = path.join(root, relativeDirectory);
  for (const entry of (await readdir(sourceRoot, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are forbidden in Android assets: ${relative}`);
    if (entry.isDirectory()) await copyTree(relative);
    else if (entry.isFile()) await copyRequired(relative);
    else throw new Error(`Unsupported Android asset: ${relative}`);
  }
}

function transformHtml(source) {
  let html = source
    .replace(/\s*<link[^>]+(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/gi, "")
    .replace(/\s*<script[^>]+accounts\.google\.com\/gsi\/client[^>]*><\/script>/gi, "")
    .replace(/(<meta\s+name=["']viewport["']\s+content=["'])([^"']*)(["'][^>]*>)/i, (_m, start, value, end) => `${start}${value.includes("viewport-fit") ? value : `${value}, viewport-fit=cover`}${end}`);
  if (!/name=["']viewport["']/i.test(html)) html = html.replace(/<head>/i, '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
  html = html.replace(/<head>/i, `<head>\n  <meta http-equiv="Content-Security-Policy" content="${csp}">\n  <link rel="stylesheet" href="css/android-fonts.css">\n  <link rel="stylesheet" href="css/android-mobile.css">`);
  html = html.replace(/<\/head>/i, '  <script src="js/android-runtime-config.js"></script>\n  <script src="js/legarya-platform.js"></script>\n</head>');
  return html;
}

async function writeRuntimeConfig() {
  const runtime = {
    apiBaseUrl: config.apiBaseUrl,
    mediaBaseUrl: config.mediaBaseUrl,
    wssUrl: config.wssUrl,
    clientPlatform: "android",
    clientVersion: config.clientVersion || packageJson.version,
    frontendSha,
  };
  if (!/^https:\/\//.test(runtime.apiBaseUrl) || !/^https:\/\//.test(runtime.mediaBaseUrl) || !/^wss:\/\//.test(runtime.wssUrl)) throw new Error("Android runtime endpoints must use HTTPS/WSS.");
  const api24Compatibility = `(function () {
  "use strict";
  var define = function (target, name, value) {
    if (!(name in target)) Object.defineProperty(target, name, { configurable: true, writable: true, value: value });
  };
  define(Object, "entries", function (object) { return Object.keys(object).map(function (key) { return [key, object[key]]; }); });
  define(Object, "values", function (object) { return Object.keys(object).map(function (key) { return object[key]; }); });
  define(Object, "fromEntries", function (entries) { var result = {}; Array.from(entries).forEach(function (entry) { result[entry[0]] = entry[1]; }); return result; });
  define(Promise.prototype, "finally", function (callback) {
    var constructor = this.constructor;
    return this.then(function (value) { return constructor.resolve(callback()).then(function () { return value; }); }, function (reason) { return constructor.resolve(callback()).then(function () { throw reason; }); });
  });
  define(Array.prototype, "flat", function (depth) {
    var flatten = function (values, remaining) { return values.reduce(function (result, value) { return result.concat(Array.isArray(value) && remaining > 0 ? flatten(value, remaining - 1) : value); }, []); };
    return flatten(this, depth === undefined ? 1 : Number(depth) || 0);
  });
  define(Array.prototype, "flatMap", function (callback, thisArg) { return this.map(callback, thisArg).flat(); });
  define(String.prototype, "padStart", function (length, fill) { var value = String(this), padding = String(fill === undefined ? " " : fill); if (!padding || value.length >= length) return value; while (padding.length < length - value.length) padding += padding; return padding.slice(0, length - value.length) + value; });
  define(String.prototype, "replaceAll", function (search, replacement) {
    if (search instanceof RegExp) { if (!search.global) throw new TypeError("replaceAll requires a global regular expression"); return this.replace(search, replacement); }
    return this.split(String(search)).join(String(replacement));
  });
  var toNode = function (value) { return value instanceof Node ? value : document.createTextNode(String(value)); };
  var parentPrototypes = [window.Element && Element.prototype, window.Document && Document.prototype, window.DocumentFragment && DocumentFragment.prototype].filter(Boolean);
  parentPrototypes.forEach(function (prototype) {
    define(prototype, "append", function () { var self = this; Array.prototype.forEach.call(arguments, function (value) { self.appendChild(toNode(value)); }); });
    define(prototype, "prepend", function () { var fragment = document.createDocumentFragment(); Array.prototype.forEach.call(arguments, function (value) { fragment.appendChild(toNode(value)); }); this.insertBefore(fragment, this.firstChild); });
    define(prototype, "replaceChildren", function () { while (this.firstChild) this.removeChild(this.firstChild); this.append.apply(this, arguments); });
  });
  if (window.crypto && !crypto.randomUUID && crypto.getRandomValues) define(crypto, "randomUUID", function () { var bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128; return Array.from(bytes).map(function (byte, index) { return (index === 4 || index === 6 || index === 8 || index === 10 ? "-" : "") + byte.toString(16).padStart(2, "0"); }).join(""); });
  if (!window.AbortController) {
    window.AbortController = function AbortController() {
      var listeners = [];
      this.signal = { aborted: false, reason: undefined, addEventListener: function (name, listener) { if (name === "abort") listeners.push(listener); }, removeEventListener: function (name, listener) { if (name === "abort") listeners = listeners.filter(function (item) { return item !== listener; }); }, throwIfAborted: function () { if (this.aborted) throw this.reason || new DOMException("Aborted", "AbortError"); } };
      this.abort = function (reason) { if (this.signal.aborted) return; this.signal.aborted = true; this.signal.reason = reason; listeners.slice().forEach(function (listener) { listener.call(this.signal, new Event("abort")); }, this); };
    };
  }
}());
`;
  await writeFile(path.join(output, "js", "android-runtime-config.js"), `${api24Compatibility}window.LEGARYA_RUNTIME_CONFIG = Object.freeze(${JSON.stringify(runtime)});\n`);
}

async function writeFonts() {
  const fonts = [
    ["@fontsource/inter/files/inter-latin-300-normal.woff2", "inter-300.woff2"],
    ["@fontsource/inter/files/inter-latin-400-normal.woff2", "inter-400.woff2"],
    ["@fontsource/inter/files/inter-latin-500-normal.woff2", "inter-500.woff2"],
    ["@fontsource/inter/files/inter-latin-600-normal.woff2", "inter-600.woff2"],
    ["@fontsource/inter/files/inter-latin-700-normal.woff2", "inter-700.woff2"],
    ["@fontsource/cormorant-garamond/files/cormorant-garamond-latin-300-normal.woff2", "cormorant-garamond-300.woff2"],
    ["@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2", "cormorant-garamond-400.woff2"],
    ["@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2", "cormorant-garamond-500.woff2"],
    ["@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2", "cormorant-garamond-600.woff2"],
  ];
  let css = "";
  for (const [modulePath, targetName] of fonts) {
    const source = path.join(root, "node_modules", ...modulePath.split("/"));
    await ensurePlainFile(source);
    const target = path.join(output, "assets", "fonts", targetName);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    const family = targetName.startsWith("inter") ? "Inter" : "Cormorant Garamond";
    const weight = /-(\d+)\.woff2$/.exec(targetName)[1];
    css += `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${weight};src:url('../assets/fonts/${targetName}') format('woff2')}\n`;
  }
  await writeFile(path.join(output, "css", "android-fonts.css"), css);
}

async function listFiles(directory, prefix = "") {
  const results = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) results.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) results.push(relative);
  }
  return results;
}

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "js"), { recursive: true });
await mkdir(path.join(output, "css"), { recursive: true });

for (const file of htmlFiles) {
  const source = path.join(root, file);
  await ensurePlainFile(source);
  await writeFile(path.join(output, file), transformHtml(await readFile(source, "utf8")));
}
for (const file of cssFiles) await copyRequired(`css/${file}`);
for (const file of jsFiles) await writeCompatibleJavaScript(file);
for (const file of rootAssets) await copyRequired(file);
for (const directory of recursiveDirectories) await copyTree(directory);
await copyRequired("mobile/mobile.css", "css/android-mobile.css");
await writeRuntimeConfig();
await writeFonts();
await esbuild({
  absWorkingDir: root,
  entryPoints: [path.join(root, "mobile", "platform-entry.js")],
  outfile: path.join(output, "js", "legarya-platform.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome53",
  minify: true,
  legalComments: "none",
  sourcemap: false,
});

const bundledFiles = await listFiles(output);
for (const forbidden of forbiddenNames) {
  if (bundledFiles.some(file => file === forbidden || file.endsWith(`/${forbidden}`))) throw new Error(`Forbidden Android asset included: ${forbidden}`);
}
const manifestFiles = [];
for (const relative of bundledFiles.filter(file => file !== "android-asset-manifest.json")) {
  const bytes = await readFile(path.join(output, ...relative.split("/")));
  manifestFiles.push({ path: relative, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
const manifest = {
  schemaVersion: 1,
  applicationId: "com.waffleberry.legarya",
  appOrigin: "https://localhost",
  clientPlatform: "android",
  clientVersion: config.clientVersion || packageJson.version,
  frontendSha,
  files: manifestFiles,
};
await writeFile(path.join(output, "android-asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const outputInfo = await stat(output);
if (!outputInfo.isDirectory()) throw new Error("Android web output was not created.");
console.log(`Android web bundle: ${manifestFiles.length + 1} files; frontend ${frontendSha}; origin https://localhost`);
