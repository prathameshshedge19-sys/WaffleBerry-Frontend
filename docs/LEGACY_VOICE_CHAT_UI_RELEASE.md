# Legacy voice discovery and saved-chat UI release

## Release scope

This production-compatible frontend release builds on the accepted L20 Android
foundation and L21 enrollment UI (`c44e8e3`). It deliberately does not include
L21 message-speech routing or preserved live-call changes: the running backend
does not yet expose those routes. Existing standard message playback and live
calls keep their accepted L20 implementation.

- Show Preserved Voice to the selected Legacy's owner, labelled "Upload or
  record a voice". Other roles do not receive owner controls.
- Keep uploads, recording and activation unavailable until the server advertises
  enrollment capability. Disabled, older (404), or unavailable servers show a
  clear explanation and a retry action; they do not start capture or mutations.
- Fence settings state by account, Legacy and lifecycle, including stale replies.
- Compact sidebar actions and preserve at least 164 px for the recent-chat
  section, with a scrollable sidebar on short screens. Conversation loading,
  persistence and selection logic are unchanged.
- Use versioned CSS/module URLs for the updated assets.
- Exclude native sources, tools, package manifests and generated bundles from
  the static website deployment.

The complete L21 branch and `legarya-l21-preserved-voice` closure tag remain
unchanged. This is not full L21 operational activation.

## Operational boundary

Read-only production preflight found a 1-vCPU server with approximately 1.9 GiB
RAM, no NVIDIA device, no voice worker units and no installed pinned models.
The backend remains at its existing revision and database migration 0023. Voice
enrollment cannot safely be activated on this configuration. No customer voice
upload is accepted into an unserviced queue. Dedicated worker capacity, verified
model artifacts and the approved backend/storage lifecycle rollout remain
prerequisites. Preserved Live Call remains off; this does not start L22.

## Validation and distribution

The original isolated UI fix passed 441 frontend tests and 13 synthetic browser
scenarios each against web and bundled Android assets. This compatible release
passed **426 tests**, with zero failures or skips, plus **13 synthetic browser
scenarios for web and 13 for bundled Android**, with no page errors. The static
deployment uses an explicit, tested product-asset manifest, a dependency-free
build, and the `dist/web` output directory; native and development files are
not published. These tests do not claim real
recording, inference, physical-device testing or authenticated production QA.

Android `testDebugUnitTest lintDebug assembleDebug` passed (370 tasks). This is
a debug-signed sideload artifact, not a Play Store release. A final asset rebuild
embeds the published frontend commit before handing over the APK.

Publishing the website does not update an installed Android APK. A rebuilt APK
must be installed separately; no app-store publication or device installation
is implied by a successful website deployment.
