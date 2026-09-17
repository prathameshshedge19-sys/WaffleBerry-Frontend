# L21.4 Preserved Voice Playback UI

Status: **ACCEPTED**

The owner READY state now offers a fixed server-authored cloned preview. Legacy
assistant messages use the conversation/message-authorized preserved-speech
endpoint and disclose `Preserved AI voice`; no-profile or pre-playback failure
uses `Standard AI voice` for the same persisted text.

Polling is bounded to 40 attempts. Generated audio is fetched only through the
authenticated exact job-content route. Blob URLs are revoked after playback
and on logout, session expiry, Legacy switch, navigation, or backgrounding.
Generated Legacy speech is not retained in the ordinary audio cache, so every
explicit replay reauthorizes before private content is read.
Internal profile/version/reference identifiers, object keys, model names, and
custom preview text never enter UI state.

Rya continues to use the existing `/voice/synthesize` path. No realtime/L15 or
native Android permission code changed. The existing deterministic Android web
bundle includes both modified frontend modules.

Human listening of the fixed owner preview, natural Marathi output, and
Marathi-English output is complete and acceptable for speaker similarity,
accent, tone/intonation, naturalness, and intelligibility, with no material
robotic or metallic artifacts. The Marathi-English Whisper similarity of
0.4348 remains a documented automated-ASR limitation, not an acceptance failure
or a frontend playback failure. This acceptance is scoped to the tested samples
and configuration; it is not a universal speaker or language quality
certification.
