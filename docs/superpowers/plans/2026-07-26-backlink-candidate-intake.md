# Backlink Candidate Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage Ahrefs/Sim imports in `backlink-candidates.json`, add LinkMaster candidate APIs, and add a Link Booster Intake tab that admits only form-detectable, dummy-fillable pages into `backlinks.json`.

**Architecture:** Import writes staging only. Extension Intake opens each candidate, inspects for a fillable comment form (without requiring link-placement evidence), fills fixed dummy data (no submit), classifies metadata, then `admit` or `reject`. Automatic is unchanged and only reads `backlinks.json`.

**Tech Stack:** Next.js route handlers, Vitest, local/GitHub JSON via `data-source`, Plasmo Chrome MV3, React, TypeScript

**Spec:** `docs/superpowers/specs/2026-07-26-backlink-candidate-intake-design.md`

---

## File Map

### auto-backlink

- Modify: `contracts/automation-api-v1.md` — document candidates next/admit/reject

### link-master

- Create: `src/lib/automation/candidate-intake.js` — pure select/admit/reject/validate
- Create: `src/lib/automation/candidate-intake.test.js`
- Create: `src/lib/automation/candidate-intake-store.js` — JSON IO for candidates + backlinks
- Create: `src/lib/automation/candidate-intake-store.test.js`
- Create: `src/app/api/automation/candidates/next/route.js`
- Create: `src/app/api/automation/candidates/admit/route.js`
- Create: `src/app/api/automation/candidates/reject/route.js`
- Create: `data/json/backlink-candidates.json` — empty `[]` committed starter (or ensure runtime creates it)
- Modify: `scripts/import-backlinks.js` — default write path + cross-file dedupe
- Modify: `src/lib/import-backlinks.test.js` — staging path + dual dedupe

### link-booster-extension

- Modify: `src/automation/types.ts` — candidate context / admit / reject types
- Modify: `src/automation/api-client.ts` — three candidate methods
- Modify: `src/__tests__/automation-api.test.ts`
- Create: `src/automation/intake-pass.ts` — pass/fail decision from inspection + fill
- Create: `src/__tests__/intake-pass.test.ts`
- Create: `src/sidepanel/IntakeRunner.tsx`
- Modify: `src/sidepanel/index.tsx` — third tab
- Modify: `scripts/run-unit-tests.cjs` — register new modules

---

### Task 1: Contract — candidate routes

**Files:**
- Modify: `/Users/coderlim/Projects/auto-backlink/contracts/automation-api-v1.md`

- [ ] **Step 1: Add routes to the Primary Routes table**

Add three rows after the existing sync route:

| Method | Path | Access | Success |
| --- | --- | --- | --- |
| `POST` | `/api/automation/candidates/next` | Bearer | `200`, candidate context; or `204` |
| `POST` | `/api/automation/candidates/admit` | Bearer | `200`, admitted backlink |
| `POST` | `/api/automation/candidates/reject` | Bearer | `200`, `{ id }` removed |

- [ ] **Step 2: Document request/response shapes**

Add a section **Candidate Intake** with:

`POST /api/automation/candidates/next` body:

```json
{ "excludeIds": ["optional-already-opened-candidate-id"] }
```

Success:

```json
{
  "apiVersion": 1,
  "data": {
    "item": {
      "id": "candidate-uuid",
      "url": "https://source.example/article",
      "dr": "42",
      "importSource": "ahrefs",
      "importTarget": "example.com"
    }
  }
}
```

Selection: scan `backlink-candidates.json` **end-to-front**; skip ids in `excludeIds`; empty → `204`.

`POST /api/automation/candidates/admit` body:

```json
{
  "id": "candidate-uuid",
  "linkType": "UserName Link",
  "linkRel": "Nofollow",
  "linkCategory": "Technology",
  "autoComment": "ready",
  "topicCategoryConfirmed": true
}
```

Success `200` returns the backlink object written to `backlinks.json`. If the candidate URL already exists in `backlinks.json`, remove staging only and return the existing backlink (idempotent). Does not write `records.json`.

`POST /api/automation/candidates/reject` body:

```json
{ "id": "candidate-uuid" }
```

Success:

