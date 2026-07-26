# Auto Backlink Integration POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the LinkMaster control plane and Link Booster executor together, then run one supervised 20–30 Item POC Campaign.

**Architecture:** Keep `/Users/coderlim/Projects/auto-backlink` as the contract and evidence repository. First validate API/version/privacy boundaries against local fixtures, then rehearse migrations and completion archival on copies of JSON data, and only then execute a real Campaign with explicit user confirmation for every submission.

**Tech Stack:** Node.js built-ins, JSON Schema documentation, LinkMaster Next.js API, Plasmo Chrome extension, Markdown POC report.

---

### Task 1: Publish the Version 1 Contract

**Files:**
- Create: `/Users/coderlim/Projects/auto-backlink/contracts/automation-api-v1.md`
- Create: `/Users/coderlim/Projects/auto-backlink/contracts/examples/active-campaign.json`
- Create: `/Users/coderlim/Projects/auto-backlink/contracts/examples/next-item.json`
- Create: `/Users/coderlim/Projects/auto-backlink/contracts/examples/item-patch.json`

- [ ] **Step 1: Document request and response envelopes**

Every successful JSON response uses:

```json
{
  "apiVersion": 1,
  "data": {}
}
```

Every JSON error uses:

```json
{
  "apiVersion": 1,
  "error": {
    "code": "stable_machine_code",
    "message": "Human-readable explanation"
  }
}
```

Document every route and method, including the admin-only Campaign list and manual correction mode, Bearer/CORS behavior, 204 responses, status enums, terminal statuses, and maximum string lengths.

- [ ] **Step 2: Add sanitized examples**

Examples must include `campaignId`, `itemId`, `backlinkId`, target `name/domain/email`, Item URL/status/order, observed metadata, and result summary. They must not include `details`, passwords, GitHub tokens, screenshots, HTML, or full model traces.

- [ ] **Step 3: Cross-check both implementation plans**

Verify every field used in the LinkMaster and extension plans has one spelling and one type in the contract, especially:

```text
link_type
link_rel
link_category
targetSite
observedMetadata
failureReason
```

- [ ] **Step 4: Commit**

```bash
git add contracts
git commit -m "docs: publish automation api v1 contract"
```

### Task 2: Add a Live Contract Smoke Test

**Files:**
- Create: `/Users/coderlim/Projects/auto-backlink/scripts/verify-api-contract.mjs`

- [ ] **Step 1: Implement environment validation**

Require:

```text
LINKMASTER_BASE_URL
AUTOMATION_API_TOKEN
```

Normalize the base URL and exit non-zero without printing the token when either value is missing.

- [ ] **Step 2: Implement read-only checks**

Using Node `fetch` and `node:assert/strict`:

1. call `GET /api/automation/campaigns/active`;
2. accept 204 when no Campaign exists;
3. otherwise assert `apiVersion === 1`, Campaign status is `active`, and no forbidden keys exist recursively;
4. call `GET /api/automation/campaigns/:id/next`;
5. assert the Item and target snapshot match the contract.

Forbidden keys:

```js
const forbidden = new Set([
  "details",
  "password",
  "githubToken",
  "github_token",
  "screenshot",
  "html"
])
```

- [ ] **Step 3: Run against local LinkMaster**

```bash
LINKMASTER_BASE_URL=http://127.0.0.1:3000 \
AUTOMATION_API_TOKEN=dev-secret \
node scripts/verify-api-contract.mjs
```

Expected: PASS with either “no active campaign” or validated Campaign/Item IDs; token is never logged.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-api-contract.mjs
git commit -m "test: add automation api contract smoke test"
```

### Task 3: Rehearse Data Migration and Campaign Completion

**Files:**
- Create: `/Users/coderlim/Projects/auto-backlink/docs/superpowers/poc/2026-07-24-migration-rehearsal.md`

- [ ] **Step 1: Work on copied JSON data**

Copy LinkMaster JSON files into a temporary directory:

```bash
tmpdir="$(mktemp -d)"
cp /Users/coderlim/Projects/link-master/data/json/{backlinks,records,sites,campaigns}.json "$tmpdir/"
```

Point the migration and local data store at the copy; do not rehearse by modifying production GitHub JSON.

- [ ] **Step 2: Verify migration invariants**

Record:

- object counts before and after;
- zero lost backlink IDs;
- zero lost record IDs;
- old backlink `type` values equal new `link_type` values;
- old backlink `link_type` values equal new `link_rel` values;
- all target sites normalize consistently while preserving `/yt-converter`;
- site identity fields exist and missing values are visible.

- [ ] **Step 3: Rehearse idempotent completion**

Use a synthetic Campaign containing one `published`, one `cannot_submit`, and one `not_visible_after_submit` Item. Complete it twice and verify:

- backlinks and records are byte-identical after the second completion;
- only the first two outcomes are archived in records;
- all three results remain in the Campaign;
- explicit metadata overwrites and `Unknown` does not.

- [ ] **Step 4: Write the rehearsal report**

Include commands, counts, hashes, failures, and the decision to proceed or stop. Do not include credentials or sensitive `details`.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/poc/2026-07-24-migration-rehearsal.md
git commit -m "docs: record automation migration rehearsal"
```

