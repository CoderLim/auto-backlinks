# LinkMaster Campaign Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the POC Campaign control plane, automation API, data migration, and Campaign management UI to `/Users/coderlim/Projects/link-master`.

**Architecture:** Keep GitHub JSON as the single-writer POC store. Put URL normalization, candidate selection, state transitions, metadata correction, and record archival in pure modules under `src/lib/automation`; Next.js routes authenticate and delegate to those modules. The admin UI creates and monitors one active Campaign, while the extension uses the versioned Bearer API.

**Tech Stack:** Next.js 14 App Router, React 18, JavaScript/TypeScript, Octokit, Vitest, Tailwind, lucide-react.

---

### Task 1: Add a Node Test Harness

**Files:**
- Modify: `/Users/coderlim/Projects/link-master/package.json`
- Create: `/Users/coderlim/Projects/link-master/vitest.config.mjs`
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/normalization.test.js`

- [ ] **Step 1: Add the failing smoke test**

```js
import { describe, expect, it } from 'vitest';
import { normalizeTargetSite } from './normalization';

describe('normalizeTargetSite', () => {
  it('normalizes equivalent target site URLs without dropping a subpath', () => {
    expect(normalizeTargetSite('TEKKEN3.cc/')).toBe('https://tekken3.cc');
    expect(normalizeTargetSite('https://limbuilder.github.io/yt-converter/?x=1#top'))
      .toBe('https://limbuilder.github.io/yt-converter');
  });
});
```

- [ ] **Step 2: Add Vitest**

Add scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Add `vitest` to `devDependencies`, then create:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    clearMocks: true
  }
});
```

- [ ] **Step 3: Install and verify the expected failure**

Run:

```bash
pnpm install
pnpm test
```

Expected: FAIL because `src/lib/automation/normalization.js` does not exist.

- [ ] **Step 4: Commit the harness**

```bash
git add package.json pnpm-lock.yaml vitest.config.mjs src/lib/automation/normalization.test.js
git commit -m "test: add campaign domain test harness"
```

### Task 2: Normalize and Migrate Existing JSON Schemas

**Files:**
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/normalization.js`
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/migrations.js`
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/migrations.test.js`
- Create: `/Users/coderlim/Projects/link-master/scripts/migrate-automation-data.js`
- Modify: `/Users/coderlim/Projects/link-master/data/json/categories.json`

- [ ] **Step 1: Add migration tests**

Cover these exact transformations:

```js
expect(migrateBacklink({
  id: 'b1',
  link: 'https://source.example/post',
  type: 'UserName Link',
  link_type: 'Nofollow',
  link_category: 'gaming'
})).toMatchObject({
  id: 'b1',
  link_type: 'UserName Link',
  link_rel: 'Nofollow',
  link_category: 'gaming'
});

expect(migrateRecord({
  id: 'r1',
  targetSite: 'tekken3.cc/',
  backlinkId: 'b1'
})).toMatchObject({
  targetSite: 'https://tekken3.cc',
  backlinkId: 'b1'
});
```

Also assert that `migrateBacklink` removes legacy `type`, reads both old fields before writing either new field, and is idempotent.

- [ ] **Step 2: Implement canonical target URL normalization**

```js
export function normalizeTargetSite(input) {
  const value = input.trim();
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.port = '';
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}
```

- [ ] **Step 3: Implement idempotent object migrations**

Use the old values before constructing the new object:

```js
const normalizeLinkRel = (value) =>
  ['Dofollow', 'Nofollow'].includes(value) ? value : 'Unknown';

export const migrateBacklink = (backlink) => {
  const {
    type: legacyType,
    link_type: currentLinkType,
    link_rel: currentLinkRel,
    ...rest
  } = backlink;

  if (currentLinkRel) {
    return {
      ...rest,
      link_type: currentLinkType ?? legacyType ?? 'Text Link',
      link_rel: normalizeLinkRel(currentLinkRel)
    };
  }

  return {
    ...rest,
    link_type: legacyType ?? 'Text Link',
    link_rel: normalizeLinkRel(currentLinkType)
  };
};

export const migrateRecord = (record) => ({
  ...record,
  targetSite: normalizeTargetSite(record.targetSite)
});

