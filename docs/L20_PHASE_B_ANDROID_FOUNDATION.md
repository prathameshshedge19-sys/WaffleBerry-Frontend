# L20 Phase B - Android Foundation Final Acceptance

Status: **ACCEPTED.** Android engineering, the non-Google runtime gates, and the final native Google Sign-In gate are complete. A real Google test account authenticated through Android Credential Manager on API 36, the production backend accepted the Google ID token for its configured server audience, and logout plus native re-login passed.

This report covers Phase B only. It does not authorize or record a Play release, production signing, an AAB upload, iOS work, Phase C hardening, or an L20 tag.

## Ownership and revisions

- Frontend baseline: `a8d5740218a303a982ed01f4ba92a8a93fdd47f9` (`origin/main`).
- Backend baseline: `41ad3f8bb56317ebdbf4d550a5d0ce30929d63d5` (`origin/main`).
- Frontend branch: `l20/android-foundation`.
- Frontend implementation tip used by the final bundle: `d439ecfa86f22aa69f6f3e653963c2d8f48d12e0`.
- Backend branch: `l20/android-support`.
- Backend closure tip: `15658a9fed2104fbfd635aa3c433024352435c36`.
- Production backend equivalent: `8a1420543f3b250463b0a1f1a6f5fd45ecbf0283`.
- Original dirty worktrees were not reset, stashed, staged, or modified. Work remained in isolated worktrees.
- Both Phase B branches are clean and ready for normal non-force publication. The first publication attempt was rejected by the execution environment's external-write safeguard before either branch was pushed.

## Application and toolchain

| Item | Value |
| --- | --- |
| Application ID | `com.waffleberry.legarya` |
| Display/version | LegaRya `1.0` (`versionCode` 1) |
| Android SDK | min 24, target 36, compile 36 |
| Bundled origin | `https://localhost` |
| Capacitor | 8.5.1 |
| Gradle / Android Gradle Plugin | 8.14.5 / 8.13.0 |
| Java | Microsoft OpenJDK 21.0.12.1+1 |
| Build Tools / Platform Tools | 36.0.0 / 37.0.1 |

The app remains a bundled Capacitor application: no `server.url`, remote shell, Firebase, analytics, ads, billing, notification service, camera permission, broad storage permission, production keystore, or signing secret was added.

## Closure fixes

