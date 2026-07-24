# Automation API Version 1

This contract defines the POC boundary between LinkMaster (control plane) and
the Link Booster Chrome extension (executor).

## Transport and Authentication

- Base URL: the configured LinkMaster HTTP(S) origin.
- Executor requests use `Authorization: Bearer <AUTOMATION_API_TOKEN>`.
- Admin requests use LinkMaster's `auth_token` cookie.
- JSON request bodies use `Content-Type: application/json`.
- JSON request bodies are limited to 65,536 bytes (64 KiB).
- V1 does not enforce per-field string length limits. This is a documented POC
  compromise and should be tightened before exposing the API beyond a private
  deployment.
- CORS allows all origins, methods `GET, POST, PATCH, OPTIONS`, and headers
  `Authorization, Content-Type`. Preflight responses have a one-day max age.
- `OPTIONS` returns `204 No Content`.

The bearer token is an executor credential, not an admin credential. In
particular, it cannot create or list Campaigns and cannot perform manual result
corrections.

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

An endpoint may return `204 No Content`; a 204 response has no JSON body.
Clients must reject successful JSON responses whose `apiVersion` is not `1`.

## Routes

| Method | Path | Access | Success |
| --- | --- | --- | --- |
| `POST` | `/api/automation/campaigns` | Admin | `201`, Campaign |
| `GET` | `/api/automation/campaigns` | Admin | `200`, Campaign array |
| `GET` | `/api/automation/campaigns/active` | Bearer | `200`, Campaign; or `204` |
| `GET` | `/api/automation/campaigns/:id/next` | Bearer | `200`, next Item context; or `204` |
| `PATCH` | `/api/automation/campaigns/:id/items/:itemId` | Bearer | `200`, updated Item |
| `PATCH` | `/api/automation/campaigns/:id/items/:itemId` | Admin in manual correction mode | `200`, corrected Item |
| `POST` | `/api/automation/campaigns/:id/complete` | Admin or Bearer | `200`, completed Campaign |
| `POST` | `/api/automation/campaigns/:id/cancel` | Admin or Bearer | `200`, cancelled Campaign |

`GET /api/automation/campaigns` returns `403 admin_scope_required` when
presented with only a valid executor bearer token.

## Campaign Creation

Request:

```json
{
  "targetSite": "https://product.example/path",
  "count": 20
}
```

`count` must be an integer from 20 through 30. LinkMaster resolves
`targetSite` against its stored site identities and snapshots `name`, normalized
`domain`, `email`, `tagline`, and `description`. A site without a non-empty name
and valid email is rejected.

Only eligible non-root HTTP(S) backlink URLs are selected. Inaccessible and
unsubmittable backlinks and exact `(targetSite, backlinkId)` submission history
are excluded. LinkMaster permits one active Campaign.

## Campaign

Required fields:

| Field | Type |
| --- | --- |
| `schemaVersion` | literal `1` |
| `campaignId` | string |
| `targetSite` | normalized HTTP(S) URL string |
| `targetSiteSnapshot` | TargetSiteSnapshot |
| `requestedCount` | integer, 20-30 |
| `status` | `active`, `completed`, or `cancelled` |
| `items` | Item array |
| `createdAt`, `updatedAt` | ISO date-time strings |

TargetSiteSnapshot:

| Field | Type |
| --- | --- |
| `name`, `domain`, `email` | string |
| `tagline`, `description` | string, optional |

The snapshot is immutable Campaign input. The executor must use the snapshot,
not a later site edit, while filling an Item.

## Item and State Machine

Required Item fields:

| Field | Type |
| --- | --- |
| `itemId`, `backlinkId`, `url` | string |
| `order` | positive integer |
| `status` | ItemStatus |
| `createdAt`, `updatedAt` | ISO date-time strings when persisted |

Optional execution fields:

```text
failureReason
observedMetadata
inspection
generatedComment
commentFingerprint
submission
submittedAt
result
note
corrections
```

State transitions:

```text
pending -> inspecting
inspecting -> awaiting_review | cannot_submit | failed | skipped
awaiting_review -> submitted | skipped | failed
submitted -> published | pending_moderation | silent_reject |
             explicit_reject | failed
```

Terminal statuses:

```text
published
pending_moderation
silent_reject
explicit_reject
skipped
cannot_submit
failed
```

The executor PATCH must contain `status`. Accepted top-level fields are:

```text
status
failureReason
observedMetadata
inspection
generatedComment
commentFingerprint
submission
submittedAt
result
note
```

Unknown top-level fields are ignored in executor mode. Status transitions are
validated server-side. The extension sends mutation requests once and does not
automatically retry them.

## Observed Metadata

API field names use camelCase:

```json
{
  "topicCategory": "Technology",
  "linkType": "UserName Link",
  "linkRel": "Nofollow"
}
```

LinkMaster persists explicit values to the existing backlink data fields:

| API field | Backlink JSON field |
| --- | --- |
| `topicCategory` | `link_category` |
| `linkType` | `link_type` |
| `linkRel` | `link_rel` |

`Unknown` and missing metadata values do not overwrite existing backlink data.
Explicit observed values overwrite existing values when a Campaign completes.

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

## Manual Correction

An authenticated LinkMaster admin may correct a terminal result:

```json
{
  "manualCorrection": true,
  "status": "published",
  "correctionNote": "Visible after moderation."
}
```

All three fields are required in practice; `status` must be terminal and
`correctionNote` must be non-empty. Extra fields are rejected. The correction
history records the old status, new status, note, and timestamp.

## Completion and Archival

A Campaign can complete only when every Item is terminal. Completion preserves
all Item results in the Campaign. Only `published` and `cannot_submit` Items are
archived into `records.json`. Completion is idempotent: completing an already
completed Campaign does not append duplicate records or reapply metadata.

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

The API may store compact structured inspection, submission, and verification
summaries. It must not return full page markup, screenshots, credentials, or
full model traces.

## Error Codes

The stable errors currently exposed by V1 include:

```text
admin_auth_required
admin_scope_required
automation_auth_required
campaign_access_required
invalid_json
payload_too_large
invalid_target_site_identity
invalid_campaign_count
insufficient_candidates:<count>
active_campaign_exists
campaign_not_found
campaign_not_active
campaign_not_completable
campaign_item_not_found
campaign_item_not_terminal
invalid_item_transition
item_status_required
invalid_observed_metadata
invalid_topic_category
invalid_link_type
invalid_link_rel
invalid_correction_status
correction_note_required
invalid_manual_correction_payload
```

Unexpected storage or server errors use a route-specific `*_failed` code and a
`500` status.
