# Topic Category Confirmed Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist **分类已确认** (`topic_category_confirmed` / `topicCategoryConfirmed`) on LinkMaster backlinks so Automatic skips LLM topic classification when already confirmed.

**Architecture:** LinkMaster resolves the flag on `getNextDirectItem` (including legacy soft-default from non-Unknown `link_category`), sets it `true` in `applyDirectMetadata` when syncing a valid non-Unknown category, and defaults new imports to `false`. Extension reads `originalMetadata.topicCategoryConfirmed` and skips `classify-topic-category` when true.

**Tech Stack:** LinkMaster (Vitest, JSON backlinks store), Plasmo extension (Node unit tests), automation API contract markdown

**Spec:** `docs/superpowers/specs/2026-07-26-topic-category-confirmed-design.md`

---

## File Map

LinkMaster (`/Users/coderlim/Projects/link-master`):

- Modify: `src/lib/automation/direct-processing.js` — `resolveTopicCategoryConfirmed`, update `applyDirectMetadata`, export helper
- Modify: `src/lib/automation/direct-processing.test.js` — unit tests for resolve + apply
- Modify: `src/lib/automation/direct-processing-store.js` — include flag on next-item
- Modify: `src/lib/automation/direct-processing-store.test.js` — next-item + save sets flag
- Modify: `scripts/import-backlinks.js` — default `topic_category_confirmed: false`

Link Booster (`/Users/coderlim/Projects/link-booster-extension`):

- Modify: `src/automation/types.ts` — `topicCategoryConfirmed?: boolean` on `originalMetadata`
- Create or modify: small helper (prefer `src/automation/topic-category-confirmed.ts`) + test — `shouldDetectTopicCategory`
- Modify: `src/sidepanel/AutomaticRunner.tsx` — gate `detectTopicCategory`
- Modify: `scripts/run-unit-tests.cjs` — register new test if added
- Modify: `src/__tests__/automation-api.test.ts` only if fixtures assert exact metadata shape

Contracts / docs (`/Users/coderlim/Projects/auto-backlink`):

- Modify: `contracts/automation-api-v1.md` — document `topicCategoryConfirmed`
- Already written: `docs/superpowers/specs/2026-07-26-topic-category-confirmed-design.md`
- This plan: `docs/superpowers/plans/2026-07-26-topic-category-confirmed.md`

---

### Task 1: LinkMaster resolve + applyDirectMetadata

**Files:**
- Modify: `/Users/coderlim/Projects/link-master/src/lib/automation/direct-processing.js`
- Modify: `/Users/coderlim/Projects/link-master/src/lib/automation/direct-processing.test.js`

- [ ] **Step 1: Write failing tests**

Add to `direct-processing.test.js` (import `resolveTopicCategoryConfirmed` and existing `applyDirectMetadata`):

```js
describe('resolveTopicCategoryConfirmed', () => {
  it('returns true when flag is true', () => {
    expect(
      resolveTopicCategoryConfirmed({
        link_category: 'Unknown',
        topic_category_confirmed: true
      })
    ).toBe(true);
  });

  it('returns true for legacy rows with approved non-Unknown category and missing flag', () => {
    expect(
      resolveTopicCategoryConfirmed({
        link_category: 'Technology'
      })
    ).toBe(true);
  });

  it('returns false for Unknown category without flag', () => {
    expect(
      resolveTopicCategoryConfirmed({
        link_category: 'Unknown'
      })
    ).toBe(false);
  });

  it('returns false when flag is explicitly false even if category looks set', () => {
    expect(
      resolveTopicCategoryConfirmed({
        link_category: 'Technology',
        topic_category_confirmed: false
      })
    ).toBe(false);
  });
});

describe('applyDirectMetadata topic_category_confirmed', () => {
  it('sets confirmed true when topicCategory is approved non-Unknown', () => {
    expect(
      applyDirectMetadata(
        { id: '1', link_category: 'Unknown', topic_category_confirmed: false },
        { topicCategory: 'Technology' }
      )
    ).toMatchObject({
      link_category: 'Technology',
      topic_category_confirmed: true
    });
  });

  it('does not set confirmed true when topicCategory is Unknown', () => {
    expect(
      applyDirectMetadata(
        { id: '1', link_category: 'Technology', topic_category_confirmed: true },
        { topicCategory: 'Unknown' }
      )
    ).toMatchObject({
      link_category: 'Unknown',
      topic_category_confirmed: true
    });
  });
});
```

