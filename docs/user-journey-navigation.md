# User journey and Legacy navigation

## Page map

```text
Login
  -> Choose Your Experience
      -> Legacy Builder
          -> Your Legacies
              -> Begin New Legacy -> Who's There?
              -> Saved Legacy     -> Who's There?
              -> Legacy Dashboard -> statistics and progress

Who's There?
  -> Chat with Companion -> selected Legacy Persona conversation
  -> Add More to Legacy  -> Legacy Studio -> Guided Stories
```

## Page responsibilities

- **Login** authenticates through the existing API and always continues to
  Choose Your Experience.
- **Choose Your Experience** presents Legacy Builder and the existing disabled
  Creator Studio. Legacy Builder opens Your Legacies without choosing a Legacy.
- **Your Legacies** is the selection and lifecycle-management page. It lists
  active and archived backend Legacies and exposes creation, selection, Edit,
  Dashboard, Archive/Restore, Export, and permanent Delete as separate native
  controls.
- **Who's There?** displays the selected Legacy name and relationship and asks
  whether to chat with the Companion or add more to the Legacy. Opening this
  page never creates another Legacy.
- **Legacy Studio** remains the entry to Guided Stories, Story Sessions, and
  Memory Review. Berry remains the Story Guide here; it is not replaced by the
  Phase 7 Persona.
- **Companion** lists and creates only conversations whose persisted
  `legacy_id` matches the selected Legacy. New messages therefore use the
  Phase 7 Legacy Persona rather than generic Berry chat.
- **Legacy Dashboard** remains the statistics, progress, extraction, and
  management overview. It is reached through a separate card action and links
  back to Your Legacies, Add More to Legacy, Chat with Companion, and Settings.
- **Legacy Settings** edits the selected persisted Legacy and returns to its
  dashboard through the existing explicit navigation convention.

## Saved Legacy actions

The saved Legacy identity area and Continue button open Who's There?. The card
does not use a nested interactive link role. Legacy Dashboard and Edit are
separate anchors. Archive/Restore, Export, and typed-name permanent Delete use
the existing authenticated backend APIs and synchronize local state without a
page reload.

## Creation and state synchronization

Begin New Legacy starts a new correlation ID, captures the name and
relationship, then calls the existing synchronization endpoint before leaving
the page. The authoritative `legacy_id` is retained as `backendLegacyId`; the
browser correlation remains correlation only and is never authorization.
Successful creation selects the same local record and opens Who's There?.

Hydration de-duplicates by both local correlation ID and backend Legacy ID.
Archive/restore updates the existing record. Confirmed backend deletion removes
the record and clears active selection when necessary. Direct decision and
dashboard loads hydrate active and archived lists before resolving the URL ID,
so missing or stale IDs fail safely without exposing ownership information.

## Who's There? choices

Chat with Companion passes the selected local ID to the chat page. The chat
page resolves the retained backend ID, scopes its conversation list to that
`legacy_id`, and supplies the ID when creating a conversation. Add More to
Legacy passes the same selection to Legacy Studio, which routes to the existing
Guided Stories catalogue and Story Session APIs.

The back path from Who's There? is Your Legacies. Legacy Studio and Companion
explicitly return to Who's There? with the selected Legacy parameter.

## Dashboard terminology help

The Legacy Dashboard has a semantic question-mark button labeled “Explain
Legacy Dashboard terminology.” Its modal defines Story Sessions, Distinct
Chapters, Story Contributions, Total Memories, Approved Memories, Linked
Conversations, Story Session Progress, and Extraction. Story Session Progress
is explicitly limited to sessions already started and does not claim a planned
story denominator.

The modal closes with its close button, Escape through native dialog behavior,
or a backdrop click. Its `close` event returns focus to the help button. Styles
use existing theme variables for light, dark, desktop, and mobile layouts.

## Archived behavior

Archived Legacies remain in the Archived tab. Dashboard, Export, Restore, and
Delete remain available. Who's There? displays an explicit restore notice and
removes the Chat and Add More destinations. Dashboard mutation links are
hidden. Backend conversation creation also rejects archived Legacies with the
existing lifecycle conflict contract.

## Error and authentication behavior

The decision page presents loading, neutral missing-Legacy, network, retry, and
authentication states. A 401 clears the stored session and returns to Login. A
404 never identifies another owner. Creation does not navigate until backend
persistence succeeds, preventing a local-only Legacy from appearing complete.
