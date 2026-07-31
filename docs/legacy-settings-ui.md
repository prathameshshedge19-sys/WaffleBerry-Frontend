# Legacy Settings UI

The My Legacy header links to a dedicated, authenticated Legacy Settings page.
The page fetches the persisted Legacy before editing and pre-fills its name and
relationship. Status is displayed elsewhere but is not editable because
archive behavior belongs to Phase 6.8.

Save sends the last `updated_at` value as `expected_updated_at`. A stale update
receives a controlled conflict message and a "Reload latest settings" action
rather than overwriting another edit.
Validation messages are associated with visible labels, the first invalid
field receives focus, and loading, saving, success, and failure feedback use
live regions. Authentication failures follow the existing sign-in flow;
missing and non-owned Legacies use the same neutral wording.

After success, the local Legacy entry is updated in place while retaining its
browser correlation ID, creation date, and backend Legacy ID. Returning to My
Legacy or the Legacy dashboard therefore shows the updated identity without
creating another Legacy. Backend data remains authoritative on subsequent
loads.

The form uses the existing glass-card, button, color, dark-mode, and responsive
styles. Mobile actions stack at full width. No archive, export, delete,
transfer, sharing, Memory, or Companion controls are present.
