# Continuous Backlink Queue Design

## Goal

Remove manual Campaign creation from the user workflow. In the Link Booster side
panel, the user selects a target website once and clicks Start. The extension
then opens eligible backlink pages one at a time in stable LinkMaster order,
while preserving manual submission review, pause, skip, result correction,
deduplication, and interrupted-item recovery.

Campaign remains an internal LinkMaster persistence detail. It is not presented
as a unit the user must create, size, complete, or understand.

## Chosen Approach

Use a bearer-authenticated queue facade backed by short internal Campaign
batches.

Alternatives considered:

1. Remove Campaign and update backlinks and records for every browser step.
   This creates multi-file partial-write risks and discards the tested state
   machine and recovery behavior.
2. Put every eligible backlink into one permanent Campaign. This gives simple
   ordering, but makes every Item update rewrite an increasingly large JSON
   document and delays metadata and record archival until the entire queue ends.
3. Keep bounded Campaign batches behind a continuous queue API. This reuses the
   current state machine and idempotent archival while removing Campaign from
   the user experience.

Option 3 is selected. It is the smallest reliable change for the GitHub JSON POC
and keeps the future D1 migration boundary clear.

## User Experience

### Link Booster

- Rename the primary side-panel mode from Campaign to Automatic.
- When no internal batch is active, show a target website selector populated by
  LinkMaster. Only sites with a non-empty name and valid email are selectable.
- When only one site is available, select it automatically.
- Start requests the next queue Item. The user does not enter an Item count.
- Continue using one dedicated browser tab.
- Form inspection, automatic scrolling, comment generation, and form filling
  remain automatic.
- Comment submission remains an explicit user action during the POC.
- Submit and Continue or Skip advances directly to the next queue Item.
- Pause finishes the current state transition but does not open the next page.
- Extension reload restores `inspecting`, `awaiting_review`, or `submitted`
  state without generating or submitting twice.
- Stop cancels only the current internal batch. Terminal and submitted Items are
  not offered again; unprocessed or pre-submission Items may be selected in a
  later run.
- When no eligible Item remains, show that processing is complete and return to
  the target selector.

### LinkMaster

- Remove the manual Campaign creation controls.
- Keep the existing history and correction screen as an internal automation run
  diagnostic view.
- Rename user-facing Campaign navigation and headings to Automation Runs.
- Existing Campaign JSON and APIs remain available for compatibility and
  diagnostics, but the extension no longer requires a manually created one.

## Queue API

All responses keep `apiVersion: 1`.

### `GET /api/automation/targets`

Bearer-authenticated. Returns only valid target identities needed for selection:

```json
[
  {
    "name": "CSV Viewer",
    "domain": "https://csvviewer.net"
  }
]
```

Email, descriptions, credentials, GitHub details, and unrelated site data are
not returned by this listing endpoint.

### `POST /api/automation/queue/next`

Bearer-authenticated:

```json
{
  "targetSite": "https://csvviewer.net"
}
```

This is a POST because it may complete an internal batch and create another.
It returns the existing next-item context:

```json
{
  "campaignId": "internal-batch-id",
  "targetSite": "https://csvviewer.net",
  "targetSiteSnapshot": {
    "name": "CSV Viewer",
    "domain": "https://csvviewer.net",
    "email": "comment@example.com",
    "tagline": "",
    "description": ""
  },
  "item": {
    "itemId": "item-id",
    "backlinkId": "backlink-id",
    "url": "https://source.example/article",
    "order": 1,
    "status": "pending"
  }
}
```

The target snapshot is returned only as part of the active execution context.
The existing Item PATCH route remains the mutation endpoint.

Queue behavior:

1. If an active internal or legacy Campaign exists for the requested target,
   return its in-flight Item first, then its first pending Item.
2. If an active Campaign belongs to another target, return
   `409 active_target_conflict`.
3. If the active Campaign is terminal, complete and archive it idempotently.
4. Create the next internal batch from at most 30 eligible backlinks in
   `backlinks.json` array order. The final batch may contain 1 through 29 Items.
5. Return `204` when no eligible backlink remains.
6. If the response is lost after creation, a repeated call returns the same
   active Item instead of creating a duplicate batch.

The existing manually created active Campaign is treated as the first batch. It
is never cancelled or rewritten during migration.

## Candidate Ordering And Deduplication

Automatic batches do not use the previous random 25/75 sampling rule. They scan
`backlinks.json` in array order and take the first 30 eligible entries.

An entry is excluded when:

- its status is `inaccessible` or `unsubmittable`;
- it is not an HTTP(S) page URL or points at a domain/root path;
- the backlink ID already has a record for the normalized target site;
- a historical Campaign for the same normalized target site contains the same
  backlink ID in a terminal status; or
- a historical Campaign contains it as `submitted`, preventing duplicate
  submission before verification.

Terminal failure, rejection, and skipped outcomes therefore stay skipped across
automatic batches even though the current archive only adds `published` and
`cannot_submit` results to `records.json`.

Cancelled pre-submission Items remain eligible. This lets Stop abandon the
current batch without permanently discarding pages the extension never
submitted.

## Persistence And Recovery

Each internal batch uses the existing Campaign and Item schema. The maximum
batch size remains 30 to limit JSON rewrite size.

When a batch becomes terminal, LinkMaster reuses
`completeStoredCampaign()`:

1. apply observed metadata corrections to `backlinks.json`;
2. archive supported final results into `records.json`;
3. mark the internal Campaign completed;
4. create the next batch on the same queue request.

These operations remain idempotent. No migration or rewrite of current
`campaigns.json` is required.

Only one active batch and one extension executor are supported in the POC.
Cloudflare D1 should later replace JSON-wide rewrites with transactional queue
claims and per-Item rows.

## Error Handling

- Invalid or incomplete target identity: `422 invalid_target_site_identity`.
- Target does not exist: `404 target_site_not_found`.
- Another target owns the active batch: `409 active_target_conflict`.
- Authentication failure: stop processing and keep the current UI state.
- LinkMaster persistence failure: do not open another page; allow retry.
- Unsupported page, login, CAPTCHA, rejection, and verification outcomes retain
  the current terminal classifications.
- Queue creation conflict from two concurrent requests is recovered by rereading
  the active batch and returning it when its target matches.

## Test Coverage

LinkMaster:

- valid targets expose only name and normalized domain;
- invalid identities are omitted;
- automatic selection is stable and ordered;
- final batches smaller than five are accepted;
- records and historical terminal/submitted Items are excluded;
- cancelled pending/pre-submission Items remain eligible;
- active legacy and interrupted Items resume;
- terminal batches complete before the next batch is created;
- repeated queue requests return the same Item;
- active target conflicts do not mutate data;
- zero candidates returns `204`.

Link Booster:

- target listing and queue-next requests use Bearer authentication;
- POST requests are not automatically retried;
- one available target is selected automatically;
- an active Item resumes without queue creation assumptions;
- Start, Submit and Continue, Skip, Pause, Stop, and reload keep current behavior;
- queue exhaustion returns to an idle completed state;
- user-facing Campaign terminology is removed.

## Out Of Scope

- unattended automatic clicking of the final Submit button;
- parallel tabs or multiple extension executors;
- automatic retry of rejected, failed, or skipped backlinks;
- domain-level failure inference;
- relevance filtering;
- replacing GitHub JSON with D1 in this change.
