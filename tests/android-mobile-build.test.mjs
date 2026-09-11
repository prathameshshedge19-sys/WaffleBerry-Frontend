import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist", "android-web");

async function allFiles(directory, prefix = "") {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await allFiles(path.join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files;
}

test("Android web snapshot is deterministic and content-addressed", async () => {
  execFileSync(process.execPath, [path.join(root, "tools", "build-android-web.mjs")], { cwd: root, env: process.env });
  const first = await readFile(path.join(dist, "android-asset-manifest.json"), "utf8");
  execFileSync(process.execPath, [path.join(root, "tools", "build-android-web.mjs")], { cwd: root, env: process.env });
  const second = await readFile(path.join(dist, "android-asset-manifest.json"), "utf8");
  assert.equal(second, first);

  const manifest = JSON.parse(first);
  assert.match(manifest.frontendSha, /^[a-f0-9]{40}$/);
  assert.equal(manifest.appOrigin, "https://localhost");
  assert.equal(manifest.applicationId, "com.waffleberry.legarya");
  for (const item of manifest.files) {
    const bytes = await readFile(path.join(dist, ...item.path.split("/")));
    assert.equal(item.bytes, bytes.length, item.path);
    assert.equal(item.sha256, createHash("sha256").update(bytes).digest("hex"), item.path);
  }
});

test("bundle uses an explicit safe asset graph and excludes developer/server/animated portrait files", async () => {
  const files = await allFiles(dist);
  const forbidden = [
    "server.mjs", "vercel.json", ".vercelignore", "realtime-dev.html", "realtime-dev.mjs",
    "realtime-dev-auth.mjs", "portrait-motion.mjs", "legacy-portrait-renderer.mjs",
    "visual-presence-client.mjs", "visual-presence-controller.mjs", "visual-presence-settings.mjs",
  ];
  for (const name of forbidden) assert.equal(files.some(file => file === name || file.endsWith(`/${name}`)), false, name);
  assert.equal(files.some(file => file.startsWith("tests/") || file.startsWith("docs/") || file.startsWith("node_modules/")), false);
  assert.ok(files.includes("js/display-picture.mjs"));
  assert.ok(files.includes("js/legacy-chat-portrait.mjs"));
  assert.ok(files.includes("js/product-guide.js"));
  assert.ok(files.includes("css/visual-presence.css"));
});

test("every bundled screen has mobile viewport, narrow CSP, local fonts, and no web Google Identity", async () => {
  const files = (await allFiles(dist)).filter(file => file.endsWith(".html"));
  for (const file of files) {
    const html = await readFile(path.join(dist, file), "utf8");
    assert.match(html, /viewport-fit=cover/, file);
    assert.match(html, /Content-Security-Policy/, file);
    assert.doesNotMatch(html, /unsafe-eval|fonts\.googleapis\.com|fonts\.gstatic\.com|accounts\.google\.com\/gsi/, file);
    assert.match(html, /css\/android-fonts\.css/, file);
    assert.match(html, /js\/legarya-platform\.js/, file);
  }
});

test("runtime bundle exposes only public TLS routing and contains no obvious secrets", async () => {
  const runtime = await readFile(path.join(dist, "js", "android-runtime-config.js"), "utf8");
  assert.match(runtime, /https:\/\/89-167-14-211\.sslip\.io\/api\/v1/);
  assert.match(runtime, /wss:\/\/89-167-14-211\.sslip\.io\/api\/v1\/realtime\/connect/);
  assert.match(runtime, /"clientPlatform":"android"/);
  for (const shim of ["entries", "values", "fromEntries"]) assert.match(runtime, new RegExp(`define\\(Object, "${shim}"`));
  for (const shim of ["flat", "flatMap"]) assert.match(runtime, new RegExp(`define\\(Array\\.prototype, "${shim}"`));
  for (const shim of ["padStart", "replaceAll"]) assert.match(runtime, new RegExp(`define\\(String\\.prototype, "${shim}"`));
  assert.match(runtime, /define\(Promise\.prototype, "finally"/);
  assert.match(runtime, /"replaceChildren"/);
  assert.match(runtime, /!window\.AbortController/);
  assert.match(runtime, /throwIfAborted/);
  assert.match(runtime, /crypto\.randomUUID/);
  const files = await allFiles(dist);
  for (const file of files) {
    const info = await stat(path.join(dist, file));
    if (info.size > 3_000_000 || /\.(png|ico|woff2|glb)$/i.test(file)) continue;
    const text = await readFile(path.join(dist, file), "utf8");
    assert.doesNotMatch(text, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|DATABASE_URL\s*=|OPENAI_API_KEY\s*=/, file);
  }
});

test("owned JavaScript is transpiled for the API 24 system WebView baseline", async () => {
  const site = await readFile(path.join(dist, "js", "site.js"), "utf8");
  const platform = await readFile(path.join(dist, "js", "legarya-platform.js"), "utf8");
  assert.doesNotMatch(site, /\?\.|\?\?=/);
  assert.doesNotMatch(platform, /\?\.|\?\?=/);
  assert.match(platform, /LEGARYA_FORCE_STATIC_RYA/);
  assert.match(platform, /https:\/\/www\.waffleberry\.app/);
  assert.match(platform, /invite\.html/);
  const memoryEarth = await readFile(path.join(dist, "js", "memory-earth.js"), "utf8");
  assert.match(memoryEarth, /LEGARYA_FORCE_STATIC_RYA/);
});

test("native host denies cleartext, backup, broad files, camera and unrestricted WebView permissions", async () => {
  const manifest = await readFile(path.join(root, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
  assert.match(manifest, /usesCleartextTraffic="false"/);
  assert.match(manifest, /allowBackup="false"/);
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
  assert.doesNotMatch(manifest, /android\.permission\.(CAMERA|READ_MEDIA|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|ACCESS_FINE_LOCATION|BLUETOOTH)/);
  for (const permission of ["USE_BIOMETRIC", "USE_FINGERPRINT"]) {
    assert.match(manifest, new RegExp(`android\\.permission\\.${permission}[^>]+tools:node="remove"`));
  }
  const paths = await readFile(path.join(root, "android", "app", "src", "main", "res", "xml", "file_paths.xml"), "utf8");
  assert.doesNotMatch(paths, /external-path|path="\."/);
  const networkSecurity = await readFile(path.join(root, "android", "app", "src", "main", "res", "xml", "network_security_config.xml"), "utf8");
  assert.match(networkSecurity, /<base-config cleartextTrafficPermitted="false">[\s\S]*<certificates src="system"/);
  assert.match(networkSecurity, /<domain includeSubdomains="false">89-167-14-211\.sslip\.io<\/domain>/);
  assert.match(networkSecurity, /<certificates src="@raw\/isrg_root_x1"/);
  assert.doesNotMatch(networkSecurity, /src="user"|debug-overrides|overridePins/);
  const isrgRoot = await readFile(path.join(root, "android", "app", "src", "main", "res", "raw", "isrg_root_x1.pem"), "utf8");
  assert.match(isrgRoot, /^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/);
  assert.equal(createHash("sha256").update(isrgRoot).digest("hex"), "22b557a27055b33606b6559f37703928d3e4ad79f110b407d04986e1843543d1");
  const activity = await readFile(path.join(root, "android", "app", "src", "main", "java", "com", "waffleberry", "legarya", "MainActivity.java"), "utf8");
  assert.match(activity, /MIXED_CONTENT_NEVER_ALLOW/);
  assert.match(activity, /setAllowFileAccess\(false\)/);
  assert.match(activity, /setAllowContentAccess\(true\)/);
  assert.match(activity, /setAllowFileAccessFromFileURLs\(false\)/);
  assert.match(activity, /setAllowUniversalAccessFromFileURLs\(false\)/);
  assert.match(activity, /setWebContentsDebuggingEnabled\(\(getApplicationInfo\(\)\.flags & ApplicationInfo\.FLAG_DEBUGGABLE\) != 0\)/);
  assert.match(activity, /onPause\(\)[\s\S]*CookieManager\.getInstance\(\)\.flush\(\)[\s\S]*super\.onPause\(\)/);
  const nativePlugin = await readFile(path.join(root, "android", "app", "src", "main", "java", "com", "waffleberry", "legarya", "LegaryaNativePlugin.java"), "utf8");
  assert.match(nativePlugin, /runOnUiThread\([\s\S]*getWebView\(\)\.clearCache\(true\)/);
  assert.match(nativePlugin, /armAfterPermissionResume\(call, 10\)/);
  assert.match(nativePlugin, /Settings\.ACTION_APPLICATION_DETAILS_SETTINGS/);
  const platform = await readFile(path.join(root, "mobile", "platform-entry.js"), "utf8");
  assert.match(platform, /openMicrophoneSettings: \(\) => Native\.openAppSettings\(\)/);
});

test("Capacitor configuration is bundled-only and pins the expected origin contract", async () => {
  const config = JSON.parse(await readFile(path.join(root, "capacitor.config.json"), "utf8"));
  assert.equal(config.appId, "com.waffleberry.legarya");
  assert.equal(config.webDir, "dist/android-web");
  assert.equal(config.server.hostname, "localhost");
  assert.equal(config.server.androidScheme, "https");
  assert.equal(config.server.url, undefined);
  assert.equal(config.server.allowNavigation, undefined);
});

test("homepage mobile controls preserve minimum 44px touch targets", async () => {
  const style = await readFile(path.join(root, "css", "style.css"), "utf8");
  const i18n = await readFile(path.join(root, "css", "i18n.css"), "utf8");
  assert.match(i18n, /\.language-bar select,[^{]+\{[^}]*min-height:44px/);
  assert.match(style, /\.wordmark, \.footer-brand, \.footer-main nav a, \.footer-contact a \{[^}]*min-height: 44px/);
  assert.match(style, /\.soundscape-toggle \{[^}]*width: 44px; height: 44px/);
  assert.match(style, /@media \(pointer: coarse\) \{[\s\S]*\.soundscape-toggle \{ width: 44px; height: 44px/);
  assert.match(style, /\.site-nav a \{[^}]*min-width: 44px; min-height: 44px/);
  assert.match(style, /\.scroll-cue, \.soundscape-awaken \{ min-height: 44px/);
});
