# Automation API Version 1

This contract defines the direct-processing boundary between LinkMaster and the
Link Booster Chrome extension.

The v1 extension does not create or execute Campaigns. It processes one
backlink at a time into a plugin-local execution list, lets the user review the
terminal results and proposed metadata, then synchronizes that list explicitly.

## Transport And Authentication

- Base URL: the configured LinkMaster HTTP(S) origin.
- Executor requests use `Authorization: Bearer <AUTOMATION_API_TOKEN>`.
- JSON request bodies use `Content-Type: application/json`.
- JSON request bodies are limited to 65,536 bytes.
- CORS allows all origins, methods `GET, POST, PATCH, OPTIONS`, and headers
  `Authorization, Content-Type`.
- `OPTIONS` returns `204 No Content`.
- V1 assumes one extension executor and does not claim or lease Items.

The bearer token is an executor credential, not an admin credential. It cannot
list or modify all LinkMaster data.

## Envelopes

Successful JSON responses:

```json
{
  "apiVersion": 1,
  "data": {}
}
```

JSON errors:

```json
{
  "apiVersion": 1,
  "error": {
    "code": "stable_machine_code",
    "message": "Human-readable explanation"
  }
}
```

An endpoint may return `204 No Content` without a JSON body. Clients reject
successful JSON responses whose `apiVersion` is not `1`.

## Primary Routes

| Method | Path | Access | Success |
| --- | --- | --- | --- |
| `GET` | `/api/automation/targets` | Bearer | `200`, target option array |
| `POST` | `/api/automation/next` | Bearer | `200`, direct Item context; or `204` |
| `POST` | `/api/automation/results/sync` | Bearer | `200`, saved result array |

`GET /api/automation/next` and `POST /api/automation/results` remain available
only for an already-installed extension version. New clients use the routes
above.

## Target Options

`GET /api/automation/targets` returns only sites with a non-empty name and valid
email. The listing exposes only selection fields:

```json
{
  "apiVersion": 1,
  "data": [
    {
      "name": "CSV Viewer",
      "domain": "https://csvviewer.net"
    }
  ]
}
```

Email, descriptions, credentials, GitHub data, and unrelated site data are not
returned by this endpoint.

## Next Backlink

Request (primary route):

```json
{
  "targetSite": "https://csvviewer.net",
  "excludeBacklinkIds": ["already-opened-backlink-id"],
  "includeDeferred": false
}
```

`includeDeferred` is optional and defaults to `false`. When `true`, backlinks
whose only matching record is `deferred` are eligible again for this target.
`skipped` and other non-deferred terminal records are never resurfaced by this
flag.
Response:

```json
{
  "apiVersion": 1,
  "data": {
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
      "url": "https://source.example/article",
      "originalMetadata": {
        "topicCategory": "Technology",
        "linkType": "UserName Link",
        "linkRel": "Nofollow"
      }
    }
  }
}
```

LinkMaster scans `backlinks.json` in array order and returns the first entry
that:

- uses HTTP(S) and has a non-root path;
- is not marked `inaccessible` or `unsubmittable`; and
- has no normalized `(targetSite, backlinkId)` match in `records.json`.

When no candidate remains, the endpoint returns `204`.

This endpoint is read-only. `excludeBacklinkIds` contains locally opened rows
for the selected target and prevents a duplicate before synchronization. It is
limited to 100 IDs. V1 intentionally has no Campaign, Run, server-side cursor,
claim, or reload recovery.

## Reviewed Result Synchronization

Request:

```json
{
  "results": [{
    "targetSite": "https://csvviewer.net",
    "backlinkId": "backlink-id",
    "url": "https://source.example/article",
    "status": "published",
    "generatedComment": "Saved comment text",
    "failureReason": "",
    "observedMetadata": {
      "topicCategory": "Technology",
      "linkType": "UserName Link",
      "linkRel": "Nofollow"
    },
    "submittedAt": "2026-07-25T04:00:00.000Z",
    "verifiedAt": "2026-07-25T04:00:03.000Z"
  }]
}
```

