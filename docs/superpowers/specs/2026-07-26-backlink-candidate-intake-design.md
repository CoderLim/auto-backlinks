# Backlink Candidate Intake Design

**Date:** 2026-07-26  
**Scope:** `link-master` import staging + Automation candidate APIs;  
`link-booster-extension` Intake sidepanel tab;  
`auto-backlink` Automation API contract update.

## Goal

Imported inbound backlink candidates stay in a staging pool until the extension
verifies that a comment form can be detected and filled with dummy data. Only
passing candidates are admitted into `backlinks.json` for Automatic execution.
Failing candidates are deleted from staging. Intake never publishes a real
comment and never writes `records.json`.

## Relationship to Existing Flows

| Flow | Source | Writes | Submits comment? |
|------|--------|--------|------------------|
| `import-backlinks.js` (ahrefs\|sim) | opencli | `backlink-candidates.json` only | no |
| **Intake** (new) | candidates pool | admit → `backlinks.json`; reject → delete candidate | no (dummy fill only) |
| Automatic | `backlinks.json` | `records.json` + backlink metadata via Sync | yes (operator-confirmed) |

Inbound import semantics are unchanged: referring pages that link to a domain
(Ahrefs/Sim), not outbound links scraped from a domain's own pages.

## Architecture

```text
import-backlinks.js (ahrefs|sim)
  → append data/json/backlink-candidates.json

Link Booster Intake tab
  → POST /api/automation/candidates/next
  → open URL → inspect → dummy fill → topic classify
  → pass: POST /api/automation/candidates/admit
  → fail: POST /api/automation/candidates/reject

Automatic tab (unchanged)
  → consumes only backlinks.json
```

- **link-master:** staging file, candidate next/admit/reject APIs, import default
  target switched to staging.
- **link-booster-extension:** third sidepanel tab `Intake`; reuse
  `inspectCommentPage`, fill helpers, and topic classification; do not call
  submit or results sync.
- **auto-backlink:** design + contract for the three candidate routes.

## Staging Data

**File:** `data/json/backlink-candidates.json` (array).

Candidate shape matches import output (canonical fields):

- identity / source: `id`, `link`, `dr`, `import_source`, `import_target`,
  optional `source_title` / `source_anchor` / `source_target_url`
- placeholders until Intake: `link_category`, `link_type`, `link_rel` as
  `Unknown`; `topic_category_confirmed: false`

**Import (`scripts/import-backlinks.js`):**

- Default append target is `backlink-candidates.json` (not `backlinks.json`).
- Deduplicate `link` URL against **both** `backlink-candidates.json` and
  `backlinks.json`.
- Keep `backlink-import-history.json` behavior for per-domain import history.
- Existing quality filters (root URL, low/missing DR, SEO hostname rules,
  duplicates) stay as today.

## Automation API

Same Bearer auth as existing Automation routes. Contract update lives in
`contracts/automation-api-v1.md`.

| Method | Path | Behavior |
|--------|------|----------|
| `POST` | `/api/automation/candidates/next` | Return next staging candidate; support `excludeIds`; empty → `204` |
| `POST` | `/api/automation/candidates/admit` | Append/upsert into `backlinks.json` with classified fields; remove from staging; if URL already in backlinks, remove staging only (idempotent success) |
| `POST` | `/api/automation/candidates/reject` | Remove candidate from staging only |

### Admit payload (minimum)

- `id` (candidate id) and/or `link`
- `link_type`, `link_rel`, `link_category`
- `autoComment: "ready"` when dummy fill succeeded
- `topic_category_confirmed: true` when topic classification ran successfully

Admitted backlink uses canonical schema (`link_type` + `link_rel`, no legacy
`type` field). Admit does **not** create a record.

### Selection order

`candidates/next` scans the staging array **end-to-front** (newest imports
first), matching Automatic's direct `/next` behavior on `backlinks.json`.

## Intake Pass / Fail Rules

**Pass (auto-admit, then fetch next):**

1. Page loads successfully.
2. Comment form is detected (controls mappable for fill).
3. Dummy data fill succeeds (name / email / website / comment as present).
4. **Do not** require correct link-placement evidence for v1.
5. Classify `link_type` and `link_rel` from inspect when available; allow
   `Unknown` for either without failing.
6. Classify `link_category` via existing topic classification; on classification
   failure, admit with `link_category: "Unknown"` and
   `topic_category_confirmed: false` rather than rejecting (form+fill already
   passed).

**Reject (delete from staging, then fetch next):**

- Navigation failure / timeout / non-http(s) URL
- No comment form
- Login required or CAPTCHA present (v1: no manual bypass in Intake)
- Dummy fill failure
- Explicit operator discard/skip, if the UI exposes that control

**Stop without deleting staging:**

- Admit or next API / network errors: keep current candidate, show Retry.
  Do not reject on transport failure.

## Runner Behavior

1. Serial processing on one dedicated automation tab (same tab-controller
   pattern as Automatic).
2. No target-site selection (Intake does not publish).
3. Dummy fill values are fixed constants inside the extension.
4. Never click the real submit control.
5. Never write `records.json` or call `/api/automation/results/sync`.
6. On pool exhaustion (`204`), show complete.
7. Stop closes the automation tab and abandons an in-flight page without
   admit/reject unless the operator already confirmed discard.

## UI

Sidepanel tabs: `Automatic` | `Manual` | `Intake`.

Intake surfaces:

- Start / Stop
- Current URL and phase (open / inspect / fill / classify / admit)
- Last `link_type` / `link_rel` / `link_category`
- Counters: admitted / rejected
- Retry on API errors only

No execution-review Sync list in v1; pass/fail is immediate API mutation.

## Testing

**link-master**

- Import writes candidates, not backlinks
- Cross-file URL dedupe
- `next` / `admit` / `reject`, including idempotent admit when URL already in
  backlinks

**link-booster-extension**

- Pass path: form + dummy fill → admit with metadata
- Fail path: no form / fill error / login / captcha → reject
- Assert submit and results-sync are not invoked

**auto-backlink**

- Contract lists the three candidate routes and status codes

## Out of Scope (v1)

- Parallel Intake tabs / concurrent page opens
- Operator editing classifications before admit
- Admin UI for staging pool management
- Requiring link-placement evidence for pass
- Changing Automatic submit/Sync semantics
- Writing `records` from Intake
- Outbound-link scraping from seed domains (different product)

## Success Criteria

- New Ahrefs/Sim imports land only in `backlink-candidates.json`
- Intake can drain the staging pool with automatic admit/reject
- Only form-detectable, dummy-fillable pages enter `backlinks.json`
- Admitted rows carry best-effort `link_type`, `link_rel`, `link_category`
- Automatic continues to operate solely on `backlinks.json`
