# L20 Phase C1 — Emulator Foundation & Mobile Hardening

Status: **ACCEPTED — EMULATOR SCOPE**

Date: 2026-09-11

This report closes Phase C1 under the explicit emulator-only acceptance decision. It does not claim physical-device evidence and does not authorize C2, Play release work, production signing, an AAB upload, Phase D, iOS work, or an L20 tag.

## Ownership and revisions

- Accepted frontend baseline: `d6eaec8f15f8d96dbb22e67cba0b227ca2b3cf7a` on `l20/android-foundation`.
- Accepted backend baseline: `15658a9fed2104fbfd635aa3c433024352435c36` on `l20/android-support`.
- C1 implementation: `9b1f36f4d1ebab707d9620ebaabcf439544e36f6` on `l20/android-foundation`.
- Application ID: `com.waffleberry.legarya`.
- Minimum / target / compile SDK: 24 / 36 / 36.
- Bundled origin: `https://localhost`; no `server.url` is present.
- Work was performed in the isolated frontend worktree. The original dirty worktrees were not reset, staged, or modified. The backend was not changed.

Phase A and the accepted Phase B closure report were read before C1 work. Phase B remains the authority for the already-completed production authentication, native Google Sign-In, refresh-cookie rotation, authenticated WSS, private-media, and feature-parity acceptance.

## Emulator matrix

| Profile | Runtime result |
| --- | --- |
| API 36 phone, Google APIs, x86_64 | Primary acceptance profile. Android 16, 1080×2400 at 420 dpi, CSS viewport 412×842, WebView/Chrome 133. Final exact-commit APK installed and launched. |
| API 33 phone, Google APIs, x86_64 | The existing AVD remained `offline` while QEMU consumed host CPU. It was stopped without wiping its data. No LegaRya result is claimed for this AVD. This is the single unstable AVD explicitly allowed by the C1 decision. |
| API 24 phone, Google APIs, x86_64 | Android 7.0, 1080×1920, CSS viewport 360×568. The app launched in 4.3 seconds. The Chrome 69 user agent selected the intended static-Rya compatibility path; no runtime error or horizontal overflow was observed. The system WebView package was version `53.0.2785.124`. |
| API 36 tablet, Google APIs, x86_64 | Optional tablet profile ran at 2560×1600, 320 dpi, CSS viewport 1280×744. The final layout had no horizontal overflow, clipped controls, unsafe fixed controls, or sub-40 px interactive targets. Repeated cold launches under headless SwiftShader produced focus-event ANRs after the activity had drawn; this was isolated to the high-resolution headless tablet and classified as host/render saturation, as directed by the C1 prompt. |

No AVD was wiped or recreated during closure. The API 33 stored state was preserved.

## APK identity

- Path: `android/app/build/outputs/apk/debug/app-debug.apk`
- Size: 8,357,523 bytes
- SHA-256: `706372d4d47909614e2479d9d8fb84309403deeb7de1c57f65d9081b6d79d0cb`
- Embedded frontend SHA: `9b1f36f4d1ebab707d9620ebaabcf439544e36f6`
- Embedded application ID: `com.waffleberry.legarya`
- Embedded origin: `https://localhost`
- Bundle: 128 content-addressed files plus the asset manifest (129 total bundle files)
- Alignment: `zipalign -c -P 16 -v 4` succeeded.
- Signature: one Android debug signer; APK Signature Scheme v2 verified. The debug SHA-1 remained `BB:0F:39:1E:73:5A:BF:F3:5C:B4:03:D9:2F:CF:37:0E:74:0A:EE:28`.

The final APK is a debug artifact only. No production key was created or used.

## Build and backend health

- The Android bundle was rebuilt from the accepted source graph and synchronized through Capacitor.
- The final bundle contains no developer server, animated Legacy portrait runtime, or web Google Identity script.
- `https://89-167-14-211.sslip.io/health` returned HTTP 200 before the network-loss test and again after recovery.
- Runtime resource inspection found no cleartext resources, dev-server dependency, or external top-level origin.