Note on the last case: spec says leave prior confirmed unchanged when writing Unknown — so prior `true` stays `true`. If `applyDirectMetadata` today always overwrites `link_category` when observed has Unknown, keep that behavior; only avoid flipping confirmed to true (and avoid forcing it false).

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/coderlim/Projects/link-master && pnpm exec vitest run src/lib/automation/direct-processing.test.js
```

Expected: FAIL — `resolveTopicCategoryConfirmed` not exported / confirmed not set.

- [ ] **Step 3: Implement**

In `direct-processing.js`:

```js
const resolveTopicCategoryConfirmed = (backlink = {}) => {
  if (backlink.topic_category_confirmed === true) return true;
  if (backlink.topic_category_confirmed === false) return false;
  const category = backlink.link_category ?? 'Unknown';
  return TOPIC_CATEGORIES.has(category) && category !== 'Unknown';
};

const applyDirectMetadata = (backlink, observedMetadata = {}) => {
  const updated = { ...backlink };

  if (hasObservedValue(observedMetadata.topicCategory)) {
    updated.link_category = observedMetadata.topicCategory;
    if (
      TOPIC_CATEGORIES.has(observedMetadata.topicCategory) &&
      observedMetadata.topicCategory !== 'Unknown'
    ) {
      updated.topic_category_confirmed = true;
    }
  }
  // ... existing linkType / linkRel / autoComment unchanged ...

  return updated;
};
```

Export `resolveTopicCategoryConfirmed` from `module.exports`.

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /Users/coderlim/Projects/link-master && pnpm exec vitest run src/lib/automation/direct-processing.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/coderlim/Projects/link-master
git add src/lib/automation/direct-processing.js src/lib/automation/direct-processing.test.js
git commit -m "$(cat <<'EOF'
feat: persist topic_category_confirmed on metadata apply

Resolve 分类已确认 for claim payloads and set the flag when syncing
a valid non-Unknown topic category.
EOF
)"
```

Work on branch `feature/unified-comment-fill-targets-email` (or a dedicated branch if preferred; stay on current feature branch unless told otherwise). Do not use worktrees unless asked.

---

### Task 2: LinkMaster next-item + save + import default

**Files:**
- Modify: `/Users/coderlim/Projects/link-master/src/lib/automation/direct-processing-store.js`
- Modify: `/Users/coderlim/Projects/link-master/src/lib/automation/direct-processing-store.test.js`
- Modify: `/Users/coderlim/Projects/link-master/scripts/import-backlinks.js`

- [ ] **Step 1: Update failing expectations for getNextDirectItem**

In `direct-processing-store.test.js`, extend every `originalMetadata` expectation to include `topicCategoryConfirmed` where assertions use `toEqual` on the full item. Minimal new cases:

```js
it('marks topicCategoryConfirmed from stored flag and legacy category', async () => {
  const { store } = makeMemoryStore({
    'data/json/sites.json': [validSite],
    'data/json/backlinks.json': [
      {
        id: 'legacy',
        link: SOURCE_URL,
        status: 'normal',
        link_category: 'Technology'
      }
    ]
  });

  await expect(store.getNextDirectItem(TARGET_SITE)).resolves.toMatchObject({
    item: {
      originalMetadata: {
        topicCategory: 'Technology',
        topicCategoryConfirmed: true
      }
    }
  });
});

it('sets topic_category_confirmed when saving non-Unknown category', async () => {
  // reuse existing saveDirectResults fixture pattern; assert files.get backlinks
  // include topic_category_confirmed: true after Technology sync
});
```

Also update the default Unknown next-item fixture to expect `topicCategoryConfirmed: false`.

- [ ] **Step 2: Run store tests — expect fail**

```bash
cd /Users/coderlim/Projects/link-master && pnpm exec vitest run src/lib/automation/direct-processing-store.test.js
```

- [ ] **Step 3: Wire store + import**

In `direct-processing-store.js` import `resolveTopicCategoryConfirmed` from `./direct-processing` (or require the named export already used by the store).

```js
originalMetadata: {
  topicCategory: backlink.link_category ?? 'Unknown',
  topicCategoryConfirmed: resolveTopicCategoryConfirmed(backlink),
  linkType: backlink.link_type ?? 'Unknown',
  linkRel: backlink.link_rel ?? 'Unknown',
  autoComment: backlink.autoComment ?? 'Unknown'
}
```

In `scripts/import-backlinks.js` where objects are built with `link_category: 'Unknown'`, add:

```js
topic_category_confirmed: false,
```

- [ ] **Step 4: Run store tests — expect pass**

```bash
cd /Users/coderlim/Projects/link-master && pnpm exec vitest run src/lib/automation/direct-processing-store.test.js src/lib/automation/direct-processing.test.js
```

- [ ] **Step 5: Commit**

```bash
cd /Users/coderlim/Projects/link-master
git add src/lib/automation/direct-processing-store.js src/lib/automation/direct-processing-store.test.js scripts/import-backlinks.js
git commit -m "$(cat <<'EOF'
feat: expose topicCategoryConfirmed on next-item

Claim payloads include 分类已确认; new imports default the flag to false.
EOF
)"
```