export const migrateSite = (site) => ({
  name: site.name ?? '',
  domain: normalizeTargetSite(site.domain),
  email: site.email ?? '',
  tagline: site.tagline ?? '',
  description: site.description ?? ''
});
```

`migrateBacklink` must preserve an already migrated `link_rel`, normalize only `Dofollow`, `Nofollow`, and `Unknown`, and never rewrite `link_category` during the one-time schema migration.

- [ ] **Step 4: Add a dry-run migration CLI**

The script reads `backlinks.json`, `records.json`, and `sites.json`, prints changed object counts by default, and writes only with `--write`. Before writing, copy originals into `MIGRATION_BACKUP_DIR` or a timestamped directory under the OS temp directory. Use `fs.readFileSync`, `JSON.parse`, and `JSON.stringify(data, null, 2)`; do not call the GitHub API.

- [ ] **Step 5: Replace category options**

Set `categories.json.categories` to the 21 approved values and keep these link types:

```json
[
  "Text Link",
  "HTML Link",
  "Markdown Link",
  "BBCode Link",
  "UserName Link"
]
```

- [ ] **Step 6: Run tests and a dry run**

```bash
pnpm test
node scripts/migrate-automation-data.js
```

Expected: PASS; dry run reports counts and does not change `git status`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/automation scripts/migrate-automation-data.js data/json/categories.json
git commit -m "feat: add backlink automation data migration"
```

### Task 3: Implement Campaign Selection and State Rules

**Files:**
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/campaign.js`
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/campaign.test.js`

- [ ] **Step 1: Write candidate selection tests**

Test:

- root URLs are excluded;
- `inaccessible` and `unsubmittable` are excluded;
- normalized `(targetSite, backlinkId)` records are excluded;
- requested count outside 20–30 throws;
- insufficient candidates throws with the available count;
- sufficient data yields approximately 25% pages with any historical record and 75% without one;
- returned Items have stable `itemId`, fixed order, snapshot URL, and `pending` status.

- [ ] **Step 2: Write transition tests**

Allow:

```text
pending -> inspecting
inspecting -> awaiting_review | cannot_submit | failed | skipped
awaiting_review -> submitted | skipped | failed
submitted -> published | pending_moderation | not_visible_after_submit | explicit_reject | failed
```

Reject all transitions out of terminal states.

Separately test `correctCampaignItemResult`: it requires a terminal current status, a terminal corrected status, a non-empty correction note, and never changes target site, backlink ID, URL, or submission timestamps.

- [ ] **Step 3: Implement pure Campaign functions**

Implement the transition guard directly:

```js
export const ITEM_TERMINAL_STATUSES = new Set([
  'published', 'pending_moderation', 'not_visible_after_submit',
  'explicit_reject', 'skipped', 'cannot_submit', 'failed'
]);

const ALLOWED_TRANSITIONS = {
  pending: new Set(['inspecting']),
  inspecting: new Set(['awaiting_review', 'cannot_submit', 'failed', 'skipped']),
  awaiting_review: new Set(['submitted', 'skipped', 'failed']),
  submitted: new Set([
    'published',
    'pending_moderation',
    'not_visible_after_submit',
    'explicit_reject',
    'failed'
  ])
};

export const getNextPendingItem = (campaign) =>
  campaign.items.find(({ status }) => status === 'pending') ?? null;

export const canCompleteCampaign = (campaign) =>
  campaign.items.length > 0 &&
  campaign.items.every(({ status }) => ITEM_TERMINAL_STATUSES.has(status));

export function updateCampaignItem(campaign, itemId, patch, now) {
  const index = campaign.items.findIndex((item) => item.itemId === itemId);
  if (index < 0) throw new Error('campaign_item_not_found');
  const current = campaign.items[index];
  if (!ALLOWED_TRANSITIONS[current.status]?.has(patch.status)) {
    throw new Error('invalid_item_transition');
  }
  const items = campaign.items.slice();
  items[index] = { ...current, ...patch, updatedAt: now() };
  return { ...campaign, items, updatedAt: now() };
}
```

Implement `correctCampaignItemResult(campaign, itemId, status, note, now)` as the only terminal-to-terminal correction path. Implement `createCampaign` with injected clocks, UUIDs, and randomness: validate 20–30, filter eligible non-root URLs, split by whether any record references the `backlinkId`, shuffle both pools, take `Math.round(count * 0.25)` historical Items when available, fill shortages from the other pool, and throw `insufficient_candidates:<available>` when the combined pool is too small. Store only snapshots required by the extension; never copy `details`.

- [ ] **Step 4: Run and commit**

```bash
pnpm test
git add src/lib/automation/campaign.js src/lib/automation/campaign.test.js
git commit -m "feat: add campaign selection and state rules"
```