## Authentication and session sanity

The C1 changes do not touch authentication, cookie rotation, Google identity, token handling, or account switching. The full native Google acceptance was therefore not repeated, per the C1 instruction. The accepted Phase B evidence remains applicable to the exact inherited authentication implementation and proves normal production login, native Google Sign-In, refresh, force-stop restore, logout/re-login, account reselection, Android CORS, authenticated WSS, and safe cancellation.

C1 revalidated the surrounding contracts:

- the final clean install opens signed out and stores no access token in local or session storage;
- session restoration, concurrent refresh, cleared-session fencing, logout, and Back/history protection remained green in the complete frontend suite;
- ten Home/resume cycles kept the same process, ended foreground-sensitive ownership, and left the app coherent;
- root Back exited to the launcher and a subsequent launch returned cleanly;
- production health failure/recovery did not create token or dialog state.

No password, ID token, refresh cookie, or account credential was read, requested, searched for, or printed during C1.

## Responsive UI, IME, Back, and system UI

### Phone

- API 36 portrait: 412×842 CSS px, document width 412, no horizontal overflow, no horizontally clipped control, no unsafe fixed control, and zero undersized controls in the final exact-commit APK.
- API 36 landscape auth: 866×364 CSS px, no horizontal overflow or clipped fixed control.
- API 24 compatibility: 360×568 CSS px, no horizontal overflow; the static visual fallback activated as designed.
- API 36 tablet: 1280×744 CSS px, no horizontal overflow and zero undersized interactive controls after the C1 touch-target fix.
- Normal and 1.3× Android font scales completed without horizontal overflow. The larger-font page height expanded instead of clipping text.

### IME

- Focusing the login email field reduced the visual viewport from about 842 px to 530 px.
- The focused input bottom remained at 471 px, above the keyboard boundary.
- A synthetic non-account address was used; no real credential was entered.
- Hardware Back dismissed the keyboard and restored the full viewport.
- The shared Android keyboard listeners and the protected chat/editor IME contracts remained covered by the complete suite.

### Back and bars

- DocumentsUI and Photo Picker both returned safe cancellation on Back.
- Root Back returned to the launcher; relaunch was clean.
- The ordered Back implementation for live voice, dialogs, drawers, nested history, and app exit remained unchanged and its regression tests passed.
- The API 36 content viewport remained inside status/gesture navigation bounds. Fixed controls stayed inside safe areas in portrait, landscape, and tablet layouts.
- Three-button navigation and cutout simulation were not needed to resolve a reproduced defect and are not claimed.

## Accessibility baseline

C1 found and fixed small coarse-pointer targets on the homepage:

- language selectors are now at least 44 px high;
- phone and tablet wordmark, navigation, footer, scroll cue, ambience cue, and ambience toggle targets are at least 44 px in their relevant dimension;
- the microphone settings recovery action is keyboard-focusable and at least 44 px high;
- final API 36 phone and tablet inspections reported zero interactive targets below the audit threshold.

Major controls retain labels and visible focus styles. This is an emulator accessibility baseline, not formal certification. TalkBack was not used for a full screen-reader audit.

## Static Legacy display-picture rule

The permanent static Legacy DP rule remains intact:

- the bundle includes the static display-picture clients;
- historical L19 animated portrait files are excluded from the Android asset graph;
- runtime resource inspection found no animated portrait module;
- L15 product tests keep the static Legacy portrait path and exclude lip sync, talking-head, blink, mouth, or facial-deformation behavior;
- missing/revoked private images remain fail-closed with the existing safe fallback and disposal fences.

No animated Legacy portrait behavior was introduced.

## Rya emulator performance

