# L20 Phase B — Android Foundation and Feature Parity

Status: **engineering implementation complete; release acceptance blocked by undeployed production origin/OAuth configuration and credentialed acceptance tests.**

This report records the Phase B implementation only. It does not authorize a Play release, production signing, an AAB upload, iOS work, Phase C device hardening, or an L20 tag.

## Baselines and ownership

- Frontend owner/baseline: `WaffleBerry-Frontend` at `a8d5740218a303a982ed01f4ba92a8a93fdd47f9` (`origin/main`).
- Backend baseline: `WaffleBerry-Backend` at `41ad3f8bb56317ebdbf4d550a5d0ce30929d63d5` (`origin/main`).
- Work was isolated on `l20/android-foundation` and `l20/android-support`; pre-existing dirty files in the original worktrees were not reset, staged, or changed.
- Android project owner: frontend repository.

## Toolchain and licenses

| Component | Exact version | Purpose/license |
| --- | --- | --- |
| Node.js / npm | 24.18.0 / bundled npm | Build/test tooling; Node license distribution |
| Capacitor CLI/Core/Android | 8.5.1 | Native shell/build; MIT |
| Capacitor App | 8.1.1 | lifecycle/back/App Links; MIT |
| Capacitor Browser | 8.0.4 | external browser; MIT |
| Capacitor Keyboard | 8.0.5 | keyboard/insets; MIT |
| Capacitor Splash Screen | 8.0.2 | splash lifecycle; MIT |
| Capacitor Status Bar | 8.0.3 | system bars; MIT |
| esbuild | 0.28.2 | API-24-compatible JS bundling/transpilation; MIT |
| Inter / Cormorant Garamond packages | 5.3.0 | self-hosted Android fonts; SIL Open Font License |
| Android Gradle Plugin / Gradle | 8.13.0 / 8.14.5 | Android build |
| Microsoft OpenJDK | 21.0.12.1+1 | Java toolchain; GPLv2 with Classpath Exception |
| Android SDK | Command-line Tools 22; compile/target 36, min 24; Build Tools 36; Platform Tools 37.0.1; Emulator 37.1.11; Google APIs x86_64 images 24/33/36 | Android SDK licenses accepted locally |
| AndroidX Credentials / Play Services Auth adapter | 1.6.0 / 1.6.0 | Credential Manager |
| Google ID library | 1.2.0 | Google ID option/token parsing |

No Firebase, analytics, Crashlytics, ads, billing, notification, background-service, or camera dependency was added.

`npm audit` reported 0 critical, 0 high, and 3 moderate advisory nodes, all in the development-only Capacitor CLI → `xcode` → `uuid` chain (`GHSA-w5hq-g745-h8pq`). That iOS project-parser path is neither bundled in the APK nor given attacker-controlled UUID buffers here. npm's offered remediation is a Capacitor CLI downgrade to 8.4.3, conflicting with the selected stable 8.5.1 toolchain; the risk is documented instead of silently changing architecture or applying a forced/breaking audit fix.

## Application and project structure

- Application ID: `com.waffleberry.legarya`
- Display name: `LegaRya`
- Version: `1.0` (`versionCode` 1)
- SDKs: min 24, target 36, compile 36
- Java source/target: 21
- Structure: `package.json`, `capacitor.config.json`, `mobile/`, `tools/build-android-web.mjs`, generated `dist/android-web/`, and `android/`.
- Build commands: `npm ci`, `npm run mobile:build`, `npm run android:sync`, then `android/gradlew.bat assembleDebug`.
- Debug signing only. No production keystore or signing secret exists in the repository.

## Deterministic bundled client

`tools/build-android-web.mjs` uses explicit allowlists for runtime HTML, CSS, JavaScript, assets, and locales. It fails on missing/non-plain required files, transpiles owned JavaScript to the Chrome 53 syntax baseline for API 24, self-hosts fonts, injects mobile CSP/runtime config/platform code, and emits a sorted per-file SHA-256 manifest.

The bundle excludes server code, Vercel configuration, tests, docs, developer realtime harnesses, and the historical L19 animated-portrait runtime. It includes the existing static Legacy DP resources and current Rya assets. The build produced 129 files including `android-asset-manifest.json`.

The final ignored build output and debug APK embed frontend implementation commit `6badae9cff4974371b4cf12613731027c6557c7e`. Release automation passes the source commit as `LEGARYA_FRONTEND_SHA`, so the content manifest identifies the exact implementation snapshot without creating a self-referential tracked artifact.

## Origin, endpoints, and CSP

