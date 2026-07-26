# Confirmation-First Execution Design

> Extends `2026-07-25-execution-review-sync-design.md`. The local execution list
> remains the only review surface before Sync. This document changes when the
> runner may advance, what is editable mid-flight, and how sync selection works.

## Goal

Every opened backlink requires explicit operator confirmation before the runner
continues. When a fillable comment form is detected, the extension prepares the
submission and waits for publish confirmation. When no automatic path exists,
the runner stops on that row until the operator confirms an outcome. In-progress
rows are editable. Sync selection is enabled only when reviewed values differ
from the originals captured at open time.

## Auto-Comment Capability Metadata

Add a reviewed metadata field that distinguishes whether the backlink can be
automatically commented:

| Value | Meaning |
|---|---|
| `ready` | Form detected and submittable; suitable for automatic comment flow |
| `manual` | A human could still publish a comment, but automatic fill/submit is not appropriate |
| `blocked` | Cannot submit for this page (404, no entry point, inaccessible flow, etc.) |

Field name in payloads and storage: `autoComment`.

- Original value comes from the backlink snapshot when available; otherwise
  `Unknown` until inspection proposes one.
- Proposed value is editable in the execution list for both in-progress and
  terminal rows.
- On Sync, explicit proposed `autoComment` overwrites the matching backlink
  field in `backlinks.json`, same rules as `link_category` / `link_type` /
  `link_rel`.
- LinkMaster validates `autoComment` against `{ ready, manual, blocked, Unknown }`.

`autoComment` describes the backlink's automation fitness. Per-target execution
outcomes continue to live in `records.json` via the existing terminal statuses
(`published`, `pending_moderation`, `not_visible_after_submit`, `explicit_reject`,
`skipped`, `cannot_submit`, `failed`).

## Runner Behavior

1. Start / next opens one backlink and appends a list row immediately.
2. While inspecting / generating / awaiting confirmation, the row stays
   in-progress and remains editable.
3. **Fillable form detected**
   - Propose `autoComment = ready`.
   - Fill fields and wait for the existing publish confirmation control.
   - Only after the operator confirms does the extension submit and verify.
   - Terminal status follows the verified publish outcome.
4. **No automatic path** (no form, 404, login wall, CAPTCHA, unsupported entry)
   - Do **not** auto-advance to the next backlink.
   - Propose a default such as `autoComment = blocked` when clearly
     unsubmittable; use `manual` only when the operator (or a later heuristic)
     marks the page as human-postable.
   - Keep the current row awaiting operator confirmation of outcome and
     metadata.
   - After confirmation, write the local terminal result and only then request
     the next backlink.
5. Stop still closes the automation tab, keeps terminal rows, abandons an
   incomplete current row so it can be selected again later, and never writes
   LinkMaster data.

## Execution List Editing

Each row shows:

- source URL (compact, full URL on hover);
- live execution or terminal status;
- proposed `autoComment`, `link_category`, `link_type`, and `link_rel`;
- sync state.

Editing rules:

- Proposed metadata (including `autoComment`) is editable as soon as the row
  exists, including in-progress rows.
- After Sync succeeds, that row's fields become read-only.
- While a sync request is in flight, editable controls stay disabled.
- Terminal status remains the existing result vocabulary for the record write.
  The operator may correct the terminal status before sync when the row is
  terminal and unsynced; the default is the automation-detected outcome.

## Sync Selection

Checkbox meaning is unchanged: selected terminal rows are included in
`POST /api/automation/results/sync`.

New gating:

- A row is selectable only when it has a terminal local result, is not synced /
  syncing, **and** at least one reviewed value differs from the originals:
  terminal status, `autoComment`, `link_category`, `link_type`, or `link_rel`.
- If nothing changed, the checkbox is disabled.
- Hovering the disabled checkbox explains why, for example:
  - “进行中，确认后再同步”
  - “已同步”
  - “状态与元数据均未修改，无需同步”
- Default `selected` is `true` only when the row is selectable under the rule
  above; otherwise `false`.
- Changing proposed values or terminal status recalculates selectability and
  may auto-check a newly eligible row.

Sync payload still sends the terminal result plus proposed observed metadata.
LinkMaster continues to validate the whole batch before writing records, then
applies metadata overwrites including `autoComment`.

## Out Of Scope

- Browser-reload recovery of the local list
- Automatic submit without operator confirmation when a form is fillable
- Changing `/next` eligibility beyond existing record / exclusion / status filters
  in this iteration (`autoComment` may inform future filtering later)
- Renaming or removing legacy terminal statuses

## Acceptance

- Opening a backlink creates an editable list row before the terminal outcome.
- Fillable-form rows wait for publish confirmation; they do not submit alone.
- Non-automatic rows wait for operator confirmation and do not auto-advance.
- Unchanged terminal rows cannot be checked; the checkbox tooltip states why.
- Changed status or metadata makes the row selectable and syncable.
- Successful Sync persists the record and any explicit metadata, including
  `autoComment`.