- Refresh JWTs now carry a random `jti`, guaranteeing observable rotation even when two refreshes occur in the same second. The server-side cookie remains HttpOnly, Secure, and SameSite=None.
- CookieManager is flushed on pause so a rotated refresh cookie is durable before Android may reclaim the process.
- Native logout clears the WebView cache on the UI thread, eliminating the observed worker-thread crash.
- The system-picker result remains active while Android temporarily hides the WebView, and the WebView may consume only the OS-granted `content://` URI. File access and file-URL cross-origin access remain disabled.
- Android 7.0/API 24 receives a small compatibility bootstrap for the Chrome 53 WebView APIs used by the shared client.
- Android 7.0 predates system trust for ISRG Root X1. The official self-signed public root is bundled only for `89-167-14-211.sslip.io`; system trust remains the default everywhere, cleartext remains denied, and normal certificate-chain and hostname validation remain enabled. There are no user-certificate anchors, debug overrides, or pin bypasses. See the [Let's Encrypt compatibility table](https://letsencrypt.org/docs/certificate-compatibility/) and [official certificate chain page](https://letsencrypt.org/certificates/).

## Production backend and origin

Production retains the exact additive origin setting `ANDROID_APP_ORIGIN=https://localhost`. Existing website origins remain unchanged; foreign origins, wildcard origins, `capacitor://localhost`, and `file://` remain denied.

The refresh-rotation fix was deployed without a migration or domain/authorization change. Final read-only verification found:

- host `WaffleBerry-server`;
- clean checkout at `8a1420543f3b250463b0a1f1a6f5fd45ecbf0283`;
- `waffleberry-backend.service` active;
- public `/health` response `status=ok`, `service=legarya-backend`.

## QA authentication and session matrix

The permanent QA credential was loaded directly from the current handoff, used only through the normal production login form, and kept out of source, commands, screenshots, reports, and test output. No token, refresh cookie, WSS ticket, or password is recorded here.

| Gate | API 24 | API 33 | API 36 |
| --- | --- | --- | --- |
| Installed UI login / owner session | PASS | PASS | PASS |
| Access token memory-only | PASS | PASS | PASS |
| HttpOnly + Secure refresh cookie | PASS | PASS | PASS |
| SameSite=None | Response contract PASS; Chrome 53 CDP cannot label the attribute | PASS | PASS |
| Refresh rotation | PASS | PASS | PASS |
| Background/resume | PASS | PASS | Credentialed session/surface PASS; exact-final rerun environment-limited |
| Force-stop restore | PASS | PASS | Prior credentialed session restore PASS |
| Late refresh cannot restore logout | PASS | PASS | Shared/native fence regression PASS |
| Logout clears cookie/session | PASS | PASS | PASS |
| Back reveals no private history | PASS | PASS | PASS |
| Re-login after logout | PASS | PASS | PASS |

API 24 used the actual installed app and production backend. It passed login, memory-only access state, secure cookie use and rotation, background/resume, force-stop restore, late-refresh fencing, logout, safe Back behavior, and re-login. Its old WebView briefly retains a signed-out gateway shell on Back during a slow failed refresh, but the identity, cookie, local private state, and private content are gone; the shell shows only the generic connection-interrupted state.

API 33 completed the full installed-app lifecycle matrix. API 36 completed credentialed login and the product/API smoke. A final exact-APK repeat was bounded when the host again produced System UI and launcher ANRs; LegaRya launched and emitted no app crash. The source delta since the successful API 36 run is limited to the API-24 hostname trust anchor and compatibility bootstrap.

Only one backend QA identity was authorized. Distinct-human account switching was therefore not fabricated; explicit logout/re-login plus the account/session epoch regressions prove old-identity fencing.

## Native Google authentication

- Android OAuth client: **configured** in the existing Google Cloud project.
- Package: `com.waffleberry.legarya`.
- Debug certificate binding: verified against the APK's debug signer.
- Server audience remains the existing web/server audience; no alternate backend or Play-signing fingerprint was added.
- API 36 Google Play Services is new enough for the Credential Manager Google-ID adapter.
- The app button invoked native Credential Manager and opened the real Google Accounts activity and account chooser.
- A real Google test account completed native sign-in; the production `/auth/google` exchange accepted its signed ID token for the configured server audience.
- The resulting owner session passed protected access, memory-only access-token handling, secure HttpOnly refresh-cookie handling, and refresh rotation.
- Cancellation returned safely to LegaRya with no crash, authenticated session, or persisted token.
- A synthetic invalid ID token was rejected by the production server with HTTP 401.
- Logout cleared the app identity, memory-only access state, refresh cookie, and Credential Manager selection state.
- Opening the chooser again, reselecting the available Google account, and completing native re-login passed.

Only one eligible Google identity was available, so a distinct second-Google-account switch was not fabricated. The real chooser/reselection path and the already-passing account/session epoch fences cover identity transition safety. Result: **PASS**.

## Credentialed feature smoke

The installed API 36 app authenticated as the QA owner and successfully loaded the production plans, conversations, memories, personality, progress, timeline/gaps, stories, media capabilities/list, display picture, voice settings, realtime capabilities, access management, and collaborator-management APIs. Empty Timeline/Stories/Media responses were accepted as valid empty states. Owner-only and role-specific legacy endpoints remained fail-closed where the QA identity did not have the visitor role.

| Surface | Result |
| --- | --- |
| Rya text and visual entry | PASS - installed UI and authenticated dependencies present |
| Legacy text | PASS - installed owner conversation surface present |
| Static Legacy DP | PASS - static resources/fallback retained; no L19 animation module bundled |
| Memories | PASS |
| Personality | PASS |
| Timeline | PASS, including empty state and gaps |
| Stories | PASS, including empty state; published visitor view correctly role-limited |
| Current information | PASS shared transport/citation regression and installed Rya entry |
| Owner management | PASS |
| Visitor/collaborator authorization | PASS fail-closed/shared regressions; no unauthorized role was fabricated |
| Voice settings | PASS (Marin/Cedar controls) |

The separate synthetic message/Story mutation harness was not executed after the environment's execution control rejected that mutation batch. Read-only production probes and the complete shared mutation regressions remain the evidence; no customer data or manually minted token was used.

## System picker and private media

The actual Android DocumentsUI picker was opened from the installed app, a small synthetic TXT fixture was selected, and the normal L16 UI flow reserved and uploaded it. Authenticated private read succeeded, the accepted state was observed, the private Blob/object URL path was cleaned, and the synthetic source was deleted after verification.

No storage/gallery permission was present. Picker suspension, cancellation, JPEG/PNG/WebP/PDF/TXT filtering, reservation/idempotency, retry, MIME/size rejection, private-read routing, Legacy switching, and account/session fencing are covered by the mobile/shared automated suite. Large 20/50 MiB profiling remains Phase C.

## Voice

### L12 foundation

PASS for the Phase B foundation: permission is user-gesture gated, exact-origin checked, denial remains non-destructive, ownership exclusion is enforced, browser media capability selection is retained, and stop/logout/navigation cleanup is covered. Meaningful microphone/codec quality is not claimed from emulator input and remains Phase C; no native recorder was introduced.

### L15 authenticated foundation

PASS using the QA session:

- realtime capability read;
- session and one-use ticket creation;
- direct secure WSS opened with exact `https://localhost` origin;
- AudioWorklet module and AudioContext initialized;
- silent Live Voice opened and ended cleanly;
- zero Conversation was created by silent open/end;
- WSS/audio resources closed without exposing the ticket.

Physical-device echo, latency, barge-in, route changes, Bluetooth/wired behavior, interruptions, network transitions, and the 20-session soak remain Phase C.

## Tablet disposition

API 36 tablet origin and responsive rendering previously passed. Later bounded retries produced host-wide ANRs in System UI, Phone/Search/launcher, and the app, without an app-specific crash. This remains **Phase B environment-limited tablet performance**, not an Android product blocker. Physical/form-factor performance belongs to Phase C.

## Security and Play pre-D gates

- Cleartext and mixed content denied; safe browsing enabled where supported.
- Only `INTERNET` and `RECORD_AUDIO` are platform permissions. AndroidX contributes its private signature-level dynamic-receiver permission.
- Backup/data extraction denied; exported components and FileProvider scope are explicit.
- Release WebView debugging disabled; no unrestricted JavaScript interface.
- Private media and static display-picture object URLs are revoked on lifecycle/identity changes.
- No production key, credential, token, cookie, QA fixture, customer data, server secret, development server URL, APK, or AAB is committed.

Account deletion remains a **hard pre-Phase-D Play blocker** requiring reviewed shared-ownership deletion, private-object cleanup, session revocation, retention/backup policy, idempotent orchestration, and an outside-app request flow.

AI response reporting remains a **hard pre-Phase-D Play blocker** requiring a bounded authorized report model, controlled categories, retention/access policy, rate limiting, and a reviewed moderation workflow.

Neither is a Phase B blocker and neither was rushed into this closure.

## Verification

- Frontend full suite: **368 passed, 0 failed, 0 skipped**.
- Android mobile/security subset: **7 passed**; media subset: **64 passed**.
- Backend focused auth after rotation fix: **8 passed**.
- Backend focused Android-origin/auth/realtime: **60 passed**.
- Backend full isolated regression after the backend change: **1,395 passed, 205 skipped, 0 failed**; only dependency deprecation/cache warnings.
- Android app unit tests: **4 passed**.
- Gradle `testDebugUnitTest`, `lintDebug`, `assembleDebug`, and instrumentation APK assembly: PASS (**571 tasks**, clean final build).
- Final connected-device instrumentation on API 36: **1 passed, 0 failed, 0 skipped**.
- Exact-origin/credentialed-fetch instrumentation previously passed on API 33/36. On API 24, both Gradle and direct Android runner started the single final test but stalled during runner completion without crash/ANR; the actual installed-app credentialed lifecycle and production fetch passed and are recorded separately, per the API-24 harness rule.
- `git diff --check`: PASS.
- APK zip alignment and v2 signature verification: PASS.
- Bundle/CSP/secret/signing-material/development-URL scans: PASS.
- `npm audit`: 0 critical, 0 high, 3 moderate development-only Capacitor CLI -> `xcode` -> `uuid` advisories; no vulnerable code is bundled in the APK.

## Final debug APK

- Path: `android/app/build/outputs/apk/debug/app-debug.apk`
- Size: **8,357,523 bytes**
- SHA-256: `16D01B2254315611578ADC46112EF40C0E2C707955DE0E9D2A1F4BF9CD174932`
- Package/version: `com.waffleberry.legarya`, versionCode 1, versionName 1.0
- min / target / compile SDK: 24 / 36 / 36
- Platform permissions: `INTERNET`, `RECORD_AUDIO`
- Embedded frontend SHA: `d439ecfa86f22aa69f6f3e653963c2d8f48d12e0`
- Signing: Android debug certificate only; APK Signature Scheme v2

This is a debug acceptance artifact, not a release artifact.

## Remaining Phase C work

- Physical-device L12/L15 capture and codec quality.
- Echo, latency, barge-in, audio routes, Bluetooth/wired behavior, calls/alarms/focus interruptions.
- Background/resume and network-transition soak; 20-session Live Voice soak.
- Large-file upload and temporary-file cleanup profiling.
- Broader physical form-factor, font-scale, cutout, rotation, navigation-mode, and accessibility QA.

## Final Phase B decision

All Android engineering and Phase B runtime gates are complete, including successful real native Google Sign-In, safe cancellation, invalid-token rejection, logout, chooser reselection, and Google re-login. The production backend is healthy, the final debug APK is reproducible and inspected, and the two clean Phase B branches are ready for normal non-force publication. Phase B is **ACCEPTED**; publication remains the sole operational follow-up because the execution environment rejected the external write before either push ran.
