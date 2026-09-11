# L20 Phase C2A — Advanced Live Voice State & Security Hardening

Status: **ACCEPTED — SOFTWARE-VERIFIED (C2A)**

Date: 2026-09-12. This report covers C2A only. Physical audio and OEM behavior are **PHYSICAL HARDWARE NOT VERIFIED**, deferred to C2B.

## Accepted baselines and ownership

- Frontend: `l20/android-foundation`, starting local and freshly fetched remote SHA `245f01e2dbe15c025b1b869c38dfc9bea9ec5603`.
- Backend: `l20/android-support`, starting local and freshly fetched remote SHA `15658a9fed2104fbfd635aa3c433024352435c36`; unchanged by C2A.
- C2A implementation: `2a645409757667df2f7874dad8d48c43f060a448`.
- Existing isolated worktrees were clean before edits. Other worktrees were not reset, staged, merged, or changed.
- Read the authoritative Phase A report from `WaffleBerry-Backend/backend/docs/L20_PHASE_A_ANDROID_ARCHITECTURE.md` (the uncommitted original report is absent from the isolated backend), and the accepted frontend Phase B and C1 reports.
- Application remains `com.waffleberry.legarya`, SDK 24 / 36 / 36, bundled origin `https://localhost`.

## State and transition map

The existing client and product UI remain separate small state machines; no framework or replacement protocol was introduced.

| Logical phase | Implementation / allowed transition |
| --- | --- |
| IDLE | Client `idle`; explicit Start establishes immutable scope, account epoch and new client epoch. Duplicate Start rejects before allocating resources. |
| ARMING_AUDIO / REQUESTING_PERMISSION | Client `starting`: resume AudioContext, finish existing L12 handoff, acquire exclusive output, arm Android permission/focus, acquire microphone. Every awaited completion is fenced. |
| CREATING_SESSION / CREATING_TICKET | One authenticated POST returns both session and initial one-use ticket. There is no separate initial ticket endpoint. Request aborts on invalidation and times out after 12 seconds; no automatic POST retry. |
| CONNECTING | Ticket is sent once in the first socket message. `connecting` is informational. A validated `ready` binds session and server connection generation. Handshake timeout is 12 seconds. |
| CONNECTED / LISTENING | One heartbeat, one capture stream and worklet; local listening/mute/energy events update the UI. |
| USER_SPEAKING / BARGE_IN | Worklet `speech_started` clears local playback before sending its bound interrupt, then returns to listening. Server VAD remains independently authoritative. |
| WAITING_FOR_ASSISTANT | `transcript_final` binds the durable conversation once; playback `begin` emits `thinking`. |
| ASSISTANT_PLAYING | Ordered PCM is scheduled on the AudioContext clock; `speaking` starts at playback time. Output receipts still wait for device-clock latency/drain. |
| RECONNECTING | Unexpected close retires the connection/capture epoch while retaining session/scope/receipts. The UI makes one reconciliation attempt with a fresh ticket, then requires explicit Resume microphone. |
| ENDING | End synchronously retires capture, playback, callbacks and call state. A detached socket can only finish its own shutdown, allowing the existing 2.5-second server finalization window. |
| ENDED / ERROR | No active voice resources. UI returns to chat or shows existing safe recovery copy. A new explicit Start creates a new epoch. |
| Logout / account / Legacy / page change | Identity or context is retired synchronously; old private preview, portrait, socket and asynchronous results cannot populate the replacement surface. |

The server separately maintains `authorized`, `connecting`, `connected`, `reconnecting`, and terminal `ended`/`revoked`/`failed`, with actor locking, lease ownership and connection-generation checks.

## Enforced invariants and epoch model

