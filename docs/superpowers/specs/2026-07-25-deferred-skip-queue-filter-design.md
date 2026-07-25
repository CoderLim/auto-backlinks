# Deferred Skip And Queue Filter Design

Date: 2026-07-25

Related:

- `2026-07-25-execution-review-sync-design.md` — local list + Sync model
- `2026-07-25-confirmation-first-execution-design.md` — status actions

## Goal

Operators need a soft skip that parks a backlink for later, without treating it
like “unsuitable for this target.” They also need a simple queue filter under
the target selector to pull those parked items back into `/next`.

## Scope

In scope:

- Automatic side panel: remove the phase title + site subtitle row
- Add a “跳过” action beside the existing three status buttons
- Persist soft skips as a recoverable LinkMaster record status `deferred`
- Add a queue inclusion checkbox “包含已跳过” under the target selector
- Teach `/next` to optionally include deferred records

Out of scope:

- Additional queue filters beyond “包含已跳过”
- Changing “不适合当前站” → `skipped` semantics
- Screenshot / evidence capture UI (none exists in Automatic today)
- Recovering deferred items that were never synced (still session-local only)

## UI

### Header

Keep the white target card, settings gear, and “目标网站” select.

Remove only the status header block:

- phase title (for example “检查评论表单”)
- subtitle site name (for example “CSV Viewer”)

Phase may still drive button enablement and busy states; it is no longer shown
as a title row.

### Queue filter

Directly under the target select, add a multi-select-ready filter row. v1 has
one option:

- label: **包含已跳过**
- control: checkbox
- default: unchecked

Unchecked → `/next` behavior unchanged for non-deferred candidates.
Checked → `/next` returns the normal eligible queue **union** deferred items
for that target.

This is a queue inclusion filter, not the checklist metadata “链接类型”
(Text / HTML / …) column.

### Status actions

Keep:

- 已发布
- 不能发布
- 不适合当前站

Add:

- 跳过

Layout: horizontal flex with wrap when the panel is narrow. Clicking “跳过”
uses the same advance path as the other three: mark the current row, then open
the next item.

Checklist status text for a deferred row: **已跳过**.

## Status Semantics

| Action | Extension review | Sync status | Same-site `/next` |
| --- | --- | --- | --- |
| 已发布 | `published` | `published` | excluded |
| 不能发布 | `cannot_publish` | `cannot_submit` (+ backlink `unsubmittable`) | excluded globally |
| 不适合当前站 | `unsuitable_for_target` | `skipped` | excluded for that target |
| 跳过 | `deferred` | `deferred` | excluded unless “包含已跳过” |

`deferred` does not change backlink `status` (not `unsubmittable`).

## LinkMaster

### Terminal statuses

Add `deferred` to the direct-processing terminal status set.

### `/next`

Request body gains optional boolean `includeDeferred` (default `false`).

Selection rules for a candidate backlink on the requested target:

1. Still skip `inaccessible` / `unsubmittable`, ineligible URLs, and
   `excludeBacklinkIds`.
2. If there is **no** matching `(targetSite, backlinkId)` record → eligible
   (unchanged).
3. If the only matching record is `deferred`:
   - `includeDeferred === false` → not eligible
   - `includeDeferred === true` → eligible
4. Any other matching record (`skipped`, `published`, …) → not eligible.

When both fresh (no-record) and deferred candidates exist and
`includeDeferred` is true, keep the existing newest-first scan order; deferred
items compete in the same pass rather than forming a separate priority queue.

### Sync / upsert

Today, a second different payload for the same `(targetSite, backlinkId)`
raises `result_already_recorded`.

Special case:

- Existing record status is `deferred` → allow replace with any other accepted
  terminal status (`published`, `skipped`, `cannot_submit`, another
  `deferred`, …), updating `updatedAt`.
- Existing non-deferred record → keep current idempotent / reject rules.

`metadata_update` against a deferred pair follows the same metadata-only path
and does not clear `deferred` unless a later non-metadata terminal replaces it.

## Extension

- Map `reviewStatus: deferred` → sync payload `status: "deferred"`.
- Pass `includeDeferred: true` on `getNextDirectItem` when the checkbox is on.
- Changing the checkbox does not rewrite the local list; it only affects the
  next `/next` call.
- Local unsynced deferred rows still need `excludeBacklinkIds` so the same
  session does not reopen them before Sync.

## Testing

- LinkMaster: `/next` excludes deferred by default; includes when flagged;
  non-deferred records still block.
- LinkMaster: sync can replace `deferred` → `published` / `skipped` /
  `cannot_submit`; cannot replace `skipped` → `published`.
- Extension: four actions wrap; header title row gone; checkbox under target;
  deferred appears as “已跳过” and syncs correctly.

## Non-goals / explicit non-changes

- “不适合当前站” remains `skipped` and is **not** returned by “包含已跳过”.
- No cloud screenshot storage.
- No automatic Sync on skip; operator still uses “同步到 LinkMaster”. Until
  Sync succeeds, recoverability across reloads is not guaranteed (same as other
  list rows).