```json
{ "apiVersion": 1, "data": { "id": "candidate-uuid" } }
```

Missing id → `404` `candidate_not_found`. Invalid metadata enums → `422`.

- [ ] **Step 3: Commit**

```bash
cd /Users/coderlim/Projects/auto-backlink
git add contracts/automation-api-v1.md
git commit -m "docs: add candidate intake routes to automation API contract"
```

---

### Task 2: LinkMaster — pure candidate domain

**Files:**
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/candidate-intake.js`
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/candidate-intake.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, expect, it } from 'vitest';
import {
  selectNextCandidate,
  buildAdmittedBacklink,
  removeCandidateById,
  validateAdmitRequest,
  validateNextRequest,
  validateRejectRequest
} from './candidate-intake';

const candidate = (id, link) => ({
  id,
  link,
  dr: '40',
  import_source: 'ahrefs',
  import_target: 'example.com',
  link_category: 'Unknown',
  link_type: 'Unknown',
  link_rel: 'Unknown',
  topic_category_confirmed: false
});

describe('candidate intake domain', () => {
  it('selects end-to-front skipping excludes', () => {
    const candidates = [
      candidate('a', 'https://a.example/1'),
      candidate('b', 'https://b.example/1'),
      candidate('c', 'https://c.example/1')
    ];
    expect(selectNextCandidate(candidates, []).id).toBe('c');
    expect(selectNextCandidate(candidates, ['c']).id).toBe('b');
    expect(selectNextCandidate(candidates, ['c', 'b', 'a'])).toBeNull();
  });

  it('builds admitted backlink with classified fields', () => {
    const admitted = buildAdmittedBacklink(candidate('a', 'https://a.example/1'), {
      linkType: 'Text Link',
      linkRel: 'Dofollow',
      linkCategory: 'Technology',
      autoComment: 'ready',
      topicCategoryConfirmed: true,
      now: () => '2026-07-26T00:00:00.000Z'
    });
    expect(admitted.link_type).toBe('Text Link');
    expect(admitted.link_rel).toBe('Dofollow');
    expect(admitted.link_category).toBe('Technology');
    expect(admitted.autoComment).toBe('ready');
    expect(admitted.topic_category_confirmed).toBe(true);
    expect(admitted).not.toHaveProperty('type');
  });

  it('removes by id', () => {
    const list = [candidate('a', 'https://a.example/1'), candidate('b', 'https://b.example/1')];
    expect(removeCandidateById(list, 'a').map((c) => c.id)).toEqual(['b']);
  });

  it('validates admit enums', () => {
    expect(() =>
      validateAdmitRequest({ id: 'a', linkType: 'Nope', linkRel: 'Unknown', linkCategory: 'General' })
    ).toThrow('invalid_link_type');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/coderlim/Projects/link-master
pnpm vitest run src/lib/automation/candidate-intake.test.js
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement `candidate-intake.js`**

Reuse the same enum sets as `direct-processing.js` (`TOPIC_CATEGORIES`, `LINK_TYPES`, `LINK_RELS`, `AUTO_COMMENT_VALUES`). Export:

- `selectNextCandidate(candidates, excludeIds)` — iterate `length-1 … 0`, skip excluded / missing `id`/`link`
- `validateNextRequest(body)` — `{ excludeIds: string[] }` (default `[]`, max 500)
- `validateAdmitRequest(body)` — require `id`; enums for `linkType`/`linkRel`/`linkCategory`; `autoComment` default `ready`; `topicCategoryConfirmed` boolean default `false`
- `validateRejectRequest(body)` — require `id`
- `buildAdmittedBacklink(candidate, meta)` — shallow copy candidate fields that belong on a backlink; overwrite classification; set `updated_at`; drop nothing required by import shape; never set legacy `type`
- `removeCandidateById(candidates, id)`
- `findBacklinkByUrl(backlinks, url)` — normalize by trimming trailing slash optional; exact string match on `link` is enough for v1 if import already normalized

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm vitest run src/lib/automation/candidate-intake.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/automation/candidate-intake.js src/lib/automation/candidate-intake.test.js
git commit -m "feat: add candidate intake domain helpers"
```

---

