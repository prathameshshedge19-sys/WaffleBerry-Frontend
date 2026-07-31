# Legacy Management UI

Phase 6.8.5 connects the existing `legacy-dashboard.html` experience to the
Legacy lifecycle APIs. Active Legacies are shown by default. The accessible
Active and Archived tabs request their corresponding backend lists and reconcile
the session model by backend Legacy ID, removing stale records and suppressing
duplicates without reloading the page.

Active cards provide My Legacy, Legacy Settings, Archive, Export, and Delete.
Archived cards provide read-only My Legacy, Restore, Export, and Delete. Archive
and restore immediately move a synchronized card out of the current tab. Export
uses the authenticated JSON endpoint and downloads its server-provided safe
filename without a preview.

Permanent deletion opens a modal with an irreversible warning. The destructive
button remains disabled until the user types the exact Legacy display name. The
name is then sent as `confirmation_text`; local state is removed only after the
backend returns success. Missing records, conflicts, network failures, and
expired authentication receive controlled recovery or sign-in behavior.

Archived dashboards remain visible with a clear “This Legacy is archived”
banner. Settings controls are disabled, the Settings entry is hidden, and direct
Story Studio or Companion entry routes return to the read-only Legacy dashboard.

The management grid retains the existing glass-card design, keyboard-native
links and buttons, focus handling, screen-reader live regions, dark mode, reduced
motion support, a three/two/one-column desktop/tablet/mobile grid, and a stacked
mobile confirmation dialog.

No backend, database, or migration changes were needed. Phase 6.8.6 end-to-end
validation and all Phase 7 work remain out of scope.
