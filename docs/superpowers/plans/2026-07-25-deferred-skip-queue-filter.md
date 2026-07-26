# Deferred Skip And Queue Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a recoverable soft-skip (`deferred`) with an Automatic-panel “跳过” action and a “包含已跳过” `/next` inclusion filter.

**Architecture:** LinkMaster stores soft skips as replaceable `deferred` records. `/next` excludes them by default and includes them when `includeDeferred` is true. The extension maps review status `deferred` through the existing Sync batch, passes the checkbox into `getNextDirectItem`, and adjusts Automatic UI (drop phase title, add checkbox + wrapable fourth button).

**Tech Stack:** LinkMaster Next.js route + Vitest domain/store tests; Link Booster Plasmo/React side panel + Node test runner; shared Automation API JSON shapes.

**Worktrees:**

- LinkMaster: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane`
- Extension: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor`
- Spec/docs: `/Users/coderlim/Projects/auto-backlink`

**Spec:** `docs/superpowers/specs/2026-07-25-deferred-skip-queue-filter-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `link-master/.../direct-processing.js` | `deferred` terminal status; `/next` inclusion; replaceable upsert |
| `link-master/.../direct-processing-store.js` | Pass `includeDeferred` into selection |
| `link-master/.../app/api/automation/next/route.js` | Accept `includeDeferred` on POST |
| `link-master/.../direct-processing*.test.js` | Domain + store coverage |
| `extension/.../automation/types.ts` | `deferred` on result + review unions |
| `extension/.../automation/execution-checklist.ts` | Map `deferred` ↔ sync status / labels path |
| `extension/.../automation/api-client.ts` | Send `includeDeferred` |
| `extension/.../sidepanel/AutomaticRunner.tsx` | UI + wire checkbox into `loadNext` |
| `extension/.../__tests__/*.ts` | Checklist + API client tests |
| `auto-backlink/contracts/automation-api-v1.md` | Document `deferred` + `includeDeferred` |

---

### Task 1: LinkMaster — accept `deferred` and replaceable upsert

**Files:**
- Modify: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/lib/automation/direct-processing.js`
- Modify: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/lib/automation/direct-processing.test.js`

- [ ] **Step 1: Write failing tests for status list + upsert replace**

In `direct-processing.test.js`, update the statuses expectation and add upsert cases (import `upsertDirectRecord` if not already):

```js
it('defines the supported terminal statuses including deferred', () => {
  expect(DIRECT_TERMINAL_STATUSES).toEqual([
    'published',
    'pending_moderation',
    'not_visible_after_submit',
    'explicit_reject',
    'skipped',
    'cannot_submit',
    'failed',
    'metadata_update',
    'deferred'
  ]);
});

it('replaces a deferred record with a later terminal status', () => {
  const deferred = {
    id: 'rec-1',
    targetSite: TARGET_SITE,
    backlinkId: 'backlink-1',
    url: 'https://source.example/posts/one',
    status: 'deferred',
    createdAt: '2026-07-25T08:00:00.000Z',
    updatedAt: '2026-07-25T08:00:00.000Z'
  };
  const published = {
    ...deferred,
    id: 'rec-new',
    status: 'published',
    createdAt: '2026-07-25T09:00:00.000Z',
    updatedAt: '2026-07-25T09:00:00.000Z'
  };

  expect(upsertDirectRecord([deferred], published)).toEqual([
    {
      ...published,
      id: 'rec-1',
      createdAt: '2026-07-25T08:00:00.000Z',
      updatedAt: '2026-07-25T09:00:00.000Z'
    }
  ]);
});

it('still rejects replacing a non-deferred record with a different payload', () => {
  const skipped = {
    id: 'rec-1',
    targetSite: TARGET_SITE,
    backlinkId: 'backlink-1',
    url: 'https://source.example/posts/one',
    status: 'skipped',
    createdAt: '2026-07-25T08:00:00.000Z',
    updatedAt: '2026-07-25T08:00:00.000Z'
  };

  expect(() =>
    upsertDirectRecord([skipped], { ...skipped, status: 'published' })
  ).toThrow('result_already_recorded');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd /Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane
npx vitest run src/lib/automation/direct-processing.test.js
```

Expected: FAIL — `deferred` missing from statuses and/or upsert still throws.

- [ ] **Step 3: Implement status + upsert**

In `direct-processing.js`:

1. Append `'deferred'` to `DIRECT_TERMINAL_STATUSES`.
2. Replace `upsertDirectRecord` with:

```js
const upsertDirectRecord = (records, directRecord) => {
  const targetSite = normalizeTargetSite(directRecord.targetSite);
  const existing = findMatchingDirectRecord(
    records,
    targetSite,
    directRecord.backlinkId
  );

  if (!existing) {
    return [...records, directRecord];
  }

  if (existing.status === 'deferred') {
    return records.map((record) =>
      record === existing
        ? {
            ...directRecord,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: directRecord.updatedAt ?? directRecord.createdAt
          }
        : record
    );
  }

  if (!hasSameDirectBusinessPayload(existing, directRecord)) {
    throw new Error('result_already_recorded');
  }

  return records;
};
```

Do **not** change `applyDirectResultToBacklink` for `deferred` (backlink status stays unchanged).

- [ ] **Step 4: Re-run tests**

```bash
npx vitest run src/lib/automation/direct-processing.test.js
```

Expected: PASS for the new/updated cases.

- [ ] **Step 5: Commit (LinkMaster worktree)**

```bash
cd /Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane
git add src/lib/automation/direct-processing.js src/lib/automation/direct-processing.test.js
git commit -m "$(cat <<'EOF'
feat: accept deferred results and allow replacing deferred records

EOF
)"
```

---

### Task 2: LinkMaster — `/next` includeDeferred selection

**Files:**
- Modify: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/lib/automation/direct-processing.js`
- Modify: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/lib/automation/direct-processing.test.js`

- [ ] **Step 1: Write failing selection + request validation tests**

```js
it('excludes deferred records by default and includes them when asked', () => {
  const parked = backlink('parked');
  const fresh = backlink('fresh');
  const deferredRecord = {
    id: 'rec-deferred',
    targetSite: TARGET_SITE,
    backlinkId: 'parked',
    url: parked.link,
    status: 'deferred'
  };

  expect(
    selectNextDirectBacklink({
      targetSite: TARGET_SITE,
      backlinks: [parked, fresh],
      records: [deferredRecord]
    })
  ).toEqual(fresh);

  expect(
    selectNextDirectBacklink({
      targetSite: TARGET_SITE,
      backlinks: [parked, fresh],
      records: [deferredRecord],
      includeDeferred: true
    })
  ).toEqual(fresh);

  expect(
    selectNextDirectBacklink({
      targetSite: TARGET_SITE,
      backlinks: [parked],
      records: [deferredRecord],
      includeDeferred: true
    })
  ).toEqual(parked);
});

it('never resurfaces skipped records via includeDeferred', () => {
  const parked = backlink('parked');
  expect(
    selectNextDirectBacklink({
      targetSite: TARGET_SITE,
      backlinks: [parked],
      records: [
        {
          id: 'rec-skipped',
          targetSite: TARGET_SITE,
          backlinkId: 'parked',
          url: parked.link,
          status: 'skipped'
        }
      ],
      includeDeferred: true
    })
  ).toBeNull();
});

it('accepts optional includeDeferred on next requests', () => {
  expect(
    validateDirectNextRequest({
      targetSite: TARGET_SITE,
      excludeBacklinkIds: [],
      includeDeferred: true
    })
  ).toEqual({
    targetSite: TARGET_SITE,
    excludeBacklinkIds: [],
    includeDeferred: true
  });
  expect(
    validateDirectNextRequest({
      targetSite: TARGET_SITE,
      excludeBacklinkIds: []
    })
  ).toEqual({
    targetSite: TARGET_SITE,
    excludeBacklinkIds: [],
    includeDeferred: false
  });
  expect(() =>
    validateDirectNextRequest({
      targetSite: TARGET_SITE,
      excludeBacklinkIds: [],
      includeDeferred: 'yes'
    })
  ).toThrow('invalid_include_deferred');
});
```

Also update the existing validate success expectation that returns only `{ targetSite, excludeBacklinkIds }` to include `includeDeferred: false`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/automation/direct-processing.test.js
```

Expected: FAIL on includeDeferred behavior / missing field.

- [ ] **Step 3: Implement selection + validation**

Update `validateDirectNextRequest` to return `includeDeferred`:

```js
  let includeDeferred = false;
  if (body.includeDeferred !== undefined) {
    if (typeof body.includeDeferred !== 'boolean') {
      throw new Error('invalid_include_deferred');
    }
    includeDeferred = body.includeDeferred;
  }

  return { targetSite, excludeBacklinkIds, includeDeferred };
```

Update `selectNextDirectBacklink`:

```js
const selectNextDirectBacklink = ({
  targetSite,
  backlinks,
  records,
  excludeBacklinkIds = [],
  includeDeferred = false
}) => {
  const canonicalTargetSite = normalizeTargetSite(targetSite);
  const excluded = new Set(excludeBacklinkIds);

  for (let index = backlinks.length - 1; index >= 0; index -= 1) {
    const candidate = backlinks[index];
    if (
      excluded.has(candidate.id) ||
      candidate.status === 'inaccessible' ||
      candidate.status === 'unsubmittable' ||
      !isEligibleDirectUrl(candidate.link)
    ) {
      continue;
    }

    const matching = records.find((record) =>
      isMatchingRecord(record, canonicalTargetSite, candidate.id)
    );

    if (
      !matching ||
      (includeDeferred && matching.status === 'deferred')
    ) {
      return candidate;
    }
  }

  return null;
};
```

- [ ] **Step 4: Re-run tests**

```bash
npx vitest run src/lib/automation/direct-processing.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automation/direct-processing.js src/lib/automation/direct-processing.test.js
git commit -m "$(cat <<'EOF'
feat: optionally include deferred backlinks in direct /next

EOF
)"
```

---

### Task 3: LinkMaster — wire store + POST `/next` route

**Files:**
- Modify: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/lib/automation/direct-processing-store.js`
- Modify: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/app/api/automation/next/route.js`
- Modify: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/lib/automation/direct-processing-store.test.js`
- Modify: `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane/src/lib/automation/direct-processing-routes.test.js`

- [ ] **Step 1: Write failing store + route tests**

Store test (memory store already used in file): assert `getNextDirectItem(target, [], true)` returns a deferred backlink when only deferred remains; default call returns null.

Route test: POST body `{ targetSite, excludeBacklinkIds: [], includeDeferred: true }` reaches store with that flag (mock or integration pattern already used in `direct-processing-routes.test.js`). Also assert `invalid_include_deferred` → 422.

Add store sync test: saving `deferred` then later `published` for the same pair succeeds and leaves one record with `status: 'published'` and original `id`/`createdAt`.

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run src/lib/automation/direct-processing-store.test.js src/lib/automation/direct-processing-routes.test.js
```

Expected: FAIL until wiring lands.

- [ ] **Step 3: Wire store + route**

`direct-processing-store.js`:

```js
  const getNextDirectItem = async (
    targetSite,
    excludeBacklinkIds = [],
    includeDeferred = false
  ) => {
    // ... existing reads ...
    const backlink = selectNextDirectBacklink({
      targetSite: site.domain,
      backlinks,
      records,
      excludeBacklinkIds,
      includeDeferred
    });
    // ... unchanged return ...
  };
```

`next/route.js` POST:

```js
    const { targetSite, excludeBacklinkIds, includeDeferred } =
      validateDirectNextRequest(body);
    const context = await getNextDirectItem(
      targetSite,
      excludeBacklinkIds,
      includeDeferred
    );
```

Add `invalid_include_deferred` to the 422 branch.

- [ ] **Step 4: Run LinkMaster automation tests**

```bash
npx vitest run src/lib/automation/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  src/lib/automation/direct-processing-store.js \
  src/lib/automation/direct-processing-store.test.js \
  src/app/api/automation/next/route.js \
  src/lib/automation/direct-processing-routes.test.js
git commit -m "$(cat <<'EOF'
feat: wire includeDeferred through store and /next route

EOF
)"
```

---

### Task 4: Extension — types + checklist mapping for deferred

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/src/automation/types.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/src/automation/execution-checklist.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/src/__tests__/execution-checklist.test.ts`

- [ ] **Step 1: Write failing checklist tests**

```ts
test("finalizeReviewStatus maps deferred soft-skip for sync", () => {
  const opened = addExecutionRow([], context, connectionKey)
  const deferred = finalizeReviewStatus(opened, identity, "deferred")

  assert.equal(deferred[0].reviewStatus, "deferred")
  assert.equal(deferred[0].result?.status, "deferred")
  assert.equal(buildSyncBatch(deferred, connectionKey)[0].status, "deferred")
})
```

Use the same fixtures/helpers already in the file (`context`, `identity`, `connectionKey`).

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor
npm test -- src/__tests__/execution-checklist.test.ts
```

Expected: FAIL — `deferred` not in review/status unions or mapped to `skipped`.

- [ ] **Step 3: Implement types + mapping**

`types.ts`:

```ts
export type DirectResultStatus =
  | "published"
  | "pending_moderation"
  | "not_visible_after_submit"
  | "explicit_reject"
  | "skipped"
  | "cannot_submit"
  | "failed"
  | "metadata_update"
  | "deferred"

export type ReviewPublishStatus =
  | "published"
  | "cannot_publish"
  | "unsuitable_for_target"
  | "deferred"
  | "unknown"
```

`execution-checklist.ts` — `syncStatusFor`:

```ts
  if (row.reviewStatus === "deferred") return "deferred"
```

`finalizeReviewStatus` status mapping:

```ts
  const status: DirectResultStatus =
    reviewStatus === "published"
      ? "published"
      : reviewStatus === "cannot_publish"
        ? "cannot_submit"
        : reviewStatus === "deferred"
          ? "deferred"
          : "skipped"
```

- [ ] **Step 4: Re-run checklist tests**

```bash
npm test -- src/__tests__/execution-checklist.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit (extension worktree)**

```bash
cd /Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor
git add src/automation/types.ts src/automation/execution-checklist.ts src/__tests__/execution-checklist.test.ts
git commit -m "$(cat <<'EOF'
feat: map deferred review status into sync payloads

EOF
)"
```

---

### Task 5: Extension — API client `includeDeferred`

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/src/automation/api-client.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/src/__tests__/automation-api.test.ts`

- [ ] **Step 1: Write failing client test**

Update the existing next-item POST test (or add a sibling) so the body includes `includeDeferred` when requested:

```ts
assert.equal(
  captured?.init?.body,
  JSON.stringify({
    targetSite,
    excludeBacklinkIds,
    includeDeferred: true
  })
)
```

Call site:

```ts
await client.getNextDirectItem(targetSite, excludeBacklinkIds, {
  includeDeferred: true
})
```

Also assert default call still sends `includeDeferred: false` (explicit boolean keeps server validation simple).

- [ ] **Step 2: Run test — expect fail**

```bash
npm test -- src/__tests__/automation-api.test.ts
```

- [ ] **Step 3: Implement client signature**

```ts
  async getNextDirectItem(
    targetSite: string,
    excludeBacklinkIds: string[],
    options: { includeDeferred?: boolean } = {}
  ): Promise<DirectItemContext | null> {
    return this.request<DirectItemContext>("/api/automation/next", {
      method: "POST",
      body: JSON.stringify({
        targetSite,
        excludeBacklinkIds,
        includeDeferred: options.includeDeferred === true
      })
    })
  }
```

- [ ] **Step 4: Re-run API tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/automation/api-client.ts src/__tests__/automation-api.test.ts
git commit -m "$(cat <<'EOF'
feat: send includeDeferred on direct next requests

EOF
)"
```

---

### Task 6: Extension — AutomaticRunner UI + wiring

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/src/sidepanel/AutomaticRunner.tsx`

- [ ] **Step 1: Extend labels and actions**

```ts
const actionStatuses: ReviewPublishStatus[] = [
  "published",
  "cannot_publish",
  "unsuitable_for_target",
  "deferred"
]
const reviewStatusLabels: Record<ReviewPublishStatus, string> = {
  published: "已发布",
  cannot_publish: "不能发布",
  unsuitable_for_target: "不适合当前站",
  deferred: "跳过",
  unknown: "Unknown"
}
```

Checklist display: when `row.reviewStatus === "deferred"`, show **已跳过** (use a display map if button label “跳过” must differ from checklist text):

```ts
const checklistReviewLabels: Record<ReviewPublishStatus, string> = {
  ...reviewStatusLabels,
  deferred: "已跳过"
}
```

Add to `resultLabels`:

```ts
  deferred: "已跳过",
```

- [ ] **Step 2: Add `includeDeferred` state and pass it into `loadNext`**

```ts
const [includeDeferred, setIncludeDeferred] = useState(false)
```

In `getNextDirectItem` call:

```ts
      const next = await api.getNextDirectItem(
        targetSite,
        getExcludedBacklinkIds(rowsRef.current, targetSite, apiConnectionKey),
        { includeDeferred }
      )
```

Read `includeDeferred` from a ref updated in the same render/`useEffect` if `loadNext` closes over a stale value, or pass the boolean into `loadNext(includeDeferredFlag)` from the checkbox/`applyStatusAndAdvance` callers. Prefer:

```ts
const includeDeferredRef = useRef(false)
// keep ref synced
includeDeferredRef.current = includeDeferred
// inside loadNext:
{ includeDeferred: includeDeferredRef.current }
```

- [ ] **Step 3: Remove phase title + site subtitle; keep settings + target select**

Replace the header block so the section starts with a settings-only top row (or settings aligned with the target label), **without** `phaseTitle` / `selectedTargetName` text. Keep `phase` logic for buttons/busy.

- [ ] **Step 4: Checkbox under target select**

Immediately under the `<select id="automatic-target">`:

```tsx
<label className="mt-3 flex items-center gap-2 text-xs text-zinc-600">
  <input
    type="checkbox"
    checked={includeDeferred}
    onChange={(event) => setIncludeDeferred(event.target.checked)}
    className="h-3.5 w-3.5 border-zinc-300"
  />
  包含已跳过
</label>
```

- [ ] **Step 5: Status buttons — flex wrap**

Replace the `grid grid-cols-3` action row with:

```tsx
          <div className="flex flex-wrap gap-2">
            {actionStatuses.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => void applyStatusAndAdvance(currentRow, value)}
                disabled={!canMarkCurrent}
                className="flex h-9 min-w-[5.5rem] flex-1 items-center justify-center border border-zinc-300 bg-white px-2 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40">
                {reviewStatusLabels[value]}
              </button>
            ))}
          </div>
```

Button label for deferred is **跳过**; checklist uses **已跳过**.

- [ ] **Step 6: Typecheck / unit tests**

```bash
npm test
npx tsc --noEmit
```

Expected: PASS (fix any `ReviewPublishStatus` / `DirectResultStatus` exhaustiveness breaks).

- [ ] **Step 7: Commit**

```bash
git add src/sidepanel/AutomaticRunner.tsx
git commit -m "$(cat <<'EOF'
feat: add skip action, deferred filter, and simplify Automatic header

EOF
)"
```

---

### Task 7: Contracts + plan/spec cross-link (docs repo)

**Files:**
- Modify: `/Users/coderlim/Projects/auto-backlink/contracts/automation-api-v1.md`
- Modify: `/Users/coderlim/Projects/auto-backlink/docs/superpowers/plans/2026-07-25-deferred-skip-queue-filter.md` (this file, already created)

- [ ] **Step 1: Document API**

In `automation-api-v1.md` terminal statuses list, add `deferred` with one-line meaning: soft skip; resurfaced only when `includeDeferred` is true.

In the `/api/automation/next` POST body section, document:

```text
includeDeferred?: boolean  // default false; when true, deferred records are eligible again
```

- [ ] **Step 2: Commit docs**

```bash
cd /Users/coderlim/Projects/auto-backlink
git add contracts/automation-api-v1.md docs/superpowers/plans/2026-07-25-deferred-skip-queue-filter.md
git commit -m "$(cat <<'EOF'
docs: plan deferred skip filter and document API fields

EOF
)"
```

---

### Task 8: Manual smoke (operator)

- [ ] Reload unpacked extension from  
  `link-booster-extension/.worktrees/auto-backlink-campaign-executor/build/chrome-mv3-dev` (or prod build).
- [ ] Confirm header no longer shows phase + site subtitle; settings + target remain.
- [ ] Confirm “包含已跳过” under target; unchecked by default.
- [ ] Mark one item 跳过 → sync → same target with filter off does not return it; filter on returns it.
- [ ] After resurfacing, mark 已发布 → sync succeeds; filter on no longer returns it.
- [ ] 不适合当前站 still never returns with filter on.

---

## Spec coverage self-check

| Spec requirement | Task |
| --- | --- |
| Remove phase title + site subtitle | Task 6 |
| “跳过” button, flex wrap | Task 6 |
| `deferred` sync status | Tasks 1, 4 |
| “包含已跳过” checkbox | Task 6 |
| `/next` includeDeferred union | Tasks 2, 3, 5 |
| Replace deferred on later terminal | Tasks 1, 3 |
| `skipped` not included by filter | Task 2 |
| No auto-sync on skip | unchanged Sync flow |
| Contracts note | Task 7 |