1. One active call per client; the shared output/microphone locks prevent competing instances or L12 from owning the same audio resources. The server independently enforces one active call per actor and creation rate limits.
2. A callback must belong to the current client epoch, account session epoch, and socket or audio object. Disconnect retires the old epoch before notifying UI.
3. The UI additionally checks its serial, Legacy/mode/navigation snapshot and account epoch. Saved-history adapters check those guards both before and after fetch.
4. End is terminal for its generation. Its detached shutdown completion never calls `invalidate()` on a newer call. Repeated cleanup is safe.
5. Logout/account change clears private receipt, preview and portrait state and prevents old capture, playback, history refresh, capabilities or pending grants from restoring it.
6. Legacy/context changes terminate the call; voice sessions never silently migrate between Legacies.
7. Background, page exit and focus loss end sensitive activity. Foreground/focus gain cannot start audio.
8. Initial/reconnect tickets stay in memory, are removed from the grant object, sent once, and cleared on use or cancellation. No credential is put in a URL, storage, telemetry or log.

The client epoch is also a connection/capture fence, so it advances on disconnect within the same server session. Server connection generation and response/turn binding remain separate protocol authorities; no fictitious total-order sequence was added.

## Races, reentrancy and cleanup

**SOFTWARE-VERIFIED:** pending AudioContext resume, output lock, microphone permission, session response, worklet load and reconnect-ticket completion are injected after End/logout/context invalidation and after a replacement starts. Old open/close/message, heartbeat, worklet and playback-ended callbacks cannot change the replacement.

Double Start allocates one session/socket. Double Resume acquires one stream. Repeated End sends at most one end control for a socket. End during connecting closes immediately; End while connected retires application state immediately and waits only for its own bounded shutdown. Logout during that wait closes the detached socket too.

Cleanup stops tracks, removes track listeners, stops/disconnects worklet and source nodes, detaches worklet callbacks, closes AudioContext, cancels playback sources/timers, releases output/focus ownership, cancels HTTP requests/handshake/heartbeat timers, and clears private receipt/session state. L12 context invalidation aborts transcription, rejects late permission results, retires TTS requests/results and revokes cached Blob URLs. Its audio cache is bounded at 32 entries.

Browser `getUserMedia` itself cannot be forcibly cancelled. If its permission/result is still pending, the shared reservation stays held until the browser settles it; a returned stale stream is immediately stopped. Competing acquisition fails safely in that interval. This deliberately bounds outstanding acquisitions to one instead of allowing overlapping prompts/captures. A POST already accepted by the server can also leave an unused authorized session until its short ticket expiry; no Conversation is created by that grant.

Saved-history refreshes now coalesce concurrent demand, have a 12-second timeout, propagate AbortSignal, and check the call guard after response. They cannot leave End/reconciliation in an infinite refresh spinner or apply old-call history to a newer call in the same chat.

## L12/L15, playback and focus

- L12 pending permission is an explicit `requesting` state; rapid clicks cannot create multiple recorders.
- L15 preserves the existing handoff of an active L12 dictation into review/transcription. Pending permission fails safely; an invalidated L15 stops waiting for that handoff.
- The shared microphone boundary checks cancellation, account and navigation at lock, native permission/focus and browser-stream boundaries. Native focus release completes before that reservation is reusable.
- L12 transcription/TTS after logout cannot append text or create a private URL. An old audio `play()` rejection cannot release a newer output lock.
- Existing playback binding, contiguous frame order, retired-response tombstones, 20-second outstanding PCM and 512-source bounds remain intact. Duplicate starts/finals cannot double-play or double-acknowledge; discontinuous/duplicate PCM fails closed.
- Local barge-in clears playback before interrupt dispatch. Delayed drain/completion, old PCM, End and disconnect cannot revive retired audio. This is event/software evidence only, not acoustic barge-in acceptance.
- Native audio-focus notifications previously had no JS consumer. C2A connects loss to sensitive cleanup, tags requests/events with native generations, rejects late loss from older focus owners, and stops retaining focus events for future pages. Gain never restarts capture. The API 36 test acquires real Android focus and injects loss through the actual native listener; it does not simulate a real phone call or alarm.

## Realtime ordering and hostile events

