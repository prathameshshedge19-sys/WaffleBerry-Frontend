# L15 Live Voice product

Both builder and visitor chat pages have a separate **Start Voice Conversation**
entry. L12 dictation, editable drafts and message TTS remain separate. The entry
requires the authenticated backend capability flag, a usable Legacy, an idle
chat, and the browser APIs needed for capture, playback, ownership and a modal.
Session creation remains the authoritative permission check.

The native modal provides Connecting, Listening, Thinking, Speaking,
Reconnecting, Ending, Ended and error states. Speaking comes from the running
AudioContext playback clock. Listening requires capture. Mute disables the
capture track and flushes the worklet resampler on both mute boundaries; muted
PCM is silence. Stop speaking stops local playback before sending interruption.
No provisional assistant text is copied to normal chat.

The gold/ivory abstract Rya presence responds to input and playback energy.
Legacy mode labels the named subject **AI Legacy** and discloses the standard
AI voice. There is no human avatar or homepage ambience. Text labels, native
modal focus containment, focus restoration, visible focus, 44/48px controls,
screen-reader state announcements and reduced motion provide accessible use.

Opening a call never creates a conversation. The first server-accepted final
transcript binds its conversation ID to the existing chat state. Repeated
receipts cannot bind another conversation; navigation versions fence stale
history responses. After a call the normal message renderer loads durable
messages, including only safely completed assistant replies. A silent call
does not request conversation creation or history. Existing drafts remain.

Unexpected disconnection reconciles the existing server session once. No
audio is replayed and no accepted turn is regenerated. The user must explicitly
tap **Resume microphone** for fresh capture. A failed reconnect ends the call.
Visibility loss, page exit, AudioContext interruption and microphone loss stop
capture/playback; mobile calls are foreground-only. Authentication and network
errors use bounded product messages, never raw provider details.

Normal HTTP/auth requests retain the existing same-origin API rewrite. Live
WebSockets connect directly to the audited backend TLS proxy at
`wss://89-167-14-211.sslip.io/api/v1/realtime/connect`. The first frame carries a
single-use short-lived backend ticket; provider credentials never enter the
browser. Local hosts continue using the configured local backend. The hosted
developer page redirects to the workspace, and no production navigation links
to it. Disable the server `REALTIME_ENABLED` flag to disable the entry without
rolling back the schema or disturbing text/L12.

Automated coverage includes the existing frontend regression suite, product
policy/mute/resume/navigation tests, and separate headless Chromium checks at
1280px and 390px with synthetic audio. Those checks exercise actual AudioContext
scheduling, permission-denial recovery, focus restoration, mute/unmute, silent
end, Stop speaking, reconnect and background termination. They do not establish
physical device or human acoustic barge-in acceptance.

Chrome/Edge desktop, Android Chrome, macOS Safari and foreground iOS Safari are
the target browsers. Browser capability checks fail closed. Physical Safari,
Android, iOS and Firefox acceptance must be recorded honestly in the production
release report; viewport emulation is not a device test.

Production acceptance and checkpoint tags are a separate final gate. In
particular, no L15 completion claim or checkpoint is permitted until the human
production barge-in test has actually passed.
