# Local developer-page auth integration

Scope: local developer-page UI only. No shared authentication, backend, cookie,
realtime admission, audio, New Chat or L12 implementation changes. No commit,
push or deployment.

## Root-cause evidence and its limit

The old developer page passed login errors straight through to its live status.
The unchanged shared `auth-api.js` maps every HTTP 401 to “Your session has
expired. Please sign in again.” This includes `/auth/login` returning
`Invalid email or password.` In that reproduced failure, the first failing step
is login itself: no access token or refresh cookie is issued. It is not a lost
post-login token. The page also lacked initial session restoration/verification
and allowed microphone controls without a verified session.

The user confirmed using the disposable account. Valid disposable credentials
return 200 against the current backend and through the actual shared JavaScript
client. No browser is connected to the agent's Browser runtime, so the user's
original rejected browser request could not be captured. The reason that exact
request was rejected remains unverified; this report does not assume the user
entered a wrong password or claim a proven cookie/token-loss cause.

## Verified flow

| Check | Observed result |
|---|---|
| Frontend | `http://127.0.0.1:5500/realtime-dev.html` |
| Shared API base | `http://127.0.0.1:8100/api/v1` |
| Login | 200; standard `access_token`, `token_type: bearer`, `user` response |
| Token storage | Shared client stores the access token in its JS closure; never in localStorage |
| Cookie | Host-only `127.0.0.1`, HttpOnly, Path `/api/v1/auth`, SameSite=Lax, Secure=false in the existing local test configuration |
| CORS | Explicit origin `http://127.0.0.1:5500`, allow-credentials true; preflight 200 for login, `/auth/me` and realtime authorization |
| Request credentials | Existing shared fetches use `credentials: include` |
| Authenticated `/auth/me` | 200 after shared login stores the token |
| Realtime authorization | 201, using the shared client's Bearer token; refresh cookie is correctly not sent outside its `/auth` path |
| Provider handshake | Local TCP WebSocket reaches `ready` |
| Reload simulation | Fresh shared-client instance restores via refresh-cookie POST 200, then `/auth/me` 200 |
| Missing cookie | Clear sign-in prompt; no false immediate-expiry message |
| Silent call | Ended successfully; conversations/messages/turns stayed 0 → 0 |

The end-to-end JavaScript check ran the real shared scripts against the live
local backend in a VM test harness. Its cookie transport uses only cookies
issued to that test; it does not inspect an actual browser's session. It proves
the shared client/backend integration, not browser microphone or browser cookie
policy acceptance. Evidence: workspace `backups/l15-phase-c/dev-auth-live-result.json`.

## Changes

- `realtime-dev.html`: separate auth status and sign-in panel; protected controls
  start disabled; local test-account explanation; developer module cache version.
- `js/realtime-dev-auth.mjs`: small UI coordinator delegating login and session
  verification entirely to `LegaryaAuthApi`. No fetch/token/cookie implementation.
- `js/realtime-dev.mjs`: bind the coordinator; verify before protected actions;
  enable Start microphone only after `/auth/me` succeeds.
- `tests/realtime-dev-auth.test.mjs`: rejected-login reproduction, login/verification
  ordering, shared refresh restoration, missing-cookie fallback, bootstrap/login
  race prevention, failed post-login verification and disabled-control contracts.
- This report.

Initial restoration finishes before login is allowed, preventing a late failed
restoration from clearing a newly issued access token. Rejected login and failed
post-login verification now have different page-local messages. The production
shared client's behavior remains unchanged.

## Validation and remaining acceptance

- Frontend: 103 passed, zero failed/skipped.
- Backend auth + realtime foundation + transcript regression: 84 passed,
  zero failed/skipped; two pre-existing dependency warnings.
- Changed JavaScript syntax checks and Git whitespace checks passed.
- No backend source changes in this auth-fix task.
- The user confirmed the disposable-account sign-in worked after receiving the
  test password. The agent Browser runtime has no available browser.
- The local test now contains exactly one realtime_voice turn linked to one user
  Message in one bound conversation. Normal history refresh returns 200 and that
  one Message. There is no assistant Message and all canonical effect counts are
  zero. The saved content is not the exact jasmine acceptance sentence, so that
  specific human speech gate remains unconfirmed.
- A subsequent silent-call protocol check passed with conversation, Message and
  turn counts unchanged at 1 → 1.

Reload the developer page and use `l15-mic@example.com` with the previously
provided disposable test password. Success is explicitly reported as
“Signed in as l15-mic@example.com. Microphone test ready.”