- Duplicate `ready` is idempotent; a changed session/generation fails closed and cannot create another heartbeat.
- Final transcripts use validated message/conversation/Legacy/mode fields and a bounded 256-entry receipt map. Duplicate final receipts update their reconciliation metadata without another UI final. Provisional deltas after a retained final are ignored.
- Provisional deltas have no unique delta ID/sequence. Their preview remains bounded (four items, 1,000 characters each); C2A does not claim exact deduplication of otherwise indistinguishable deltas. Durable finals remain server-authoritative.
- Assistant events require matching session/connection generation and bounded turn/claim/response identities. Terminal notifications deduplicate in a bounded set. Output sequence gaps or forged totals fail closed through existing playback validation.
- Parsing rejects non-text/oversized messages, null/array/primitive shapes, missing or wrong type fields, invalid IDs and malformed recognized payloads. Client text messages are capped at 96,000 code units before JSON parsing; PCM and transcript limits are tighter. Unknown bounded post-ready events are ignored and never forwarded as UI control events.
- No unbounded audio queue, event history, retry loop, duplicate durable write path or arbitrary event execution was introduced.

## Reconnect and network matrix

Existing policy is one reconciliation attempt per observed disconnect, no recursive backoff subsystem and no automatic mic resume. Session/reconnect POSTs have a 12-second deadline; the server's default reconnect grace is 10 seconds. A failure ends recoverably. A close during reconciliation cannot leave a false Resume state. End/logout/Legacy change/background cancel the attempt and its ticket.

| Failure stage | Verified outcome |
| --- | --- |
| Session / initial ticket POST | Abort/timeout/failure disposes audio and returns to idle; stale result creates no socket. |
| Reconnect ticket POST | Identity/lifecycle/End cancels; late result is inert. |
| WSS handshake | Error, close or 12-second timeout closes resources and shows recoverable failure. |
| Listening | Close retires mic/worklet/context before reconciliation; new capture requires a tap. |
| Assistant playback | Disconnect, End, logout or context change stops sources and all playback timers. |
| Ending | Old socket acknowledgement/error/close and 2.5-second timer only retire that detached socket; saved-history refresh is also bounded. |

API 36 instrumentation also made a credential-free production `/health` request through a synthetic failing session-request adapter, verified idle/zero socket state, repeated it with airplane mode/Wi-Fi/data disabled, then restored connectivity and passed recovery. No real network-radio quality was measured.

## Server security and durability review

Backend behavior already satisfies this phase; no backend files or APIs were changed. Focused tests ran against isolated SQLite databases and fake providers, using the repository's existing test authentication fixtures.

- Exact origin validation retains `https://localhost` and the existing website origin. Foreign origins, `capacitor://localhost`, `file://`, query credentials and alternate credential subprotocols remain denied.
- Tickets are random, stored as SHA-256 hashes server-side, and default to 30 seconds (configured bounds 5–60 seconds, also capped by session/auth expiry). Consumption locks the actor, checks hash/origin/expiry/used state/session/access, and increments connection generation. Replay, expired/forged/wrong-origin tickets fail closed.
- Logout/revocation terminates session metadata and fences old tokens/leases. Reconnect creates a fresh ticket and invalidates older ownership. Stale workers cannot close the new server generation.
- Session authorization and silent transport create no Conversation, message or turn. Only admitted meaningful provider-final speech can atomically create/bind a Conversation. Silent failure/unfinished shutdown, logout/revocation and disconnected-session teardown do not add a conversation-creation path.
- Admission uses the existing durable provider-item key and L14 claim/terminal compare-and-swap. Replayed admission/finalization and forged/full-playback receipts cannot create duplicate messages or effects. Final user speech during the bounded server End window remains admitted once; client cleanup does not delete saved messages.
- Backend focused coverage includes silent/failed/unfinished shutdown, logout, abrupt disconnect, stale reconnect owner, ticket replay/expiry/forgery/origin, malformed/binary/oversized messages, output receipt forgery and duplicate terminal persistence.

## Soak and acceptance evidence

