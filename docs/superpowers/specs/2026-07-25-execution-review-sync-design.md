# Execution Review And Sync Design

> Superseded for confirmation and mid-flight editing behavior by
> `2026-07-25-confirmation-first-execution-design.md`. The local execution list
> and explicit Sync model below remain the base.

An Automatic execution keeps every opened backlink in a visible, plugin-local
review list. LinkMaster is updated only when the user clicks Sync to LinkMaster.
There is no user-visible Campaign, batch, server-side run, or browser-reload
recovery requirement.

## Execution List

The side panel adds an entry as soon as it opens a backlink. Each entry shows:

- source URL;
- live execution state: `opened`, `inspecting`, `generating`,
  `awaiting_review`, `submitting`, `verifying`, or a terminal result;
- terminal result when available: `published`, `pending_moderation`,
  `not_visible_after_submit`, `explicit_reject`, `skipped`, `cannot_submit`, or `failed`;
- generated comment summary;
- original and proposed `link_category`, `link_type`, and `link_rel` values;
- sync state: pending, syncing, synced, or sync failed.

The user may edit proposed metadata in the list before syncing. The list remains
visible after a successful sync as execution evidence.

## Direct Processing

The extension requests the next candidate with the target site plus the
backlink IDs already handled for that target and LinkMaster connection. A list
row is identified by `(connection, targetSite, backlinkId)`, so changing a
target or LinkMaster connection cannot exclude or synchronize another row.
LinkMaster filters both persisted records and these local exclusions, so one
execution does not receive the same backlink twice before sync.

The local list is intentionally lost after an extension reload. The next run
starts from LinkMaster's persisted records, as agreed for v1.

## Sync

The side panel has a persistent summary such as `8 pending sync` and a Sync to
LinkMaster action. Sync sends every terminal unsynced result in one request.
LinkMaster validates the entire list before changing data, writes all records,
then applies all explicit metadata corrections. On success, the plugin marks
the corresponding rows synced. On failure, it keeps every row intact and
offers Retry Sync.

Stopping execution closes the automation tab and prevents opening another page.
It retains terminal review rows, abandons an incomplete current row so it can
be selected again, and never writes LinkMaster data.

## Compatibility

The previous single-result endpoint remains for old extension builds. The new
execution list uses `POST /api/automation/next` with local exclusions and
`POST /api/automation/results/sync` for reviewed results.