### Task 4: Add Campaign Persistence and Idempotent Archival

**Files:**
- Create: `/Users/coderlim/Projects/link-master/data/json/campaigns.json`
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/campaign-store.js`
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/archive.js`
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/archive.test.js`
- Modify: `/Users/coderlim/Projects/link-master/src/lib/data-source.js`

- [ ] **Step 1: Initialize the store**

```json
[]
```

- [ ] **Step 2: Test archival**

Given a completed Item, assert:

- explicit `observedMetadata.topicCategory`, `linkType`, and `linkRel` overwrite only their matching backlink fields;
- `Unknown` and missing observations do not overwrite;
- `published` and `cannot_submit` upsert one record by normalized `(targetSite, backlinkId)`;
- repeated completion produces identical backlinks and records;
- other terminal outcomes remain only in `campaigns.json`.

- [ ] **Step 3: Implement store operations**

Export `readCampaigns`, `createStoredCampaign`, `patchStoredItem`, `cancelStoredCampaign`, and `completeStoredCampaign`. Each function reads through `readJSONData`, applies one pure transformation, and writes through the conflict-aware updater.

`createStoredCampaign` must reject a second active Campaign. `completeStoredCampaign` writes corrected backlinks, then records, then marks the Campaign completed. Every operation must be safe to repeat.

- [ ] **Step 4: Add one-conflict retry support**

Extend `data-source.js` with `updateJSONDataWithRetry(filePath, updateFn, commitMessage, maxConflicts = 1)`.

On an Octokit 409/422 SHA conflict, re-read once, rerun `updateFn`, and write with the fresh SHA. Re-throw any other error or a second conflict.

- [ ] **Step 5: Run and commit**

```bash
pnpm test
git add data/json/campaigns.json src/lib/data-source.js src/lib/automation
git commit -m "feat: persist and archive poc campaigns"
```

### Task 5: Add Automation Authentication, CORS, and Routes

**Files:**
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/http.js`
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/http.test.js`
- Create: `/Users/coderlim/Projects/link-master/src/app/api/automation/campaigns/route.js`
- Create: `/Users/coderlim/Projects/link-master/src/app/api/automation/campaigns/active/route.js`
- Create: `/Users/coderlim/Projects/link-master/src/app/api/automation/campaigns/[id]/next/route.js`
- Create: `/Users/coderlim/Projects/link-master/src/app/api/automation/campaigns/[id]/items/[itemId]/route.js`
- Create: `/Users/coderlim/Projects/link-master/src/app/api/automation/campaigns/[id]/complete/route.js`
- Create: `/Users/coderlim/Projects/link-master/src/app/api/automation/campaigns/[id]/cancel/route.js`

- [ ] **Step 1: Test Bearer authentication**

Assert missing/malformed/wrong tokens return false and an exact `AUTOMATION_API_TOKEN` returns true. Use `crypto.timingSafeEqual` only after checking equal byte length.

- [ ] **Step 2: Implement shared HTTP helpers**

Export `isAutomationRequest`, `isAdminRequest`, `withAutomationCors`, and `optionsResponse`.

Use `Access-Control-Allow-Origin: *` for the POC, allow `Authorization, Content-Type`, and never expose `GITHUB_TOKEN`.

- [ ] **Step 3: Implement the six versioned routes**

Required behavior:

- `POST campaigns`: admin cookie required; validate site `name`, `domain`, `email`; return 409 if active, 422 if insufficient candidates.
- `GET campaigns`: admin cookie required; return Campaign history for the management page; Bearer-only callers receive 403.
- `GET active`: Bearer required; return 204 when none exists.
- `GET next`: Bearer required; return the next pending Item plus the Campaign target snapshot; return 204 when exhausted.
- `PATCH item`: Bearer required; validate state transition and payload size.
- `PATCH item`: an admin cookie may instead perform a terminal result correction when `manualCorrection: true` and a correction note are supplied.
- `POST complete`: admin cookie or Bearer; reject unless every Item is terminal.
- `POST cancel`: admin cookie or Bearer; mark active Campaign cancelled.

Every route must implement `OPTIONS` using `optionsResponse`.

- [ ] **Step 4: Run tests and build**

```bash
pnpm test
pnpm build
```

Expected: PASS and successful Next.js build.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automation/http* src/app/api/automation
git commit -m "feat: expose campaign automation api"
```

### Task 6: Update Existing Backlink and Site Surfaces