### Task 3: LinkMaster — candidate store

**Files:**
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/candidate-intake-store.js`
- Create: `/Users/coderlim/Projects/link-master/src/lib/automation/candidate-intake-store.test.js`

- [ ] **Step 1: Write failing store tests** (in-memory IO like `direct-processing-store.test.js`)

Cover:

1. `getNextCandidate` returns newest, respects `excludeIds`, returns `null` when empty
2. `admitCandidate` moves into backlinks with metadata and removes from staging
3. `admitCandidate` when URL already in backlinks → removes staging only, returns existing
4. `rejectCandidate` removes staging only; missing id throws `candidate_not_found`
5. Admit never touches a `records` array in the fake IO

Sketch:

```js
const createMemoryIo = (files) => ({
  readJSONData: async (path) => ({ data: structuredClone(files[path] ?? []) }),
  updateJSONDataWithRetry: async (path, updater) => {
    const next = await updater(files[path] ?? []);
    files[path] = next;
    return { data: next };
  }
});
```

Paths:

- `data/json/backlink-candidates.json`
- `data/json/backlinks.json`

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run src/lib/automation/candidate-intake-store.test.js
```

- [ ] **Step 3: Implement store**

```js
import { readJSONData, updateJSONDataWithRetry } from '../data-source';
import {
  buildAdmittedBacklink,
  findBacklinkByUrl,
  removeCandidateById,
  selectNextCandidate
} from './candidate-intake';

const CANDIDATES_PATH = 'data/json/backlink-candidates.json';
const BACKLINKS_PATH = 'data/json/backlinks.json';

export function createCandidateIntakeStore(io = { readJSONData, updateJSONDataWithRetry }) {
  const getNextCandidate = async (excludeIds = []) => {
    const { data: candidates } = await io.readJSONData(CANDIDATES_PATH);
    const selected = selectNextCandidate(
      Array.isArray(candidates) ? candidates : [],
      excludeIds
    );
    if (!selected) return null;
    return {
      item: {
        id: selected.id,
        url: selected.link,
        dr: selected.dr ?? '',
        importSource: selected.import_source ?? null,
        importTarget: selected.import_target ?? null
      }
    };
  };

  const admitCandidate = async (request) => {
    // 1) load candidates + backlinks
    // 2) find candidate by id or throw candidate_not_found
    // 3) if findBacklinkByUrl(backlinks, candidate.link): update candidates only; return existing
    // 4) else append buildAdmittedBacklink(...); remove from candidates; write both
  };

  const rejectCandidate = async ({ id }) => {
    // remove or throw candidate_not_found; return { id }
  };

  return { getNextCandidate, admitCandidate, rejectCandidate };
}

export const {
  getNextCandidate,
  admitCandidate,
  rejectCandidate
} = createCandidateIntakeStore();
```

Use `updateJSONDataWithRetry` so concurrent writers retry. Prefer one transactional-style sequence: update candidates and backlinks with retry; if the platform only updates one file per call, update backlinks first then candidates (or candidates last so a crash leaves a duplicate that idempotent admit cleans up).

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm vitest run src/lib/automation/candidate-intake-store.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/automation/candidate-intake-store.js src/lib/automation/candidate-intake-store.test.js
git commit -m "feat: add candidate intake JSON store"
```

---

### Task 4: LinkMaster — API routes

**Files:**
- Create: `/Users/coderlim/Projects/link-master/src/app/api/automation/candidates/next/route.js`
- Create: `/Users/coderlim/Projects/link-master/src/app/api/automation/candidates/admit/route.js`
- Create: `/Users/coderlim/Projects/link-master/src/app/api/automation/candidates/reject/route.js`
- Optional test: extend pattern from `direct-processing-routes.test.js` if present; otherwise manual curl smoke in Step 4

- [ ] **Step 1: Implement `next/route.js`** mirroring `src/app/api/automation/next/route.js`

```js
import { getNextCandidate } from '@/lib/automation/candidate-intake-store';
import { validateNextRequest } from '@/lib/automation/candidate-intake';
import {
  automationEmpty,
  automationError,
  automationJson,
  isAutomationRequest,
  optionsResponse,
  readAutomationJson
} from '@/lib/automation/http';

