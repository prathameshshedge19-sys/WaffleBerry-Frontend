# L21.5 Live Preserved-Voice UI

Status: **ACCEPTED — CORRECTNESS**

The existing Live Call UI and `RealtimePlayback` remain authoritative. The
backend continues to send the accepted `assistant_started`, `assistant_audio`,
and `assistant_audio_end` sequence; L21.5 adds only a bounded public delivery
label on the start event.

In Legacy mode, the existing disclosure changes to either:

- `AI Legacy · Preserved AI voice, grounded in preserved memories.`
- `AI Legacy · Standard AI voice, grounded in preserved memories.`

The client accepts only `preserved` or `standard` plus a lowercase SHA-256
authoritative-text digest. It rejects any assistant event containing a private
profile ID, profile-version ID, reference ID, model name, or storage key. The
browser never selects a profile, version, provider, model, or reference.
The audit extends rejection to private aliases including model path and
reference transcript. Delivery metadata is emitted only after playback accepts
the matching response; a stale start cannot alter the current disclosure.
Identical duplicate metadata is idempotent; conflicting metadata for the same
response is rejected. Completion, interruption, stop, finish, socket retirement,
logout and account/Legacy changes clear the previous delivery disclosure.

Audio still uses the existing mono 24 kHz PCM playback, output ownership,
generation fences, local barge-in, Stop speaking, End Call, progress/drain
receipts, and explicit reconnect behavior. Logout, account change, Legacy
change, page lifecycle, socket retirement, and stale callbacks synchronously
retire the old playback state. Rya continues on its existing path.

The Legacy portrait remains the same static display picture. No lip sync,
mouth motion, blink, talking head, WebGL behavior, camera permission, storage
permission, background microphone, or new media permission was added.

The final independent-audit frontend run passed **436 tests**. The old 100-cycle
and reconnect loops exercised Rya, not the new seam. New Legacy-mode tests now
explicitly exercise 100 synthesis/playback retirements with 600 late callbacks,
50 preserved-voice reconnect/explicit-resume cycles, old-generation disclosure,
logout/account/Legacy fencing and six additional private-field aliases. These
are deterministic client protocol tests, not 100 GPU inference calls. Backend
audit tests separately exercise 30 actual controller synthesis cancellations
and the real renderer/job/worker/PCM/receipt chain using a deterministic engine.
Microphone ownership, barge-in, receipt integrity, malformed/duplicate events,
static portrait and Rya regressions remain green.

The final deterministic Android sync produced 131 files; native unit, lint and
debug APK tasks passed (370 tasks). The APK contains 656 entries, no model/QA
audio/database and no new permission: INTERNET, RECORD_AUDIO and the existing
private receiver only. `DebugProbesKt.bin` is Kotlin metadata, not a voice model.
The prior API-24 emulator smoke remains inconclusive due to graphics startup;
this is not a product assertion failure or proof of physical playback. Static
cache keys remain bumped for later authorized publication.

Previously measured worker-component speech readiness on the accepted GTX 1650
was about 30.6–32.6 seconds for two successful fixed-text live-purpose jobs,
versus one 2.406-second real standard TTS call. The script bypassed the realtime
brain/browser and reused that standard result for two fallback labels; these
are not measured end-to-end Live Call latency or independent fallback runs.
The backend audit document details the evidence limits and reproduced tests.
The UI does not hide that delay with speculative speech or chunking. Full
latency qualification and any safe pipelining remain L21.6. No IndicF5 setting
was changed and no L21.6 implementation was started.

Both worktrees remain uncommitted at the published L21.4 HEADs. The audit did
not commit, push, merge, tag, deploy or migrate production.
