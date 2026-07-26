# Direct Backlink Processing Design

> Superseded for the active v1 workflow by
> `2026-07-25-execution-review-sync-design.md`. Results are now reviewed in the
> plugin execution list and explicitly synchronized, rather than written after
> each individual backlink.

## Goal

The Link Booster extension processes LinkMaster backlinks one at a time without
Campaigns, Runs, batches, requested counts, or deferred result archival.

The user selects a target website and clicks Start. LinkMaster returns the first
eligible backlink that has no matching processing record. After the current page
reaches an outcome, the extension writes that result immediately and requests
the next backlink.

## V1 Data Model

V1 uses two existing files:

- `backlinks.json` is the ordered candidate pool and stores corrected observed
  metadata.
- `records.json` is the processed set for a target website.

The idempotency key is the normalized pair:

```text
(targetSite, backlinkId)
```

The existence of a matching record means the backlink has already been handled
for that target website, regardless of whether the outcome was published,
moderated, rejected, skipped, or not submittable.

Campaign and Campaign Item data are not read or written by the direct processing
flow. Existing `campaigns.json` data remains untouched as legacy diagnostic
history.

## User Flow

1. The side panel loads valid target websites from LinkMaster.
2. The user selects one website. If only one valid website exists, it is selected
   automatically.
3. Start requests the next unprocessed backlink.
4. The extension opens the page, scrolls to a detected form, generates a comment,
   and fills the fields.
5. When a form is fillable, the extension waits for the user to confirm
   submission.
6. Submit and Continue submits, verifies the visible result, immediately writes
   the outcome to LinkMaster, and requests the next backlink.
7. Skip immediately writes a `skipped` record and requests the next backlink.
8. An automatically detected terminal failure such as no form, login required,
   or CAPTCHA writes its result immediately and proceeds.
9. Processing stops when LinkMaster returns no eligible backlink.

There is no batch completion step and no delayed metadata or record write.

## Ordering And Eligibility

LinkMaster scans `backlinks.json` from the end of its existing array and returns
the last backlink that:

- has an HTTP(S) URL with a non-root path;
- is not marked `inaccessible` or `unsubmittable`; and
- has no matching normalized `(targetSite, backlinkId)` in `records.json`.

V1 does not shuffle candidates, sample historical links, infer domain-level
behavior, retry failures, or rank by relevance.

Because the result is persisted before requesting another backlink, the next
request naturally advances backward through the ordered candidate pool.

## Automation API

All endpoints are bearer-authenticated and return `apiVersion: 1`.

### `GET /api/automation/targets`

Returns valid target website choices with only:

```json
[
  {
    "name": "CSV Viewer",
    "domain": "https://csvviewer.net"
  }
]
```

Only sites with a non-empty name and valid email are listed. Email and other
identity details are returned only with the selected Item execution context.

### `GET /api/automation/next?targetSite=...`

Returns `204` when no candidate remains. Otherwise:

```json
{
  "targetSite": "https://csvviewer.net",
  "targetSiteSnapshot": {
    "name": "CSV Viewer",
    "domain": "https://csvviewer.net",
    "email": "comment@example.com",
    "tagline": "",
    "description": ""
  },
  "item": {
    "backlinkId": "backlink-id",
    "url": "https://source.example/article"
  }
}
```

The endpoint is read-only. V1 accepts that repeated requests before a result is
written may return the same backlink.

### `POST /api/automation/results`

The extension writes one terminal result:

```json
{
  "targetSite": "https://csvviewer.net",
  "backlinkId": "backlink-id",
  "url": "https://source.example/article",
  "status": "published",
  "generatedComment": "Saved comment text",
  "failureReason": "",
  "observedMetadata": {
    "topicCategory": "Technology",
    "linkType": "author_website",
    "linkRel": "nofollow"
  },
  "submittedAt": "2026-07-25T04:00:00.000Z",
  "verifiedAt": "2026-07-25T04:00:03.000Z"
}
```

Allowed terminal statuses remain:

- `published`
- `pending_moderation`
- `not_visible_after_submit`
- `explicit_reject`
- `skipped`
- `cannot_submit`
- `failed`

The server validates that the target and backlink exist and that the submitted
URL matches the stored backlink URL. It then:

1. upserts the record by normalized `(targetSite, backlinkId)`;
2. stores the outcome and timestamps in `records.json`;
3. overwrites `link_category`, `link_type`, and `link_rel` in
   `backlinks.json` when explicit observed values are present; and
4. returns the saved record.

Repeated identical writes are idempotent. A conflicting second terminal result
returns `409 result_already_recorded`; V1 does not provide automatic correction
through the extension.

## Reload And Failure Semantics

V1 intentionally has no in-flight recovery state.

- If the extension reloads before a result is written, Start returns the same
  unprocessed backlink from the beginning of the scan.
- If the result write succeeds but the response is lost, the next request skips
  that backlink because its record already exists.
- If result persistence fails, the extension does not request another backlink
  and shows Retry Save.
- Only one extension executor is assumed. V1 does not implement leases or
  concurrent claims.

## UI Changes

Link Booster:

- rename Campaign to Automatic;
- add the target website selector;
- remove Campaign ID, Item count, Campaign complete, and Campaign cancel
  concepts;
- retain Start, Pause, Submit and Continue, Skip, result details, and Retry Save;
- show processed outcome and current source URL without exposing internal data.

LinkMaster:

- remove Campaign from primary navigation;
- keep the legacy Campaign page and APIs temporarily for existing data, but do
  not use them in the new flow;
- Records becomes the primary processing history.

## Test Coverage

LinkMaster:

- target listing omits incomplete identities and private fields;
- next selection follows `backlinks.json` order;
- root URLs, inaccessible/unsubmittable entries, and existing records are
  skipped;
- equivalent target URL forms deduplicate;
- no candidate returns `204`;
- result writes validate target, backlink, URL, status, and metadata;
- record upsert and backlink metadata overwrite are idempotent;
- a conflicting result returns `409`.

Link Booster:

- target and next requests use bearer authentication;
- one target is selected automatically;
- Start opens the returned Item;
- Submit, Skip, and automatic terminal outcomes save before advancing;
- a save failure blocks advancement and supports Retry Save;
- reload starts again from LinkMaster's first unrecorded backlink;
- no user-facing Campaign or batch terminology remains.

## Out Of Scope

- Campaign migration or deletion;
- browser-reload recovery before a result is saved;
- concurrent executors and Item leases;
- automatic retry;
- domain-level failure rules;
- unattended final Submit clicks;
- relevance filtering;
- D1 migration.