export async function POST(request) {
  if (!isAutomationRequest(request)) {
    return automationError('automation_auth_required', 401);
  }
  try {
    const body = await readAutomationJson(request);
    const { excludeIds } = validateNextRequest(body ?? {});
    const context = await getNextCandidate(excludeIds);
    return context ? automationJson(context) : automationEmpty();
  } catch (error) {
    // map invalid_json 400, payload_too_large 413, invalid_exclude_* 422
    // default candidate_next_failed 500
  }
}

export const OPTIONS = optionsResponse;
```

- [ ] **Step 2: Implement `admit/route.js` and `reject/route.js`** similarly

Map:

- `candidate_not_found` → 404
- `invalid_link_type` / `invalid_link_rel` / `invalid_link_category` / `invalid_auto_comment` / `invalid_admit_request` / `invalid_reject_request` → 422

- [ ] **Step 3: Ensure staging file exists**

Create `/Users/coderlim/Projects/link-master/data/json/backlink-candidates.json` as `[]\n` if the data-source requires the file to exist. Do **not** commit large secrets; empty array only.

- [ ] **Step 4: Smoke (dev server running)**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/automation/candidates/next \
  -H "Authorization: Bearer $AUTOMATION_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `204` or `200`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/automation/candidates data/json/backlink-candidates.json
git commit -m "feat: expose candidate intake automation routes"
```

---

### Task 5: LinkMaster — import writes staging

**Files:**
- Modify: `/Users/coderlim/Projects/link-master/scripts/import-backlinks.js`
- Modify: `/Users/coderlim/Projects/link-master/src/lib/import-backlinks.test.js`

- [ ] **Step 1: Extend failing tests**

In `makeTempImportFiles`, also create `candidatesPath` and empty `backlinksPath` for dedupe:

```js
const makeTempImportFiles = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlink-import-'));
  tempDirs.push(dir);
  const candidatesPath = path.join(dir, 'backlink-candidates.json');
  const backlinksPath = path.join(dir, 'backlinks.json');
  const historyPath = path.join(dir, 'backlink-import-history.json');
  fs.writeFileSync(candidatesPath, '[]\n', 'utf8');
  fs.writeFileSync(backlinksPath, '[]\n', 'utf8');
  return { candidatesPath, backlinksPath, historyPath };
};
```

Update existing `importBacklinks` calls to pass `candidatesPath` as the write target (new default param name: keep internal clarity).

Add tests:

1. Successful import appends to `candidatesPath`, leaves `backlinksPath` unchanged
2. URL already in `backlinks.json` counts as `duplicate` and is not re-added to candidates
3. URL already in candidates counts as `duplicate`

- [ ] **Step 2: Run — expect FAIL** on new assertions

```bash
pnpm vitest run src/lib/import-backlinks.test.js
```

- [ ] **Step 3: Implement script changes**

1. Add `CANDIDATES_PATH` default next to `BACKLINKS_PATH`
2. Change `importBacklinks` signature:

```js
const importBacklinks = ({
  website,
  source: rawSource = 'ahrefs',
  dryRun = false,
  limit = DEFAULT_SIM_LIMIT,
  candidatesPath = CANDIDATES_PATH,
  backlinksPath = BACKLINKS_PATH, // read-only for dedupe
  historyPath = HISTORY_PATH,
  fetch,
  now = () => new Date().toISOString(),
  id = randomUUID
}) => { ... }
```

3. Load both arrays; build `seen` from **union** of candidate + backlink URLs before `buildImportedBacklinks`, OR change `buildImportedBacklinks` to accept `existingUrls: Set` / `existing: [...candidates, ...backlinks]` for dedupe while only appending onto candidates.

Cleanest approach:

```js
const existingCandidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
const existingBacklinks = JSON.parse(fs.readFileSync(backlinksPath, 'utf8'));
const result = buildImportedBacklinks({
  domain,
  existing: existingCandidates,
  dedupeAgainst: [...existingCandidates, ...existingBacklinks],
  fetched,
  importSource: source,
  now,
  id
});
// write result.backlinks → actually the candidates array renamed:
writeJsonAtomically(candidatesPath, result.backlinks);
```