- API 36 phone retained the current Rya canvas and produced no Rya diagnostic errors.
- During a 30-second bounded, visible, headless SwiftShader run, generic `requestAnimationFrame` sampling reported 136 callbacks (4.5 fps) and process PSS stayed between 121,495 and 123,590 KiB.
- A separate 10-second sample without memory polling reported 5.2 callbacks/second.
- These callback rates describe the saturated headless software-rendering host, not physical-device frame rate. They are not thermal or battery evidence.
- There was no runaway memory trend, repeated WebGL/context error, crash, or app-process death on the primary phone.
- API 24 correctly selected static Rya instead of attempting the modern renderer.

The optional 2560×1600 tablet focus ANRs are recorded in the emulator table. They do not override the healthy primary-phone run under the prompt’s explicit host-instability rule.

## Photo and document pickers

### Photo Picker

- Android Photo Picker returned scoped `content://media/picker/...` URIs for a synthetic JPEG and WebP.
- A valid PNG was selected through Android DocumentsUI and the browser file surface.
- Back cancellation rejected with `PICKER_CANCELLED` and returned to LegaRya without changing app state.
- Repeated selections succeeded.
- The manifest still requests neither `CAMERA` nor broad gallery/storage permission.

### DocumentsUI / Storage Access Framework

- A native document selection returned only sanitized `{scheme: "content", mime: "image/png"}` metadata.
- A 51,380,650-byte PDF with a Unicode filename was selected through the real browser/SAF bridge as `application/pdf`.
- A synthetic TXT fixture and an unsupported binary fixture were present for picker/validator coverage; product validation and unsupported-type tests remained green.
- Back cancellation returned `PICKER_CANCELLED`.
- The implementation uses scoped content URIs and has no raw public filesystem assumption or broad storage permission.

All fixtures contained synthetic QA data only.

## Large-file profiling and architecture decision

Two fixtures were generated immediately below the configured product limits. No limit was raised.

| Fixture | Selected metadata | Stream result | LegaRya PSS during yielded stream |
| --- | --- | --- | --- |
| Valid PNG | 19,805,283 bytes, `image/png` | all bytes read in 17 bounded chunks; largest chunk 2,097,152 bytes; 660 ms including deliberate event-loop yields | 119,876–120,657 KiB (781 KiB observed range) |
| Unicode PDF | 51,380,650 bytes, `application/pdf` | all bytes read in 39 bounded chunks; largest chunk 2,097,152 bytes; 1,309 ms including deliberate event-loop yields | 124,496–125,008 KiB (512 KiB observed range) |

The first native content-URI handoff of the image showed an approximately file-sized transient PSS increase before garbage collection. Repeating the actual WebView `File.stream()` reads after collection kept PSS essentially flat and never created an in-memory base64 representation. The process survived, remained responsive, and repeated reads completed.

Decision: **A — retain the existing WebView File/Blob path.** Evidence does not justify a new Android `ContentResolver` upload edge. The existing client continues to send the raw `File`/`Blob` through the same authenticated L16 reservation, authorization, idempotency, content, and cleanup contracts. Those request contracts and retry fences passed in the suite.

A fresh authenticated production upload/server response was not repeated after the clean install because C1 did not change authentication or the accepted L16 server contract. Phase B production/private-media evidence and the unchanged authenticated raw-transfer tests are the authority for that boundary. No Android-specific backend or storage path was added.

## Private media and temporary-file cleanup

- The accepted Phase B evidence remains authoritative for authenticated private display, static Legacy DP, private source viewing, role checks, logout, and account cleanup.
- Automated disposal tests covered 50 call lifecycles and 100 private load cycles with zero retained resources.
- C1 runtime cleanup reported zero Blob images, zero Blob links, zero open dialogs, zero live-call surface, and no persisted access token.
- App external storage contained zero files.
- The final app-private inspection found 336 KiB of ordinary cache, 16 KiB of files, and 8 KiB of code cache; there was no media-like file and no file above 1 MiB.
- All six emulator fixture targets were removed from public Downloads after testing. All eight local generator/harness/fixture files were removed from the workspace.
- No private/customer media was written to Gallery, public Downloads, or shared external storage by the app.