- Bundled top-level origin: exactly `https://localhost`, verified by API-24/33/36 instrumentation from the live WebView URL.
- HTTP/media: `https://89-167-14-211.sslip.io/api/v1`
- WSS: `wss://89-167-14-211.sslip.io/api/v1/realtime/connect`
- Platform/version: `android` / `1.0.0`
- No `server.url` and no remote-shell navigation.
- CSP permits only self, the one HTTPS backend, the one WSS backend, and the narrowly required `data:`/`blob:` image/media/worker cases. It contains no `unsafe-eval`; inline script/style remain required by the inherited static client.

Backend support is additive and opt-in: `ANDROID_APP_ORIGIN=https://localhost` adds only that literal origin to existing HTTP CORS and realtime validation. The default is `None`, so Phase B does not alter production behavior. Wildcards, `capacitor://`, `file://`, and foreign origins remain denied.

A read-only production probe on 2026-09-11 returned `200` for `/health` and `400` for an `/api/v1/auth/refresh` preflight carrying `Origin: https://localhost`; the response deliberately omitted `Access-Control-Allow-Origin`. This is expected evidence that the Phase B opt-in was not deployed, and it blocks HTTP/auth/WSS runtime acceptance rather than weakening production.

## Native host security

- Cleartext and mixed content denied; standard platform TLS validation retained.
- Safe Browsing enabled where supported.
- WebView file/content access denied; release debugging disabled.
- Top-level privileged navigation restricted to the bundled `https://localhost` origin. External HTTPS/HTTP links leave the WebView through the system browser; dangerous/unknown schemes fail closed.
- No broad JavaScript interface was added; Capacitor plugin calls are limited to the bundled origin by native navigation controls.
- Only `INTERNET` and `RECORD_AUDIO` are declared. There are no storage, gallery, video/camera, location, phone, Bluetooth, or background-microphone permissions.
- Explicit component export state, backup/data-extraction exclusions, narrow app-cache `FileProvider`, temporary read grants, and no public-download export.

## Authentication and session fencing

The existing model is preserved: access tokens remain in JavaScript memory, passwords are not persisted, and refresh state remains an HttpOnly Secure backend cookie. Android config enables first- and bounded third-party cookies and flushes the CookieManager so the `https://localhost` to backend cookie can persist across process restart once the exact origin is enabled server-side.

The Android session fence advances identity generation before cleanup, blocks new authenticated work, ends active Live Voice/dictation ownership, closes realtime, aborts registered work, revokes object URLs, clears user-scoped session presentation, releases native audio/URI grants, clears backend cookies on explicit logout/account switch, and replace-navigates to the signed-out root. Existing refresh-race tests prove a late refresh cannot restore a cleared identity.

Email signup/OTP/password/login/reset/logout continue to use the shared screens and APIs. A native Google button invokes Android Credential Manager/Google ID, posts only the ID token to the existing `/auth/google` endpoint, handles cancellation, and stores no Google access/refresh token. Actual success/audience/account-change acceptance is blocked until Android OAuth configuration and test identity are supplied; no production OAuth change was made.

Credentialed login, cookie rotation, force-stop/reopen, revocation, and account-switch execution on API 24/33/36 are likewise blocked until the optional backend origin is deployed to a non-production acceptance environment and QA accounts are available. No Keystore fallback was introduced because no evidence disproved the HttpOnly-cookie design.

## Lifecycle, Back, keyboard, and system UI

`LegaryaPlatform` centralizes App pause/resume, lifecycle generations, hardware Back, external browser, App Links, keyboard state, status/splash, microphone ownership, audio focus, native identity, pickers, and cleanup events while leaving domain logic shared.

Pause never starts a microphone and synchronously ends transient voice ownership; resume advances lifecycle generation, revalidates shared session state, and never auto-restarts capture. The Back dispatcher closes active Live Voice safely before modal/drawer/nested/history/root behavior and prevents private-history resurrection after logout. `adjustResize`, VisualViewport/keyboard CSS variables, `viewport-fit=cover`, safe-area variables, touch-target rules, Android 12+ branded splash, adaptive/monochrome icons, and target-36 dark system bars are present. Layout assertions cover 360/390/412 widths and the API-36 tablet profile.

## Pickers, upload, and private media

- Existing product file inputs remain primary and are delegated to the platform chooser by Capacitor's WebChromeClient; direct camera capture is rejected. The native adapter also provides an API-33+ `ACTION_PICK_IMAGES` foundation with an SAF/OpenDocument fallback, limited to JPEG, PNG, and WebP.
- The document-picker foundation uses SAF/OpenDocument and permits PDF, TXT, JPEG, PNG, and WebP only.
- Cancellation is explicit; `content://` remains an opaque streamable URI and no deprecated filesystem-path resolution or gallery enumeration is used.
- No base64 conversion or broad storage permission was added. Existing L16 reservation/idempotency/upload and shared account/Legacy fencing remain authoritative.
- Private media continues through authenticated fetch and short-lived object URLs, revoked on lifecycle/identity change.
- A narrow app-cache `FileProvider` and logout cleanup boundary are present for future user-directed Open With/share work, but no product surface currently requires native export. Actual temporary-file creation/intent UX is therefore deferred to Phase C. No silent public export occurs.

