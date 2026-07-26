# Direct Backlink Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace user-created Campaigns with a records-driven extension flow that retrieves, processes, and immediately persists one backlink at a time.

**Architecture:** LinkMaster exposes valid targets, the first ordered unprocessed backlink, and an idempotent terminal-result endpoint. Link Booster keeps only the current page in React state, saves every terminal outcome before advancing, and treats `records.json` as the sole processed marker. Legacy Campaign code and data remain untouched but are no longer used by the primary UI.

**Tech Stack:** Next.js 14 route handlers, Vitest, GitHub/local JSON data source, Plasmo, React, TypeScript, Chrome MV3

---

## File Map

LinkMaster:

- Create `src/lib/automation/direct-processing.js`: candidate selection, target
  validation, result validation, record upsert, and metadata correction.
- Create `src/lib/automation/direct-processing.test.js`: pure domain tests.
- Create `src/lib/automation/direct-processing-store.js`: JSON reads and immediate
  per-result writes.
- Create `src/lib/automation/direct-processing-store.test.js`: isolated in-memory
  store tests.
- Create `src/app/api/automation/targets/route.js`: minimal bearer target list.
- Create `src/app/api/automation/next/route.js`: read-only next candidate.
- Create `src/app/api/automation/results/route.js`: immediate terminal result.
- Modify `src/components/Navigation.js`: remove Campaign from primary navigation.

Link Booster:

- Modify `src/automation/types.ts`: add direct target, Item, context, and result
  types without Campaign IDs or Item states.
- Modify `src/automation/api-client.ts`: add targets, next, and save-result calls.
- Modify `src/__tests__/automation-api.test.ts`: cover the new methods.
- Create `src/sidepanel/AutomaticRunner.tsx`: reuse the existing tab/form/comment
  modules with immediate result persistence.
- Modify `src/sidepanel/index.tsx`: make Automatic the primary mode.
- Modify `src/options/index.tsx`: test connection through the target endpoint.
- Modify `scripts/run-unit-tests.cjs`: include any new pure test module.

Integration:

- Modify `contracts/automation-api-v1.md`.
- Modify `docs/superpowers/poc/2026-07-24-real-campaign-checklist.md` into a
  direct-processing checklist.
- Update packaged build evidence and hashes.

### Task 1: LinkMaster Direct Processing Domain

**Files:**
- Create: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/lib/automation/direct-processing.js`
- Test: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/lib/automation/direct-processing.test.js`

- [ ] **Step 1: Write failing selection tests**

Cover stable array ordering, root URL exclusion, inaccessible/unsubmittable
exclusion, normalized target-record deduplication, and null exhaustion:

```js
expect(
  selectNextBacklink({
    targetSite: 'HTTPS://WWW.CSVVIEWER.NET/',
    backlinks,
    records
  })
).toEqual(backlinks[2]);
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
pnpm vitest run src/lib/automation/direct-processing.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement ordered selection**

Export:

```js
export function selectNextBacklink({ targetSite, backlinks, records }) {
  const canonical = normalizeTargetSite(targetSite);
  return backlinks.find((backlink) =>
    isEligiblePage(backlink) &&
    !records.some((record) =>
      matchesProcessingKey(record, canonical, backlink.id)
    )
  ) ?? null;
}
```

Use the existing `normalizeTargetSite`. Eligible pages must use HTTP(S), have a
non-root pathname, and not have `inaccessible` or `unsubmittable` status.

- [ ] **Step 4: Write failing result tests**

Test all seven terminal statuses, URL/backlink validation, normalized key
idempotency, conflicting outcomes, preservation of `createdAt`, and explicit
metadata overwrites.

- [ ] **Step 5: Implement result transformation**

Export constants and pure functions:

```js
export const DIRECT_RESULT_STATUSES = Object.freeze([
  'published',
  'pending_moderation',
  'not_visible_after_submit',
  'explicit_reject',
  'skipped',
  'cannot_submit',
  'failed'
]);