Refactor `buildImportedBacklinks` so `seen` is seeded from `dedupeAgainst` (default `existing`) but the returned array is `[...existing, ...added]` where `existing` is the staging array only.

4. Update CLI help / log lines to say `backlink-candidates.json`.
5. Keep history behavior unchanged.

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm vitest run src/lib/import-backlinks.test.js
```

- [ ] **Step 5: Commit**

```bash
git add scripts/import-backlinks.js src/lib/import-backlinks.test.js
git commit -m "feat: import backlinks into staging candidates file"
```

---

### Task 6: Extension — types + API client

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/automation/types.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/automation/api-client.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/automation-api.test.ts`

- [ ] **Step 1: Add types**

```ts
export interface CandidateItem {
  id: string
  url: string
  dr?: string
  importSource?: string | null
  importTarget?: string | null
}

export interface CandidateContext {
  item: CandidateItem
}

export interface CandidateAdmitInput {
  id: string
  linkType: string
  linkRel: string
  linkCategory: string
  autoComment?: "ready" | "manual" | "blocked" | "Unknown"
  topicCategoryConfirmed?: boolean
}
```

- [ ] **Step 2: Add client methods**

```ts
async getNextCandidate(excludeIds: string[]): Promise<CandidateContext | null> {
  return this.request<CandidateContext>("/api/automation/candidates/next", {
    method: "POST",
    body: JSON.stringify({ excludeIds })
  })
}

async admitCandidate(input: CandidateAdmitInput): Promise<unknown> {
  return this.request("/api/automation/candidates/admit", {
    method: "POST",
    body: JSON.stringify(input)
  })
}

async rejectCandidate(id: string): Promise<{ id: string }> {
  return this.request<{ id: string }>("/api/automation/candidates/reject", {
    method: "POST",
    body: JSON.stringify({ id })
  }) as Promise<{ id: string }>
}
```

- [ ] **Step 3: Extend `automation-api.test.ts`** with fetch-mock assertions for the three paths (mirror existing `getNextDirectItem` tests).

- [ ] **Step 4: Run**

```bash
cd /Users/coderlim/Projects/link-booster-extension
node scripts/run-unit-tests.cjs
```

Expected: PASS for automation-api tests (full suite may still miss new intake-pass until Task 7 registers it).

- [ ] **Step 5: Commit**

```bash
git add src/automation/types.ts src/automation/api-client.ts src/__tests__/automation-api.test.ts
git commit -m "feat: add candidate intake API client methods"
```

---

### Task 7: Extension — intake pass/fail helper

**Files:**
- Create: `/Users/coderlim/Projects/link-booster-extension/src/automation/intake-pass.ts`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/intake-pass.test.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/scripts/run-unit-tests.cjs`

**Important:** Do **not** use `inspection.supported` as the pass gate. Current `supported` requires link-placement evidence (`linkType`). Intake v1 only needs a detectable fillable form.

- [ ] **Step 1: Write failing tests**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { evaluateIntakePass } from "../automation/intake-pass"
import type { FormInspection } from "../automation/types"

const base = (over: Partial<FormInspection> = {}): FormInspection => ({
  supported: false,
  fields: {
    name: true,
    email: true,
    website: true,
    comment: true,
    submit: true
  },
  linkType: null,
  linkRel: "Unknown",
  requiresLogin: false,
  hasCaptcha: false,
  usesModeration: false,
  ...over
})

test("passes when comment+submit exist even without linkType", () => {
  const decision = evaluateIntakePass({
    inspection: base(),
    fillSuccess: true
  })
  assert.equal(decision.outcome, "admit")
})

test("rejects without comment form", () => {
  const decision = evaluateIntakePass({
    inspection: base({
      fields: { name: false, email: false, website: false, comment: false, submit: false },
      reason: "comment_form_not_found"
    }),
    fillSuccess: false
  })
  assert.equal(decision.outcome, "reject")
})

test("rejects login or captcha", () => {
  assert.equal(
    evaluateIntakePass({
      inspection: base({ requiresLogin: true }),
      fillSuccess: true
    }).outcome,
    "reject"
  )
  assert.equal(
    evaluateIntakePass({
      inspection: base({ hasCaptcha: true }),
      fillSuccess: true
    }).outcome,
    "reject"
  )
})

test("rejects fill failure", () => {
  assert.equal(
    evaluateIntakePass({
      inspection: base(),
      fillSuccess: false
    }).outcome,
    "reject"
  )
})
```