### Task 4: Run a No-Submission End-to-End Fixture Campaign

**Files:**
- Create: `/Users/coderlim/Projects/auto-backlink/docs/superpowers/poc/2026-07-24-fixture-e2e.md`

- [ ] **Step 1: Start both applications**

```bash
cd /Users/coderlim/Projects/link-master
AUTOMATION_API_TOKEN=dev-secret pnpm dev
```

In another terminal:

```bash
cd /Users/coderlim/Projects/link-booster-extension
pnpm dev
```

- [ ] **Step 2: Load the unpacked extension**

Load `/Users/coderlim/Projects/link-booster-extension/build/chrome-mv3-dev`, set LinkMaster URL/token, and confirm “Test Connection” succeeds.

- [ ] **Step 3: Create a fixture Campaign**

Use local fixture URLs representing:

```text
UserName Link
HTML body link
no comment form
login required
CAPTCHA
moderation
explicit reject
silent reject
```

Create 20 unique fixture URLs by varying path names across these response types. Keep the production 20–30 validation unchanged.

- [ ] **Step 4: Exercise the entire state flow**

Confirm:

- one automation tab is created and reused;
- each Item is inspected, generated, and filled;
- every Item pauses at `awaiting_review`;
- the user-triggered test submit produces the expected terminal result;
- Item save finishes before next Item navigation;
- no real external request receives a comment.

- [ ] **Step 5: Record evidence**

Document each fixture, expected/actual status, API errors, and any manual correction. Capture screenshots locally but do not commit them unless they contain no URL tokens, emails, or page content.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/poc/2026-07-24-fixture-e2e.md
git commit -m "docs: record fixture campaign e2e"
```

### Task 5: Prepare the Real POC

**Files:**
- Create: `/Users/coderlim/Projects/auto-backlink/docs/superpowers/poc/2026-07-24-real-campaign-checklist.md`

- [ ] **Step 1: Verify prerequisites**

Checklist:

- LinkMaster and extension builds pass.
- Migration rehearsal passed.
- Fixture E2E passed.
- `AUTOMATION_API_TOKEN` differs from the dev token.
- GitHub repository remains private.
- Every selectable target site has name, normalized domain, and email.
- No active Campaign exists.
- User is present to review every submission.

- [ ] **Step 2: Back up production JSON**

Before migration or Campaign creation, copy `backlinks.json`, `records.json`, `sites.json`, and `campaigns.json` to timestamped local files outside the repositories. Record SHA-256 hashes in the checklist, not file contents.

- [ ] **Step 3: Run production migration**

Run the migration dry run, inspect counts, then run `--write`. Build LinkMaster after the migration. Stop if IDs disappear, JSON parsing fails, target paths change, or identity fields are missing.

- [ ] **Step 4: Select the POC target**

Choose one target site and 20–30 Items in LinkMaster. Confirm the fixed list contains no root URLs, no inaccessible/unsubmittable entries, and no exact `(targetSite, backlinkId)` duplicates.

- [ ] **Step 5: Commit the checklist**

```bash
git add docs/superpowers/poc/2026-07-24-real-campaign-checklist.md
git commit -m "docs: prepare supervised backlink poc"
```

### Task 6: Execute and Evaluate the 20–30 Item POC

**Files:**
- Create: `/Users/coderlim/Projects/auto-backlink/docs/superpowers/poc/2026-07-24-real-campaign-results.md`

- [ ] **Step 1: Execute under supervision**

For every Item:

1. inspect source URL and detected form/link metadata;
2. review the generated 1–3 sentence comment;
3. choose Submit and Continue or Skip;
4. wait for terminal result persistence;
5. stop immediately on API auth, GitHub conflict, wrong-target fill, or unexpected duplicate submission.

- [ ] **Step 2: Complete the Campaign**

Complete only after all Items are terminal. Verify LinkMaster batch-corrects backlinks and archives only `published`/`cannot_submit` records.

- [ ] **Step 3: Calculate POC metrics**

Report counts and rates for:

```text
page accessible
article extracted
comment form detected
form filled
awaiting manual review
published
pending moderation
silent reject
explicit reject
cannot submit
skipped
failed
metadata fields corrected
manual time per Item
```

- [ ] **Step 4: Audit correctness**

Manually sample at least five corrected backlinks and every `published` result. Confirm target URL, username/body placement, link type, link rel, category, and final status.

- [ ] **Step 5: Make the D1 decision**

The report must state one outcome:

```text
continue POC on GitHub JSON
move to D1 before expanding
stop and revise the detector/executor
```

Base the decision on the design's migration triggers and observed failure rate, not backlink volume alone.

- [ ] **Step 6: Commit and push the sanitized report**

```bash
git add docs/superpowers/poc/2026-07-24-real-campaign-results.md
git commit -m "docs: report supervised backlink poc results"
git push
```