Credentialed end-to-end picker-to-upload/private-media tests require the same acceptance backend/accounts noted above. Contract, MIME, native picker, permission, and cleanup paths are implemented and covered structurally/unit-wise; interactive picker/upload parity is not claimed PASS without that run.

## Static Legacy DP and Rya

The permanent static-DP decision is preserved: small cached static portrait in text chat and larger static portrait in Live Voice, with existing fallback and lifecycle revocation. No moving portrait, deformation, blink, mouth motion, lip-sync, or L19 animation module is bundled. Existing repeated-load tests retain zero resources after disposal.

Rya reuses the current visual. WebView Chromium versions below 80 and renderer failure/reduced capability use the existing static/no-op visual fallback; modern emulator tiers keep the normal renderer. This avoided API-24 WebGL instability without replacing Rya.

## Voice feasibility

L12 retains browser `getUserMedia`/MediaRecorder and shared transcription. Native mediation requires an exact trusted origin, foreground state, Android `RECORD_AUDIO`, the correct L12/L15 owner, and an unconsumed user gesture no older than ten seconds. Video, multiple/unknown resources, stale/background requests, and untrusted origins are denied. Emulator tests prove permission and ownership plumbing plus supported mobile-format selection; meaningful microphone capture/codec and server transcription quality remain Phase C physical-device work.

L15 retains the existing backend capability/session/ticket/WSS/AudioWorklet/AudioContext path. Android direct WSS configuration and origin are correct; background/session fence ends calls, releases focus, and prevents automatic restart. The native audio-focus interface covers request/grant/loss/release and idempotent cleanup. A production WSS handshake and credentialed silent open/end are blocked by undeployed exact-origin configuration. Phase C owns real microphone quality, echo, latency, barge-in, route/Bluetooth behavior, interruptions, network transitions, and the 20-session soak. L15 is not described as Android-hardened.

## Feature parity matrix

| Area | Phase B result | Evidence/remaining work |
| --- | --- | --- |
| Email auth | PARTIAL / config blocked | Shared UI/API and fencing retained; credentialed API-24/33/36 persistence matrix awaits acceptance origin/accounts |
| Google login | PARTIAL / config blocked | Native Credential Manager foundation complete; production OAuth/audience acceptance not configured |
| Rya text/visual | PASS | Shared text client bundled; modern renderer plus old-WebView/static fallback |
| Legacy text | PASS | Shared conversation client bundled |
| Static DP | PASS | Static-only resources/cache/revocation; L19 runtime excluded |
| Memories | PASS (shared regression) | Existing shared UI/API bundled; credentialed emulator smoke pending environment |
| Personality | PASS (shared regression) | Existing shared UI/API bundled |
| Media & Sources | PARTIAL / config blocked | Picker/private-media/upload paths complete; credentialed server smoke pending |
| Timeline | PASS (shared regression) | Existing shared UI/API bundled |
| Stories read/edit | PASS (shared regression) | Existing shared UI/API bundled |
| Current information | PASS | Shared citations; external links leave privileged WebView |
| Visitor | PASS (shared regression) | Existing role policy bundled |
| Collaborator | PASS (shared regression) | Existing role policy bundled |
| Owner | PASS (shared regression) | Existing role policy bundled |
| Voice settings | PASS | Existing Marin/Cedar accessible controls bundled |
| L12 | PARTIAL / PHASE C | Secure permission/ownership/API plumbing; real-device recording quality deferred |
| L15 | PARTIAL / PHASE C + config blocked | WSS/audio foundation; production-origin handshake and physical hardening remain |
| Account deletion | BLOCKED — hard pre-D gate | Shared account deletion is absent; design below |
| AI response reporting | BLOCKED — hard pre-D gate | Shared bounded moderation storage/workflow is absent; design below |

## Play compliance gates

### Account deletion — hard pre-D blocker

Safe shared deletion is larger than the Android-foundation change because the current data model does not yet provide a reviewed user-wide deletion orchestrator/retention contract. Backend/domain ownership is required before Phase D: inventory user-owned versus shared collaborator data and private S3 keys; define legal/backup retention without invented promises; add reauthentication and impact preview; create an idempotent tombstone/orchestration job that revokes refresh sessions/realtime before cascading only owned data; fence stale work against resurrection; record a non-sensitive result; and add an outside-app HTTPS request flow with enumeration-safe identity verification. Frontend ownership then adds distinct in-app Delete account confirmation/status. This slice was intentionally not implemented because an unreviewed cascade could delete other customers’ shared data.