| Check | Result |
| --- | --- |
| Complete frontend suite | **417 passed, 0 failed, 0 skipped**. |
| New dedicated C2A suites | **46 passed**; plus one new same-chat history-fence regression in the existing product suite. |
| Rapid start/end/start | **100 deterministic loops / 200 call generations**, with **600 late callbacks**. |
| Disconnect/recovery | **50 cycles**, fresh ticket/socket and explicit capture resume; no automatic microphone. |
| L12/L15 contention | **50 bidirectional cycles**, plus pending permission/account invalidation. |
| Logout/Legacy invalidation | All five pending audio/session stages; reconnect, ending, playback and actual UI retirement; late L12 transcription/TTS. |
| Resource baseline | Zero open fake sockets, contexts, nodes, live tracks, track listeners, output locks, timers, receipts and ending operations after settled disposal. Client-owned global listeners return to zero on dispose. Pending uncancellable browser permission is separately bounded as described above. |
| API 36 instrumentation | **2/2 passed**: 20 double-call rounds (40 sockets), stale callbacks/account fence, native focus loss/stale focus, and online request cleanup. Separate offline **1/1** and restored-network **1/1** passed. |
| Android unit / lint / build | Unit tests **4 passed**; `testDebugUnitTest lintDebug assembleDebug assembleDebugAndroidTest` passed (571 tasks). Lint: **0 errors**, 26 existing warnings. |
| Focused unchanged backend | **105 passed** in realtime, transcript, response and Android-origin suites; no full backend rerun. Only dependency deprecations/cache-permission warnings. |
| Hygiene | JS syntax, `git diff --check`, explicit bundle graph/CSP/security tests, secret-pattern and bundled development-URL scans passed. |

The initial ActivityScenario instrumentation stalled on global UI-idle waiting with the continuously animated homepage. The final test uses bounded main-thread handoffs and WebView result polling, without altering production rendering or adding a JavaScript interface. Initial synthetic module/timer-binding harness errors were corrected; they are not recorded as passing runs.

## Production probes

Only credential-free `/health` transport checks were performed from the emulator, including its offline/recovery matrix. No QA/customer login, new real realtime session, live model call, token minting, production data mutation or provider-quota soak was performed. Production authenticated ticket/WSS evidence remains the accepted Phase B baseline; fresh C2A ticket/security/durability evidence is deterministic local backend regression.

## Final artifact and publication

The debug APK was rebuilt from the exact implementation commit above and the installed exact artifact passed the C2A instrumentation again: **2/2**, 32.486 seconds. The documentation-only closure commit does not change its runtime bytes.

- Path: `android/app/build/outputs/apk/debug/app-debug.apk`.
- Bytes: **8,357,523**.
- SHA-256: `1fa33a5dffde2ef9c73671ef3a1e03eec0b3607c5aae9891573b1cae22f50e95`.
- Embedded frontend SHA: `2a645409757667df2f7874dad8d48c43f060a448`.
- Embedded application/origin: `com.waffleberry.legarya` / `https://localhost`.
- All **128 asset hashes** checked against the APK's embedded manifest; all matched.
- `zipalign -c -P 16 4`: PASS. APK Signature Scheme v2: PASS; one existing Android debug signer, SHA-1 `BB:0F:39:1E:73:5A:BF:F3:5C:B4:03:D9:2F:CF:37:0E:74:0A:EE:28`.
- Final exact-source Gradle run: **BUILD SUCCESSFUL**, 571 tasks, 79 executed / 492 up-to-date.

Immediately before publication, fresh fetches still showed frontend `245f01e2dbe15c025b1b869c38dfc9bea9ec5603` and unchanged backend `15658a9fed2104fbfd635aa3c433024352435c36`. The reviewed payload is the implementation commit plus the documentation commit containing this report, only to `l20/android-foundation`, by normal non-force push. The final execution handoff records the exact local/remote documentation SHA and post-push clean-worktree verification; this document does not attempt to embed its own commit hash.

## C2B deferred — physical hardware not verified

Microphone quality/sensitivity; acoustic echo and speaker feedback; real acoustic barge-in; true end-to-end latency; Bluetooth; wired headset; real phone-call and alarm interruptions; OEM audio-focus behavior; physical lock-screen microphone/privacy-indicator behavior; thermal/battery behavior; and physical-device/OEM/WebView quirks. No emulator result above substitutes for these checks.

Legacy portraits remain permanently static. Rya remains the separate Rya identity. No C2B, Play release, production signing, AAB creation/upload, account-wide deletion, AI-response reporting, Phase D, iOS, portrait animation or L20 tag was performed.
