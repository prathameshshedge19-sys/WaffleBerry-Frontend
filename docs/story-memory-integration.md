# Persisted Story and Memory Integration

**Milestone:** Phase 6.5.7

## Legacy synchronization

Opening Legacy Studio or a Story Session explicitly synchronizes an unsaved
frontend Legacy. Its browser UUID is sent only as `client_correlation_id`.
The authenticated backend returns an owner-scoped integer ID, stored as
`backendLegacyId` alongside the local identifier. Repeated synchronization
reuses that mapping.

Browser state is never authorization evidence. Story Sessions, extraction
runs, and Memory Review use only `backendLegacyId`, while every backend request
rechecks the signed-in owner.

The Legacy Dashboard also hydrates the authenticated user's persisted Legacies
from the backend. A local frontend-only removal is retained as a browser
tombstone so the removed card does not immediately reappear; this is not a
backend deletion or ownership change.

## Persisted Story Sessions

Entering a chapter creates or resumes its backend Story Session and stores
`backendStorySessionId` in the existing user- and Legacy-scoped temporary
chapter state. The conversational interface remains unchanged.

Each submission has a client message correlation ID and uses the authenticated
persisted streaming endpoint. User content is saved before streaming. A
complete Berry response is saved afterward. System prompts, reasoning, tokens,
and provider payloads never enter browser story state.

## Completion and background status

Story Session now offers **Finish Story**. Completion immediately saves the
session and schedules memory preparation without blocking navigation. Copy
states clearly that memories still require review:

> Berry is preparing memories from this story. You can review them shortly.

The page performs one lightweight delayed status refresh while it remains
open. Completed runs distinguish new candidates from zero new candidates.
Failed runs show a safe retry button. No continuous polling is used.

When ready, **Review Memories** returns through the existing local Legacy
correlation while the review API uses the stored backend Legacy ID.

## Authentication, security, and accessibility

All calls reuse `WaffleBerryApi`, its configured base URL, Bearer token, and
safe error behavior. No token, story, or extraction output is logged.
Application text and status are assigned with `textContent`; no unsafe HTML is
used.

Finish and retry are native keyboard-accessible buttons. Status uses an
`aria-live` region. Completion actions stack on mobile using the shared
responsive design language.

## Verification and remaining work

`tests/story-memory-integration.test.js` adds 20 checks for synchronization,
persisted IDs, session creation, streaming, completion, review messaging,
retry, authentication, safe rendering, mobile layout, and keyboard controls.

Phase 6.5.8 should run full backend tests in a Python environment, exercise
real HTTP/SSE behavior with a mocked provider, verify process-restart recovery
for pending runs, and complete end-to-end Memory Review validation. Companion
memory retrieval remains intentionally disconnected.