Allowed terminal statuses:

```text
published
pending_moderation
silent_reject
explicit_reject
skipped
cannot_submit
failed
deferred
```

`deferred` is a soft skip: it does not change backlink `status`, and a later
terminal result for the same `(targetSite, backlinkId)` may replace it. Other
terminal statuses remain idempotent; a conflicting existing non-deferred record
returns `409 result_already_recorded`.
The extension keeps every opened backlink, including its execution state,
comment summary, original metadata and editable proposed metadata locally.
Only terminal, unsynchronized rows are sent when the user clicks Sync to
LinkMaster. LinkMaster validates the entire request before it changes data. It
then:

1. appends all results to `records.json` using normalized
   `(targetSite, backlinkId)` as the business key; and
2. overwrites explicit `link_category`, `link_type`, and `link_rel` values in
   `backlinks.json`; and
3. returns the saved result array.

Every terminal status is written to `records.json`. Therefore published,
moderated, rejected, skipped, not-submittable, and failed backlinks are all
considered processed for that target website and are not selected again.

A repeated business-identical request is idempotent. A conflicting existing
record returns `409 result_already_recorded`. A batch whose same backlink has
different explicit metadata for different targets returns
`422 conflicting_backlink_metadata` before any write. A failed synchronization
leaves the full local list intact for Retry Sync.

## Observed Metadata

API fields map to existing backlink JSON fields:

| API field | Backlink JSON field |
| --- | --- |
| `topicCategory` | `link_category` |
| `linkType` | `link_type` |
| `linkRel` | `link_rel` |

Missing, empty, and `Unknown` values do not overwrite existing data.

Topic categories:

```text
General
Gaming
Technology
Software & SaaS
AI
Business & Startup
Marketing & SEO
Finance
Education
Health
Sports
Entertainment
Arts & Design
Lifestyle
Travel
Food
Home & Garden
Automotive
Real Estate
Legal
Science
Unknown
```

Link types:

```text
Text Link
HTML Link
Markdown Link
BBCode Link
UserName Link
Unknown
```

Link relations:

```text
Dofollow
Nofollow
Unknown
```

## Execution, Reload And Stop Semantics

- Each local row displays source URL, execution state, terminal status,
  comment summary, original-to-proposed metadata, and a sync state of pending,
  syncing, synced, or sync failed.
- A terminal row does not write LinkMaster until Sync is clicked.
- If the extension reloads before sync, its local list is intentionally lost;
  Start returns LinkMaster's first unrecorded candidate.
- Stop closes the automation tab, retains terminal review rows, and does not
  mutate LinkMaster.
- V1 does not prevent two extension instances from reading the same backlink.

## Privacy Boundary

Automation responses and committed evidence must not contain keys named:

```text
details
password
githubToken
github_token
screenshot
html
```

The API may store compact result and metadata values. It must not return full
page markup, screenshots, credentials, or model traces.

## Error Codes

Stable direct-processing errors include:

```text
automation_auth_required
invalid_json
payload_too_large
direct_target_required
direct_target_not_found
direct_backlink_not_found
invalid_direct_result
invalid_direct_result_status
direct_result_target_mismatch
direct_result_backlink_mismatch
direct_result_url_mismatch
invalid_observed_metadata
invalid_topic_category
invalid_link_type
invalid_link_rel
result_already_recorded
invalid_direct_next_request
invalid_exclude_backlink_ids
direct_exclude_limit_exceeded
invalid_direct_result_batch
direct_result_batch_limit_exceeded
duplicate_direct_result_key
conflicting_backlink_metadata
```

Unexpected storage or server failures use route-specific `*_failed` codes with
status `500`.

## Legacy Campaign Routes

Existing `/api/automation/campaigns/*` routes and `campaigns.json` remain for
legacy diagnostics and existing local data. The v1 extension does not call
them, and Campaign is not part of the primary LinkMaster navigation or direct
processing workflow.