The current product has no FileProvider/Open With flow requiring expansion in C1.

## Lifecycle and simulated display lock

- Ten bounded Home/resume cycles kept the same app PID. Lifecycle generation advanced, foreground state returned true, DOM/listener counts did not grow, and PSS remained about 124 MiB.
- Arming L15 microphone ownership and requesting transient voice-communication focus succeeded in the foreground.
- Emulator screen-off changed Android wakefulness to `Asleep` and produced `abandonAudioFocus()` for LegaRya.
- After wake/unlock, no microphone owner, live surface, Blob URL, dialog, or access token was present; microphone ownership did not restart.
- Force-stop/start and root Back/relaunch returned to a coherent clean landing state.

This is emulator lifecycle evidence only, not physical lock-screen microphone proof.

## Microphone permission and voice plumbing

### Permission behavior

- `RECORD_AUDIO` was not granted at final app startup and no prompt appeared before a voice action.
- The real Android permission dialog was exercised for denial and foreground-only grant.
- C1 found a first-grant lifecycle race: Android could deliver the permission result just before `onResume` restored the foreground flag. The plugin now waits for the ordered foreground handoff for at most one second and still fails closed for a truly backgrounded app.
- The first grant then returned an armed L12 owner successfully on the first attempt.
- Denial returns `MICROPHONE_DENIED`; L12 and L15 now keep text chat usable and offer one explicit, accessible Android app-settings recovery action.
- The app-settings action opened Android's application details/settings surface.
- `CAMERA`, media-read, and legacy external-storage permissions remain absent.

### L12 emulator smoke

- Android permission/ownership gating initialized correctly.
- `navigator.mediaDevices.getUserMedia`, `MediaRecorder`, and the supported recording path were present.
- The headless virtual input returned `NotReadableError`; this is the explicitly permitted emulator-audio limitation.
- The request/transcript, editable-unsent composer, failure copy, and cleanup contracts passed in the L12 regression tests.

### L15 emulator smoke

- Capability/session/ticket/WSS/silent open-end remain accepted Phase B evidence because no L15 transport or auth code changed.
- C1 revalidated the local Android boundary: microphone ownership armed, transient audio focus was granted, `AudioContext` entered `running`, `/js/realtime-worklet.js` loaded, the context closed, focus was released, and screen-off cleanup abandoned focus.
- Live Voice UI/settings recovery and static Legacy portrait tests passed.
- No real acoustic quality, latency, echo, or barge-in conclusion is made.

## Network loss and recovery

- Before disconnection, the production health request returned HTTP 200.
- Emulator airplane mode caused the request to fail with `TypeError`; the app retained coherent UI and no token/dialog/blob state.
- Airplane mode was disabled and Wi-Fi restored. Production health returned HTTP 200 after Android connectivity recovered.
- Authentication/session regression tests confirm a failed request cannot restore a cleared session or corrupt the current account epoch.

No full voice-transition soak was run in C1.

## Resource soak

- Ten real emulator Home/resume cycles completed with one stable app process and no listener/DOM growth.
- Multiple real picker select/cancel cycles covered document, JPEG, WebP, PNG, and repeated file streaming.
- The complete suite exercised the product's media, navigation, stale-scope, logout, account-epoch, WSS/audio disposal, and retry/idempotency fences.
- The dedicated private-resource test completed 50 call cycles and 100 load cycles with zero resources retained after disposal.
- The primary final process had zero fatal-exception log lines and zero credential-like log lines.

Fresh authenticated DP/chat navigation and login/logout repetitions were not unnecessarily replayed after the clean install; accepted Phase B runtime evidence plus the unchanged, passing navigation/session/disposal tests cover those paths.

## Security and privacy