- [ ] **Step 2: Run focused test — expect FAIL**

```bash
npx tsc --outDir /tmp/lb-intake -module commonjs -esModuleInterop \
  src/automation/intake-pass.ts src/__tests__/intake-pass.test.ts 2>/dev/null || true
# Prefer project runner after registering files:
# add paths then: node scripts/run-unit-tests.cjs
```

Or add both paths to `scripts/run-unit-tests.cjs` `sources` first, then run and expect FAIL on missing export.

- [ ] **Step 3: Implement**

```ts
import type { FormInspection } from "./types"

export const INTAKE_DUMMY_FILL = {
  name: "Intake Tester",
  email: "intake-test@example.com",
  website: "https://example.com",
  comment: "Intake form fill check — please ignore."
} as const

export type IntakeDecision =
  | { outcome: "admit"; linkType: string; linkRel: string }
  | { outcome: "reject"; reason: string }

export function evaluateIntakePass(input: {
  inspection: FormInspection
  fillSuccess: boolean
}): IntakeDecision {
  const { inspection, fillSuccess } = input
  if (inspection.requiresLogin) {
    return { outcome: "reject", reason: "login_required" }
  }
  if (inspection.hasCaptcha) {
    return { outcome: "reject", reason: "captcha" }
  }
  if (!inspection.fields.comment || !inspection.fields.submit) {
    return {
      outcome: "reject",
      reason: inspection.reason ?? "comment_form_not_found"
    }
  }
  if (!fillSuccess) {
    return { outcome: "reject", reason: "fill_failed" }
  }
  return {
    outcome: "admit",
    linkType: inspection.linkType ?? "Unknown",
    linkRel: inspection.linkRel ?? "Unknown"
  }
}
```

- [ ] **Step 4: Register in `run-unit-tests.cjs`**

Add:

- `src/__tests__/intake-pass.test.ts`
- `src/automation/intake-pass.ts`

- [ ] **Step 5: Run — expect PASS**

```bash
node scripts/run-unit-tests.cjs
```

- [ ] **Step 6: Commit**

```bash
git add src/automation/intake-pass.ts src/__tests__/intake-pass.test.ts scripts/run-unit-tests.cjs
git commit -m "feat: add intake pass/fail evaluation without link placement"
```

---

### Task 8: Extension — IntakeRunner