export function buildDirectRecord({ existing, result, canonicalTarget, now, id }) {
  return {
    ...(existing ?? { id, createdAt: now }),
    targetSite: canonicalTarget,
    backlinkId: result.backlinkId,
    status: result.status,
    generatedComment: result.generatedComment ?? '',
    failureReason: result.failureReason ?? '',
    submittedAt: result.submittedAt,
    verifiedAt: result.verifiedAt,
    updatedAt: now
  };
}
```

Add `applyDirectMetadata(backlink, observedMetadata)` using the existing
`link_category`, `link_type`, and `link_rel` fields. Ignore absent, empty, and
`Unknown` values.

- [ ] **Step 6: Run domain tests and commit**

Run:

```bash
pnpm vitest run src/lib/automation/direct-processing.test.js
```

Expected: all tests pass.

Commit:

```bash
git add src/lib/automation/direct-processing.js src/lib/automation/direct-processing.test.js
git commit -m "feat: add direct backlink processing rules"
```

### Task 2: LinkMaster Immediate Store And API

**Files:**
- Create: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/lib/automation/direct-processing-store.js`
- Test: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/lib/automation/direct-processing-store.test.js`
- Create: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/app/api/automation/targets/route.js`
- Create: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/app/api/automation/next/route.js`
- Create: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/app/api/automation/results/route.js`

- [ ] **Step 1: Write failing in-memory store tests**

Use the `createCampaignStore` dependency-injection pattern. Assert:

```js
await store.saveDirectResult(result, () => NOW, () => 'record-id');
expect(files.get('data/json/records.json')).toContainEqual(
  expect.objectContaining({
    targetSite: 'https://csvviewer.net',
    backlinkId: 'backlink-1',
    status: 'skipped'
  })
);
expect(files.get('data/json/backlinks.json')[0].link_rel).toBe('Nofollow');
```

Also prove a repeated identical write is byte-for-byte idempotent and a
different terminal status throws `result_already_recorded`.

- [ ] **Step 2: Implement the store**

Expose:

```js
export function createDirectProcessingStore(io = defaultIo) {
  return {
    listValidTargets,
    getNextDirectItem,
    saveDirectResult
  };
}
```

`listValidTargets()` returns selection data only. `getNextDirectItem(targetSite)`
returns the selected site snapshot plus backlink ID and URL. `saveDirectResult`
validates against stored site/backlink data, updates explicit backlink metadata,
then upserts the direct record.

- [ ] **Step 3: Run store tests**

Run:

```bash
pnpm vitest run src/lib/automation/direct-processing-store.test.js
```

Expected: all tests pass without touching repository JSON files.

- [ ] **Step 4: Implement bearer routes**

Each route checks `isAutomationRequest`, returns `automationJson`,
`automationEmpty`, or `automationError`, and exports `OPTIONS`.

The next route reads:

```js
const targetSite = new URL(request.url).searchParams.get('targetSite');
```

The results route parses with `readAutomationJson` and maps validation errors to
400/404/409/422 without returning private data.

- [ ] **Step 5: Run LinkMaster tests and build**

Run:

```bash
pnpm test
pnpm build
```

Expected: all tests pass and the production build exits zero.

- [ ] **Step 6: Commit**

```bash
git add src/lib/automation/direct-processing-store.js src/lib/automation/direct-processing-store.test.js src/app/api/automation/targets src/app/api/automation/next src/app/api/automation/results
git commit -m "feat: expose direct backlink processing api"
```

### Task 3: Remove Campaign From LinkMaster Primary Workflow

**Files:**
- Modify: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/components/Navigation.js`
- Modify: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/app/admin/campaigns/page.tsx`

- [ ] **Step 1: Remove the Campaign navigation entry**

Keep Records, Sites, Backlinks, and Statistics. Do not delete legacy Campaign
routes, code, or JSON.

- [ ] **Step 2: Make the legacy page diagnostic-only**

Remove target/count/create controls. Change headings to `Automation Runs` and
state that the page contains legacy diagnostics. Preserve history, correction,
refresh, complete, and cancel capabilities for existing active data.

- [ ] **Step 3: Run lint/build and commit**

```bash
pnpm build
git add src/components/Navigation.js src/app/admin/campaigns/page.tsx
git commit -m "refactor: retire manual campaign creation"
```

### Task 4: Link Booster Direct API Client

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/src/automation/types.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/src/automation/api-client.ts`
- Test: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/src/__tests__/automation-api.test.ts`

- [ ] **Step 1: Write failing client tests**

Cover:

```ts
await client.listTargets()
await client.getNextDirectItem("https://csvviewer.net")
await client.saveDirectResult(result)
```

Assert URL encoding, bearer headers, JSON body, 204 handling, GET retry once, and
POST never retrying.

- [ ] **Step 2: Add direct types**

Define `TargetSiteOption`, `DirectItem`, `DirectItemContext`,
`DirectResultStatus`, and `DirectResultInput`. Reuse `TargetSiteSnapshot`,
`ObservedMetadata`, and `FormInspection`.

- [ ] **Step 3: Add client methods**