---

### Task 3: Extension skip classify when confirmed

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/automation/types.ts`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/automation/topic-category-confirmed.ts`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/topic-category-confirmed.test.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/sidepanel/AutomaticRunner.tsx`
- Modify: `/Users/coderlim/Projects/link-booster-extension/scripts/run-unit-tests.cjs`

- [ ] **Step 1: Failing unit tests for skip helper**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { shouldDetectTopicCategory } from "../automation/topic-category-confirmed"

test("skips detection when topicCategoryConfirmed is true", () => {
  assert.equal(
    shouldDetectTopicCategory({
      topicCategory: "Technology",
      topicCategoryConfirmed: true
    }),
    false
  )
})

test("detects when topicCategoryConfirmed is false or missing", () => {
  assert.equal(
    shouldDetectTopicCategory({
      topicCategory: "Unknown",
      topicCategoryConfirmed: false
    }),
    true
  )
  assert.equal(
    shouldDetectTopicCategory({ topicCategory: "Unknown" }),
    true
  )
})
```

- [ ] **Step 2: Run test — expect fail**

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec node --test src/__tests__/topic-category-confirmed.test.ts
```

(Or after registering in `run-unit-tests.cjs`, use that runner.)

- [ ] **Step 3: Implement helper + types + gate**

`types.ts`:

```ts
originalMetadata: {
  topicCategory: string
  topicCategoryConfirmed?: boolean
  linkType: LinkType
  linkRel: LinkRel
  autoComment?: AutoComment
}
```

`topic-category-confirmed.ts`:

```ts
export function shouldDetectTopicCategory(metadata: {
  topicCategoryConfirmed?: boolean
}): boolean {
  return metadata.topicCategoryConfirmed !== true
}
```

In `AutomaticRunner.tsx` where `detectTopicCategory(tabId, current, apiConnectionKey)` is called:

```ts
if (shouldDetectTopicCategory(current.item.originalMetadata)) {
  detectTopicCategory(tabId, current, apiConnectionKey)
}
```

Register the new test + source file in `scripts/run-unit-tests.cjs` (same pattern as `comment-controls`).

- [ ] **Step 4: Full unit suite**

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec node scripts/run-unit-tests.cjs
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/coderlim/Projects/link-booster-extension
git add src/automation/types.ts src/automation/topic-category-confirmed.ts \
  src/__tests__/topic-category-confirmed.test.ts src/sidepanel/AutomaticRunner.tsx \
  scripts/run-unit-tests.cjs
git commit -m "$(cat <<'EOF'
feat: skip topic classify when category already confirmed

Honor topicCategoryConfirmed from LinkMaster so Automatic does not
re-run page-load classification.
EOF
)"
```

---

### Task 4: Contracts + docs commit

**Files:**
- Modify: `/Users/coderlim/Projects/auto-backlink/contracts/automation-api-v1.md`
- Add (if not committed): `docs/superpowers/specs/2026-07-26-topic-category-confirmed-design.md`
- Add: `docs/superpowers/plans/2026-07-26-topic-category-confirmed.md`

- [ ] **Step 1: Update contract example**

In the next-item response example `originalMetadata`, add:

```json
"topicCategoryConfirmed": true
```

Add a short prose note: `topicCategoryConfirmed` maps to backlink `topic_category_confirmed`（分类已确认）. When `true`, clients must not re-run topic classification for that backlink. Legacy servers may omit the field; clients treat missing as unconfirmed unless they implement the same legacy soft-default (extension relies on server resolution).

- [ ] **Step 2: Commit**

```bash
cd /Users/coderlim/Projects/auto-backlink
git add contracts/automation-api-v1.md \
  docs/superpowers/specs/2026-07-26-topic-category-confirmed-design.md \
  docs/superpowers/plans/2026-07-26-topic-category-confirmed.md
git commit -m "$(cat <<'EOF'
docs: topic category confirmed flag contract and plan

Document 分类已确认 on next-item metadata and skip-classify behavior.
EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Storage `topic_category_confirmed` | Task 1–2 |
| API `topicCategoryConfirmed` | Task 2 + 4 |
| Set true on valid non-Unknown sync | Task 1 |
| Leave confirmed unchanged when Unknown synced | Task 1 |
| Legacy soft-default | Task 1–2 |
| Import default false | Task 2 |
| Extension skip classify | Task 3 |
| Contracts | Task 4 |

## Self-review notes

- Field names consistent: `topic_category_confirmed` / `topicCategoryConfirmed` / 分类已确认.
- Explicit `topic_category_confirmed: false` wins over legacy category soft-default (Task 1 test).
- No UI badge (out of scope).