- Final source scan found zero files matching private-key, AWS-key, OpenAI-key, or database-URL secret patterns.
- Final app-process Logcat scan found zero fatal and zero credential-like lines.
- Three earlier tablet log matches containing `RefreshToken` were Google Play Services semantic-location job names, not LegaRya output or credentials.
- No token appeared in a URL, no ID token or refresh cookie was printed, and no access token was persisted in web storage.
- Cleartext remains disabled; runtime resources were HTTPS/local only.
- The trusted WebView origin, allowlisted navigation, app-link routing, no-user-CA trust, no-backup, private file paths, and debug-only WebView debugging policy remain unchanged.
- No production signing key or customer data was used.

## Tests

| Gate | Result |
| --- | --- |
| Frontend complete suite | **370 passed, 0 failed, 0 skipped** after the final C1 changes. |
| C1 targeted Android/L12/L15 suite | **27 passed, 0 failed**; final Android bundle subset **8 passed, 0 failed**. |
| Android unit + lint + APK + test APK | `testDebugUnitTest lintDebug assembleDebug assembleDebugAndroidTest`: **BUILD SUCCESSFUL**, 571 tasks. |
| Final exact-commit APK rebuild | `assembleDebug`: **BUILD SUCCESSFUL**, 243 tasks. |
| Connected instrumentation | Gradle reached `Starting 1 tests` but the headless runner did not complete within three minutes and was stopped. A second direct invocation was not run because the environment's security review rejected the credentialed refresh request. The same test passed 1/1 in accepted Phase B. This is the explicitly non-blocking test-harness condition, not a product assertion. |
| APK inspection | Alignment passed; v2 signature verified; embedded SHA/origin/application ID matched. |
| Diff hygiene | `git diff --check` passed. |
| Backend | No backend code changed, so backend suites were not rerun. |

## C1 fixes

1. Fixed the Android first-microphone-grant foreground race with a bounded, fail-closed resume handoff.
2. Added a native application-settings action and explicit L12/L15 recovery UI for denied microphone permission.
3. Preserved text chat when microphone permission is denied.
4. Raised phone/tablet coarse-pointer language, brand, navigation, footer, scroll/ambience, and sound-toggle targets to a reasonable 44 px baseline.
5. Added focused regression coverage for the native settings bridge, permission lifecycle behavior, L12/L15 copy/action, and homepage touch targets.

## Deferred Physical-Device Validation

The following were not truthfully validated because no physical Android device is available. They are not C1 blockers under the current acceptance decision:

- real microphone quality and sensitivity;
- real speaker echo and acoustic feedback;
- barge-in under real acoustics;
- true capture, network, playback, and end-to-end latency;
- Bluetooth routing and Bluetooth permission/OEM behavior;
- wired-headset routing;
- phone-call interruption;
- alarm interruption;
- manufacturer/OEM-specific audio-focus behavior;
- physical lock-screen microphone behavior and privacy indicator timing;
- physical camera/gallery/provider integration;
- thermal behavior;
- battery use and background power policy;
- physical-device WebView/GPU performance;
- OEM WebView, launcher, permission-dialog, navigation-bar, cutout, and lifecycle quirks.

## C2 remaining

Do not start C2 from this report. Future work may be split as directed:

- **C2A — Astra/high reasoning hardening without hardware:** advanced Live Voice state-machine, reconnect, ordering, stale-generation, playback/capture ownership, and security review that is safely testable without acoustics.
- **C2B — physical-device validation:** real echo/feedback, barge-in, latency, microphone/speaker quality, Bluetooth, wired headset, calls, alarms, OEM focus, lock-screen behavior, thermal, battery, and real-device WebView performance.

## Boundaries confirmed

- No Play release or Play Console action.
- No production signing.
- No AAB creation/upload.
- No account-wide deletion work.
- No AI-response reporting work.
- No Phase D.
- No iOS work.
- No L20 tag.
- C2 was not started.

Phase C1 is **ACCEPTED — EMULATOR SCOPE**.