### AI-response reporting — hard pre-D blocker

Backend/product-policy ownership is required: define the bounded report entity and retention/access policy; authenticate and authorize reporter access to the exact Rya/Legacy message; store message ID, model surface, bounded excerpt/hash and one controlled category (harmful/offensive, unsafe, inaccurate/misleading, impersonation/identity concern, other); reject foreign/arbitrary messages; rate-limit; and expose sanitized internal review status. Frontend ownership then adds `Report response` to central generated responses without writing reports to Memory or uploading whole conversation history. This is not a mobile-only feature and remains a named Phase D gate.

Other Phase D gates: reviewed privacy policy/Data Safety declarations, store listing assets/content rating, verified `assetlinks.json` using the production signing fingerprint, production OAuth registration, production signing custody, release AAB/reproducibility review, and completed account deletion/reporting capabilities.

## Emulator and test evidence

| Profile | Effective width | WebView | Result |
| --- | ---: | --- | --- |
| API 24 phone | 360 dp | System WebView 53 package (runtime reported Chromium 69) | Origin instrumentation PASS; clean stable launch using static Rya fallback |
| API 33 phone | ~393 dp | System WebView 109 | Origin instrumentation PASS; stable launch, no matching crash/syntax/asset errors |
| API 36 phone | ~411 dp | System WebView 133 | Origin instrumentation PASS; branded splash and launch PASS |
| API 36 tablet/resizable | 1280 × 800 dp | System WebView 133 | Origin instrumentation PASS and responsive layout rendered. The AVD was host-saturated and produced ANRs in System UI, Phone, Search, and eventually the app at ~84% CPU pressure; a 1280×800-pixel retry still produced a System UI ANR and Chromium tile-memory warnings, so tablet performance acceptance is emulator-environment blocked, not claimed PASS |

Automated security tests cover cleartext/mixed-content denial, bundled-only config, top-level navigation, dangerous schemes, trusted microphone conditions/video denial, debugging, exports, backup, narrow FileProvider, secrets/signing-material exclusions, CSP, session race fencing, and bundle exclusions.

Final verification:

- `npm ci`: PASS, 107 packages installed from lockfile. npm audit: 0 critical, 0 high, 3 moderate development-tool nodes documented above.
- Frontend: 367 passed, 0 failed, 0 skipped.
- Android web build: PASS twice-identical deterministic manifest; 128 hashed runtime files plus the manifest (129 total).
- Android app unit tests: 4 passed, 0 failed (`TrustedRequestPolicyTest`).
- Android instrumentation: `AppOriginInstrumentedTest` passed on the initial API 24 phone, API 33 phone, API 36 phone, and API 36 tablet runs. A later tablet retry failed to attach while Android system processes were also ANRing; the original tablet origin assertion remains the valid result.
- Gradle: `testDebugUnitTest`, `lintDebug`, `assembleDebug`, and `assembleDebugAndroidTest` PASS. Lint found no new issues; Capacitor's dependency baseline reported six stale baseline entries no longer present.
- Backend Android-origin focus: 3 passed, 0 failed.
- Backend full regression on the idle host: 1395 passed, 205 skipped, 0 failed, 2 dependency deprecation warnings in 540.34 seconds. An earlier emulator-saturated run had two Alembic 90-second timeouts; both exact tests passed 2/2 after stopping the emulator, before the clean full rerun.
- Syntax and whitespace: all changed JavaScript passed `node --check`; `git diff --check` is clean.

The final debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`, 7,798,069 bytes, SHA-256 `1DAA9B1E8E99B672F2B7A6C5C0ED24ED804EC0F96ED6D9884CCF7A084FBAE189`. `aapt` confirms package `com.waffleberry.legarya`, min 24, target/compile 36, and only `INTERNET` plus `RECORD_AUDIO` as platform permissions (AndroidX also emits its private signature-level dynamic-receiver permission). It is a debug artifact only.

## Known Phase C work

- Physical-device L12/L15 capture quality and actual codec matrix.
- Echo, latency, barge-in, Bluetooth/wired/speaker routing, calls/alarms/focus interruptions.
- Background/resume/network-transition stress and 20-session Live Voice soak.
- Large 20/50 MiB upload profiling and private temporary-file cleanup stress.
- Broader physical form-factor, font-scale, cutout, gesture/three-button, rotation, and accessibility QA.

## Release acceptance decision

The reproducible Android foundation, hardened host, bundled app, exact origin support, native adapters, debug APK, automated regressions, and emulator-origin matrix are complete. Phase B remains **blocked for release acceptance** until a controlled acceptance backend enables only `https://localhost`, Android OAuth is configured, credentialed auth/cookie/upload/private-media/WSS matrices pass, and the two explicitly named Play compliance gates are completed before Phase D. No production configuration was changed in Phase B.
