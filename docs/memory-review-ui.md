# Memory Review UI

**Milestone:** Phase 6.5.6  
**Page:** `memory-review.html`

## Page flow

Legacy Studio now includes **Review Memories**. When a persisted backend Legacy
ID is available, its badge shows the pending count.

```text
Companion Home
  -> Legacy Studio
  -> Review Memories
  -> Keep Memory / Edit / Remove
```

The Back control returns to the same Legacy Studio. This is a focused
candidate-review page, not the approved-memory explorer planned for Phase 6.6.

## UI states

- Loading: “Loading memories…”
- Empty: “All caught up. There are no memories waiting for review.”
- Missing persisted Legacy association: safe explanatory state
- Authentication failure: clears the existing session and returns to login
- Ownership/not found: generic message without revealing another Legacy
- Network/server failure: safe message and retry control
- Stale or duplicate edit: explanatory conflict message and refresh behavior

Cards use friendly labels including **Needs Review**, **Conflicting Memory**,
and **Related Memory**. Approval is labeled **Keep Memory**. Removing a
candidate always requires confirmation and does not imply hard deletion.

## API usage

The page reuses `WaffleBerryApi`, its Bearer token, configured API base URL,
safe error parsing, and expired-session behavior. It does not introduce another
token store or hard-code a deployment URL.

Browser-held IDs are never authorization evidence. The backend independently
checks the authenticated owner and Legacy for every list, read, edit, approve,
and reject operation.

The existing frontend Legacy flow predates persisted Memory Engine Legacies
and may contain session-only UUIDs. The page refuses to send such an identifier
as a database Legacy ID and displays a safe integration state. A future
persisted-Legacy creation milestone should store the backend-issued integer as
`backendLegacyId`; this does not weaken backend ownership enforcement.

## Provenance and relationships

“Why Berry remembered this” displays only the exact excerpt and safe source
labels returned by the backend. Full conversations and internal locators are
never requested or shown.

Conflicting accounts use neutral language and remain independently reviewable.
Related memories explicitly explain that approval does not merge or alter the
existing Memory.

## Security and escaping

All API-derived text—including titles, summaries, excerpts, participants,
tags, and related memories—is inserted through `textContent`. The review code
does not use `innerHTML`, log tokens, or log provenance excerpts. Raw API
errors are not displayed.

## Accessibility

- native buttons and labeled form controls support keyboard use;
- native dialogs trap focus and close with Escape;
- focus moves to the first edit field or destructive confirmation;
- rejection identifies the selected Memory;
- visible text accompanies every color-coded state;
- loading and error changes use an `aria-live` status region;
- required edit fields use browser validation.

## Responsive behavior

The review cards use the existing glassmorphism palette, typography, rounded
surfaces, and shared buttons. Filters and actions wrap on desktop and stack
into full-width controls below 640px. Dialogs remain within the viewport and
scroll internally when needed.

## Checks and remaining work

`tests/memory-review.test.js` statically verifies the required loading, empty,
approve, confirmation, validation, error, authentication, escaping,
relationship, mobile, keyboard, and Legacy Studio integration boundaries.

Phase 6.5.7 still needs persisted Legacy/Story integration and an automatic,
durable extraction trigger. Phase 6.6 will own approved-memory browsing.