**Files:**
- Modify: `/Users/coderlim/Projects/link-master/src/app/api/backlinks/route.js`
- Modify: `/Users/coderlim/Projects/link-master/src/app/api/backlinks/create/route.js`
- Modify: `/Users/coderlim/Projects/link-master/src/app/api/records/route.js`
- Modify: `/Users/coderlim/Projects/link-master/src/app/api/sites/route.js`
- Modify: `/Users/coderlim/Projects/link-master/src/app/admin/backlinks/page.js`
- Modify: `/Users/coderlim/Projects/link-master/src/app/admin/backlinks/create/page.js`
- Modify: `/Users/coderlim/Projects/link-master/src/app/admin/backlinks/edit/page.js`
- Modify: `/Users/coderlim/Projects/link-master/src/app/admin/records/page.js`
- Modify: `/Users/coderlim/Projects/link-master/src/app/admin/sites/page.tsx`

- [ ] **Step 1: Replace legacy field reads**

Use:

```text
link_type: Text Link | HTML Link | Markdown Link | BBCode Link | UserName Link
link_rel: Dofollow | Nofollow | Unknown
```

Keep API query `linkType` but bind it to the new `link_type`; add `linkRel` for `link_rel`. Update labels to “Link Type” and “Link Rel”.

- [ ] **Step 2: Add site identity fields**

Update the site editor type and form:

```ts
type Site = {
  name: string
  domain: string
  email: string
  tagline: string
  description: string
}
```

Validate name, normalized domain, and email before saving. Use `readJSONData`/`writeJSONData` in the sites route instead of a separate Octokit implementation.

- [ ] **Step 3: Run migration with write mode**

```bash
node scripts/migrate-automation-data.js --write
pnpm test
pnpm build
```

Inspect the diff: no backlink loses its former `type` or former `link_type` value; target site paths remain intact.

- [ ] **Step 4: Commit**

```bash
git add data/json src/app/api src/app/admin
git commit -m "feat: migrate backlink and site management fields"
```

### Task 7: Build the Campaign Management Screen

**Files:**
- Create: `/Users/coderlim/Projects/link-master/src/app/admin/campaigns/page.tsx`
- Create: `/Users/coderlim/Projects/link-master/src/components/campaigns/CampaignProgress.tsx`
- Modify: `/Users/coderlim/Projects/link-master/src/components/Navigation.js`

- [ ] **Step 1: Add the navigation entry**

Add `/admin/campaigns` labelled `Campaigns` between Sites and Backlinks.

- [ ] **Step 2: Implement Campaign creation**

The screen must:

- load sites;
- require a site with name/domain/email;
- accept an integer from 20 through 30;
- create a Campaign without exposing individual task dispatch;
- display API validation errors, including available candidate count.

- [ ] **Step 3: Implement progress and result inspection**

Render a compact table with order, source URL, status, `link_type`, `link_rel`, category, failure reason, and timestamps. Add icon buttons with tooltips for refresh and cancel. Do not use nested cards or marketing copy.

- [ ] **Step 4: Add manual result correction**

Call the existing Item PATCH route with an admin cookie, `manualCorrection: true`, terminal `status`, and a non-empty note. The route must reject correction payloads that attempt to change URL, target site, generated comment, or submission timestamps.

- [ ] **Step 5: Verify responsive UI**

Run:

```bash
pnpm dev
```

Check `/admin/campaigns` at 1440x900 and 390x844. Confirm the form, progress table, long URLs, status labels, and actions do not overlap.

- [ ] **Step 6: Run and commit**

```bash
pnpm test
pnpm build
git add src/app/admin/campaigns src/components/campaigns src/components/Navigation.js
git commit -m "feat: add campaign management ui"
```

### Task 8: LinkMaster Verification

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run the complete automated suite**

```bash
pnpm test
pnpm build
```

Expected: all tests pass and Next.js builds.

- [ ] **Step 2: Exercise local API flow**

With local JSON enabled and `AUTOMATION_API_TOKEN` configured:

```text
create Campaign -> get active -> get next -> patch inspecting ->
patch skipped -> finish remaining fixtures -> complete
```

Verify `backlinks.json` and `records.json` change only on complete.

- [ ] **Step 3: Record the contract version**

Add `schemaVersion: 1` to every Campaign and return `apiVersion: 1` from automation responses.

- [ ] **Step 4: Confirm the worktree is clean**

```bash
git status --short
```

Expected: no output. If verification exposed a defect, commit its exact files in the task where it was fixed before rerunning this step.