```ts
listTargets(): Promise<TargetSiteOption[]>
getNextDirectItem(targetSite: string): Promise<DirectItemContext | null>
saveDirectResult(result: DirectResultInput): Promise<DirectRecord>
```

Keep legacy Campaign methods temporarily so old code compiles until Task 5
replaces the runner.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test
git add src/automation/types.ts src/automation/api-client.ts src/__tests__/automation-api.test.ts
git commit -m "feat: add direct processing api client"
```

### Task 5: Link Booster Automatic Runner

**Files:**
- Create: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/src/sidepanel/AutomaticRunner.tsx`
- Modify: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/src/sidepanel/index.tsx`
- Modify: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/src/options/index.tsx`
- Modify: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/scripts/run-unit-tests.cjs`

- [ ] **Step 1: Extract reusable page processing from CampaignRunner**

Reuse `CampaignTabController`, `sendCampaignTabMessage`, `fill-comment-form`,
`get-campaign-comment`, form inspection, comment validation, verification, and
metadata conversion. Do not port Campaign fetch, patch, complete, cancel, Item
transition, or reload-recovery branches.

- [ ] **Step 2: Implement target and Item state**

AutomaticRunner holds:

```ts
const [targets, setTargets] = useState<TargetSiteOption[]>([])
const [selectedTarget, setSelectedTarget] = useState("")
const [context, setContext] = useState<DirectItemContext | null>(null)
const [pendingResult, setPendingResult] = useState<DirectResultInput | null>(null)
```

Load targets on mount, select the only/first target, and do not start until the
user clicks Start.

- [ ] **Step 3: Implement direct advancement**

`loadNext()` calls `getNextDirectItem`. For a candidate it opens, inspects,
generates, fills, and waits at review. Unsupported pages construct a terminal
result, save it, then call `loadNext()` again.

- [ ] **Step 4: Implement immediate terminal saving**

`saveAndContinue(result)` must call `saveDirectResult(result)` before requesting
another Item. On failure, retain `pendingResult`, show Retry Save, and do not
advance.

Submit and Continue performs the existing single submit click and verification,
then saves the verified terminal status. Skip saves `skipped`. No intermediate
`inspecting`, `awaiting_review`, or `submitted` request is sent to LinkMaster.

- [ ] **Step 5: Replace user-facing Campaign terminology**

Use Automatic, current URL, detected metadata, comment editor, Start, Pause,
Submit and Continue, Skip, Stop, and Retry Save. Stop closes the dedicated tab
and returns to idle without a server mutation.

Update the options connection test to call `listTargets()` and report the number
of usable target websites.

- [ ] **Step 6: Run tests, build, and package**

```bash
pnpm test
pnpm build
pnpm package
unzip -t build/chrome-mv3-prod.zip
```

Expected: all unit tests pass, production build/package exit zero, and the ZIP
has no archive errors.

- [ ] **Step 7: Commit**

```bash
git add src/sidepanel/AutomaticRunner.tsx src/sidepanel/index.tsx src/options/index.tsx scripts/run-unit-tests.cjs
git commit -m "feat: process backlinks without campaigns"
```

### Task 6: Integration Contract And Verification

**Files:**
- Modify: `/Users/coderlim/Projects/auto-backlink/contracts/automation-api-v1.md`
- Modify: `/Users/coderlim/Projects/auto-backlink/docs/superpowers/poc/2026-07-24-real-campaign-checklist.md`
- Modify: `/Users/coderlim/Projects/auto-backlink/docs/superpowers/poc/2026-07-24-fixture-e2e.md`

- [ ] **Step 1: Update the contract**

Document targets, next, and results request/response schemas; immediate record
semantics; terminal statuses; validation errors; and that Campaign routes are
legacy and not used by the extension.

- [ ] **Step 2: Update acceptance evidence**

Replace Campaign creation/count steps with target selection and direct Start.
Record fresh test counts, build results, unpacked path, ZIP path, and SHA-256.

- [ ] **Step 3: Run cross-project verification**

LinkMaster:

```bash
pnpm test
pnpm build
git diff --check
```

Link Booster:

```bash
pnpm test
pnpm build
pnpm package
unzip -t build/chrome-mv3-prod.zip
git diff --check
```

Docs:

```bash
git diff --check
```

- [ ] **Step 4: Confirm runtime JSON isolation**

Do not stage or commit:

```text
data/json/backlinks.json
data/json/campaigns.json
data/json/records.json
data/json/sites.json
```

- [ ] **Step 5: Commit and push documentation**

```bash
git add contracts/automation-api-v1.md docs/superpowers/poc
git commit -m "docs: switch poc to direct processing"
git push
```