**Files:**
- Create: `/Users/coderlim/Projects/link-booster-extension/src/sidepanel/IntakeRunner.tsx`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/sidepanel/index.tsx`

Reuse:

- `~/automation/tab-controller` `open` / `close` / `getTabId`
- `sendCampaignTabMessage` for `inspect-comment-page` and `fill-comment-form`
- `sendToBackground({ name: "classify-topic-category", body: { tabId } })`
- `AutomationApiClient` from options storage (same pattern as `AutomaticRunner`)

- [ ] **Step 1: Implement `IntakeRunner.tsx` core loop**

State: `phase` (`idle` | `open` | `inspect` | `fill` | `classify` | `admit` | `reject` | `error` | `done`), `currentUrl`, `lastMeta`, `admittedCount`, `rejectedCount`, `errorMessage`, `excludeIds`, `running`.

Controls: Start / Stop / Retry (only when `phase === "error"`), optional Discard (calls reject for current id).

Loop pseudocode:

```ts
while (running) {
  const context = await client.getNextCandidate(excludeIds)
  if (!context) { setPhase("done"); break }
  excludeIds = [...excludeIds, context.item.id]
  setCurrentUrl(context.item.url)
  try {
    const tabId = await open(context.item.url)
    // wait load similar to AutomaticRunner waitForSubmitPage / tab complete
    const inspection = await sendCampaignTabMessage(tabId, { action: "inspect-comment-page" })
    if (inspection.requiresLogin || inspection.hasCaptcha || !inspection.fields.comment || !inspection.fields.submit) {
      await client.rejectCandidate(context.item.id)
      rejectedCount++
      continue
    }
    const fill = await sendCampaignTabMessage(tabId, {
      action: "fill-comment-form",
      data: { ...INTAKE_DUMMY_FILL }
    })
    const decision = evaluateIntakePass({
      inspection,
      fillSuccess: Boolean(fill?.success)
    })
    if (decision.outcome === "reject") {
      await client.rejectCandidate(context.item.id)
      rejectedCount++
      continue
    }
    let linkCategory = "Unknown"
    let topicCategoryConfirmed = false
    try {
      const topic = await sendToBackground({
        name: "classify-topic-category",
        body: { tabId }
      })
      if (topic && !("error" in topic) && topic.topicCategory) {
        linkCategory = topic.topicCategory
        topicCategoryConfirmed = topic.topicCategory !== "Unknown"
      }
    } catch {
      // admit with Unknown per spec
    }
    await client.admitCandidate({
      id: context.item.id,
      linkType: decision.linkType,
      linkRel: decision.linkRel,
      linkCategory,
      autoComment: "ready",
      topicCategoryConfirmed
    })
    admittedCount++
  } catch (error) {
    // API/network: set error, keep candidate (remove id from excludeIds so retry can reopen)
    excludeIds = excludeIds.filter((id) => id !== context.item.id)
    setPhase("error")
    setErrorMessage(String(error))
    break
  }
}
```

**Hard rules in this file:**

- Never call `submit` / `submit-comment` / `syncDirectResults`
- Never select a target site
- Stop → `close()` tab, set `running=false`, do not reject in-flight unless Discard was clicked

- [ ] **Step 2: Wire tab in `index.tsx`**

Change `PanelTab` to `"automatic" | "manual" | "intake"`. Use a 3-column tablist. Render `<IntakeRunner />` when Intake selected (keep inactive panels `hidden` like today).

Suggested label: **Intake**. Icon: e.g. `Filter` or `Inbox` from `lucide-react`.

- [ ] **Step 3: Typecheck / unit suite**

```bash
cd /Users/coderlim/Projects/link-booster-extension
pnpm exec tsc --noEmit
node scripts/run-unit-tests.cjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/sidepanel/IntakeRunner.tsx src/sidepanel/index.tsx
git commit -m "feat: add Intake sidepanel tab for candidate admission"
```

---

### Task 9: End-to-end smoke checklist

**Files:**
- Create: `/Users/coderlim/Projects/auto-backlink/docs/superpowers/poc/2026-07-26-candidate-intake-checklist.md`

- [ ] **Step 1: Write checklist**

Include:

1. `node scripts/import-backlinks.js <domain> --source sim --limit 5` writes only `backlink-candidates.json`
2. Extension Intake Start opens newest candidate
3. Page with form + successful dummy fill → row appears in `backlinks.json` with classifications; removed from candidates
4. Page without form → removed from candidates; not in backlinks
5. Stop LinkMaster mid-admit → Retry does not lose candidate
6. Automatic still only processes `backlinks.json`

- [ ] **Step 2: Commit**

```bash
cd /Users/coderlim/Projects/auto-backlink
git add docs/superpowers/poc/2026-07-26-candidate-intake-checklist.md
git commit -m "docs: add candidate intake smoke checklist"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Import → staging only + dual dedupe | Task 5 |
| candidates next/admit/reject API | Tasks 1–4 |
| End-to-front selection | Task 2 |
| Idempotent admit if URL in backlinks | Task 3 |
| Form + dummy fill pass; no link-placement gate | Task 7–8 |
| Classify link_type/link_rel/link_category | Task 8 |
| Topic fail → admit Unknown | Task 8 |
| Reject deletes staging | Tasks 3–4, 8 |
| API error keeps staging + Retry | Task 8 |
| No records / no real submit | Tasks 3, 8 |
| Automatic unchanged | File map + Task 9 |
| Contract update | Task 1 |
| Intake UI tab | Task 8 |

No TBD placeholders remain. Enum names match `direct-processing.js` / contract camelCase on the wire (`linkType`) mapped to snake_case on disk (`link_type`) inside `buildAdmittedBacklink`.
