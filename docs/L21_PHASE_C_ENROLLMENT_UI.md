# L21.3 Preserved Voice UI

Status: L21.3 ACCEPTED. The changes remain uncommitted and undeployed.

This uncommitted `l21/voice-cloning` worktree adds the selected Legacy owner's
small `Preserved Voice` settings dialog on backend capability opt-in. It supports
bounded MediaRecorder capture and the reviewed audio/video picker, exact
server-provided consent, status polling, replacement, activation, and deletion.
Collaborators and visitors neither see management nor probe the voice endpoint.

Session epoch, selected Legacy, navigation generation, and abort signals fence
all responses. Background/session/navigation events stop microphone tracks and
polling. Replacement keeps the current voice active and continues polling the
candidate. There is no playback or cloned preview in this phase.

Android reuses existing `RECORD_AUDIO` and the shared microphone owner. The SAF
picker accepts only the complete reviewed MIME set from the foreground trusted
chat page; broad media/storage/camera permissions and capture-mode file intents
remain denied. See the backend L21.3 report for pipeline and test evidence.

## Closure evidence

- Rendered Chrome 152 owner acceptance passed exact consent/authority gating,
  upload, progress/READY, exact candidate activation, replacement, deletion,
  record cancellation, short-record rejection, bounded recording upload, and
  close/reopen behavior. Legacy switch, logout, and navigation fenced stale
  polling. Collaborator and visitor management remained absent and returned
  404. No unexpected console error or private data leak appeared.
- The API 36 Google APIs `l20_api36_phone` AVD opened real DocumentsUI with
  `ACTION_OPEN_DOCUMENT`, selected reviewed MP3 and MP4 fixtures as scoped
  `content://` results, and cancelled safely. Capture mode and untrusted origins
  failed closed; broad storage/media and CAMERA permissions remained absent.
- The emulator's real `RECORD_AUDIO` permission path passed. With virtual input
  unavailable under `-no-audio`, deterministic in-WebView media input exercised
  the real shared owner and lifecycle code: L12/L15 were excluded, cancel,
  Home, lock, session end, and Legacy switch each stopped capture, and resume did
  not restart it. This does not claim physical-device audio quality.
- Acceptance fixed two narrow defects: dialog reopen now clears stale prior
  Legacy status while loading, and Android uses an exact mixed-MIME SAF picker
  with scoped-result and returned-MIME validation. Both have regression checks.
- Final evidence includes six passing PostgreSQL-specific tests, 422 passing
  frontend tests, Android unit/lint/debug APK/androidTest APK builds, and clean
  syntax, diff, secret, and artifact scans.
