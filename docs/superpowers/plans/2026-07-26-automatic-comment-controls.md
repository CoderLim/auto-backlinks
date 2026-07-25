# Automatic Comment Controls & Regenerate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatic mode always shows the generated comment and Manual-style length/embed/link-format controls, seeds controls from inspect when possible, soft-continues on inspect failure, and supports regenerate → auto-fill.

**Architecture:** Dual-track generation in `AutomaticRunner`: first pass uses `get-comment` automatic+inspection when supported, otherwise manual with `embedLink: false`. Controls are always visible and regenerated via `mode: "manual"` using current control values, then `fill-comment-form`. Extend `ManualLinkType` with `"text"` shared by Automatic + Manual UIs.

**Tech Stack:** Plasmo Chrome MV3, React, TypeScript, Node test runner (`pnpm exec node scripts/run-unit-tests.cjs`)

**Spec:** `docs/superpowers/specs/2026-07-26-automatic-comment-controls-design.md` (in `auto-backlink`)

---

## File Map

Link Booster (`/Users/coderlim/Projects/link-booster-extension`):

- Modify: `src/automation/comment-generation.ts` — `ManualLinkType` includes `"text"`; `manualBodyLinkType` maps to `Text Link`
- Modify: `src/__tests__/comment-generation.test.ts` — Text Link prompt/validation coverage
- Modify: `src/background/messages/get-comment.ts` — Manual body `linkType` includes `"text"`
- Create: `src/automation/comment-controls.ts` — pure helpers: `controlsFromInspection`, default controls
- Create: `src/__tests__/comment-controls.test.ts` — mapping table tests
- Modify: `src/sidepanel/AutomaticRunner.tsx` — soft inspect path, controls UI, regenerate+fill
- Modify: `src/sidepanel/ManualCommentTool.tsx` — Text Link option; type uses `ManualLinkType`
- Modify: `scripts/run-unit-tests.cjs` — register `comment-controls.test.ts` if not globbed

Contracts / docs (`/Users/coderlim/Projects/auto-backlink`):

- Already written: `docs/superpowers/specs/2026-07-26-automatic-comment-controls-design.md`
- This plan: `docs/superpowers/plans/2026-07-26-automatic-comment-controls.md`

---

### Task 1: ManualLinkType `"text"` in comment generation

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/automation/comment-generation.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/comment-generation.test.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/background/messages/get-comment.ts`

- [ ] **Step 1: Write failing Text Link prompt test**

Add to `comment-generation.test.ts`:

```ts
test("manual embedLink text requires exact plain domain", () => {
  const messages = buildCommentMessages({
    pageText: "The article explains the King combo timing window.",
    pageLanguage: "English",
    targetSite,
    placement: {
      kind: "manual",
      embedLink: true,
      linkType: "text",
      length: 30
    }
  })
  const prompt = messages.map(({ content }) => content).join("\n")
  assert.ok(prompt.includes("https://tekken3.cc"))
  assert.ok(!prompt.includes("<a href="))
  assert.match(prompt, /about 30 words/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec node --test src/__tests__/comment-generation.test.ts
```

Expected: FAIL (type / mapping still treats `"text"` as HTML or TS error).

- [ ] **Step 3: Implement `"text"` mapping**

In `comment-generation.ts`:

```ts
export type ManualLinkType = "text" | "html" | "markdown" | "bbcode"

const manualBodyLinkType = (
  linkType: ManualLinkType | undefined
): BodyLinkType => {
  if (linkType === "text") return "Text Link"
  if (linkType === "markdown") return "Markdown Link"
  if (linkType === "bbcode") return "BBCode Link"
  return "HTML Link"
}
```

In `get-comment.ts` ManualBody:

```ts
linkType?: "text" | "html" | "markdown" | "bbcode"
```

(Prefer importing `ManualLinkType` from `comment-generation` if that avoids drift.)

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec node scripts/run-unit-tests.cjs
```

Expected: all pass, including new Text Link test.

- [ ] **Step 5: Commit**

```bash
cd /Users/coderlim/Projects/link-booster-extension
git add src/automation/comment-generation.ts src/__tests__/comment-generation.test.ts src/background/messages/get-comment.ts
git commit -m "$(cat <<'EOF'
feat: support Text Link in manual comment placement

Allow regenerate/manual controls to request a plain-domain body link.
EOF
)"
```

---

### Task 2: `controlsFromInspection` helper

**Files:**
- Create: `/Users/coderlim/Projects/link-booster-extension/src/automation/comment-controls.ts`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/comment-controls.test.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/scripts/run-unit-tests.cjs` (only if tests are explicitly listed)

- [ ] **Step 1: Write failing mapping tests**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_COMMENT_CONTROLS,
  controlsFromInspection
} from "../automation/comment-controls"
import type { FormInspection } from "../automation/types"

const base: FormInspection = {
  supported: true,
  fields: {
    name: true,
    email: true,
    website: false,
    comment: true,
    submit: true
  },
  linkType: "HTML Link",
  linkRel: "Unknown",
  requiresLogin: false,
  hasCaptcha: false,
  usesModeration: false
}

test("defaults keep embed off", () => {
  assert.deepEqual(DEFAULT_COMMENT_CONTROLS, {
    length: 20,
    embedLink: false,
    linkType: "html"
  })
})

test("UserName Link turns embed off", () => {
  const next = controlsFromInspection(
    { ...base, fields: { ...base.fields, website: true }, linkType: "UserName Link" },
    DEFAULT_COMMENT_CONTROLS
  )
  assert.equal(next.embedLink, false)
  assert.equal(next.linkType, DEFAULT_COMMENT_CONTROLS.linkType)
  assert.equal(next.length, DEFAULT_COMMENT_CONTROLS.length)
})

test("body link types turn embed on and map format", () => {
  assert.deepEqual(
    controlsFromInspection({ ...base, linkType: "Text Link" }, DEFAULT_COMMENT_CONTROLS),
    { length: 20, embedLink: true, linkType: "text" }
  )
  assert.deepEqual(
    controlsFromInspection({ ...base, linkType: "Markdown Link" }, DEFAULT_COMMENT_CONTROLS),
    { length: 20, embedLink: true, linkType: "markdown" }
  )
})

test("unsupported inspection leaves prior controls", () => {
  const prior = { length: 40, embedLink: true, linkType: "bbcode" as const }
  const next = controlsFromInspection(
    { ...base, supported: false, linkType: null, reason: "link_placement_not_evidenced" },
    prior
  )
  assert.deepEqual(next, prior)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec node --test src/__tests__/comment-controls.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helper**

```ts
import type { FormInspection } from "./types"
import type { ManualLinkType } from "./comment-generation"

export type CommentControlsState = {
  length: number
  embedLink: boolean
  linkType: ManualLinkType
}

export const DEFAULT_COMMENT_CONTROLS: CommentControlsState = {
  length: 20,
  embedLink: false,
  linkType: "html"
}

export function controlsFromInspection(
  inspection: FormInspection,
  prior: CommentControlsState
): CommentControlsState {
  if (!inspection.linkType) return prior

  if (inspection.linkType === "UserName Link") {
    return { ...prior, embedLink: false }
  }

  const linkTypeByInspect: Record<
    Exclude<NonNullable<FormInspection["linkType"]>, "UserName Link">,
    ManualLinkType
  > = {
    "Text Link": "text",
    "HTML Link": "html",
    "Markdown Link": "markdown",
    "BBCode Link": "bbcode"
  }

  return {
    ...prior,
    embedLink: true,
    linkType: linkTypeByInspect[inspection.linkType]
  }
}
```

- [ ] **Step 4: Ensure test runner picks up the file**

If `scripts/run-unit-tests.cjs` lists files explicitly, append `src/__tests__/comment-controls.test.ts`. Then:

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec node scripts/run-unit-tests.cjs
```

Expected: PASS including comment-controls tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/coderlim/Projects/link-booster-extension
git add src/automation/comment-controls.ts src/__tests__/comment-controls.test.ts scripts/run-unit-tests.cjs
git commit -m "$(cat <<'EOF'
feat: map inspect linkType onto comment controls

Seed Automatic sidebar controls from successful page inspection.
EOF
)"
```

---

### Task 3: AutomaticRunner soft inspect + controls + regenerate

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/sidepanel/AutomaticRunner.tsx`

- [ ] **Step 1: Add control state and sync after inspect**

Near other `useState` hooks:

```tsx
const [commentLength, setCommentLength] = useState(DEFAULT_COMMENT_CONTROLS.length)
const [embedLink, setEmbedLink] = useState(DEFAULT_COMMENT_CONTROLS.embedLink)
const [linkType, setLinkType] = useState<ManualLinkType>(
  DEFAULT_COMMENT_CONTROLS.linkType
)
```

Import `DEFAULT_COMMENT_CONTROLS`, `controlsFromInspection`, and `ManualLinkType`.

After `setInspection(currentInspection)`:

```tsx
const synced = controlsFromInspection(currentInspection, {
  length: commentLength,
  embedLink,
  linkType
})
setCommentLength(synced.length)
setEmbedLink(synced.embedLink)
setLinkType(synced.linkType)
```

Note: use functional updates or a local `const controlsBefore = { length: commentLength, ...}` captured at start of `inspectAndPrepare` if stale closures are a concern; prefer reading current state once into `priorControls` at the top of the try block.

- [ ] **Step 2: Soft-continue on unsupported inspect; dual-track first generate**

Replace the early `awaitOperatorOutcome(..., "cannot_submit")` block for `!supported || requiresLogin` with continue-to-generate logic.

Pseudo for generate body:

```tsx
const inspectOk =
  currentInspection.supported &&
  !currentInspection.requiresLogin &&
  Boolean(currentInspection.linkType)

const response = (await retryOnce(() =>
  sendToBackground({
    name: "get-comment",
    body: inspectOk
      ? {
          mode: "automatic",
          tabId,
          inspection: currentInspection,
          targetSite: current.targetSiteSnapshot
        }
      : {
          mode: "manual",
          tabId,
          length: commentLength,
          embedLink: false,
          targetSite: current.targetSiteSnapshot
        }
  })
)) as GeneratedComment | { error: string }
```

Then existing fill → on fill failure: `setError(...)`, still `setPhase("awaiting_review")` + `setBusy(false)` (do **not** call `awaitOperatorOutcome` solely for inspect/fill soft failures). Keep hard `catch` → `failed` outcome.

Remove / skip the old path that marks `cannot_submit` for inspect failure.

- [ ] **Step 3: Add regenerate handler**

```tsx
const regenerateAndFill = async () => {
  if (!context || busy) return
  const tabId = /* current campaign tab id helper already used elsewhere */
  setBusy(true)
  setError("")
  try {
    setPhase("generating")
    const response = (await sendToBackground({
      name: "get-comment",
      body: {
        mode: "manual",
        tabId,
        length: commentLength,
        embedLink,
        linkType,
        targetSite: context.targetSiteSnapshot
      }
    })) as GeneratedComment | { error: string }
    if ("error" in response) throw new Error(response.error)
    setGenerated(response)
    setComment(response.comment)
    const fillResponse = (await sendToBackground({
      name: "fill-comment-form",
      body: {
        tabId,
        name: context.targetSiteSnapshot.name,
        email: context.targetSiteSnapshot.email,
        website: context.targetSiteSnapshot.domain,
        comment: response.comment
      }
    })) as FillResponse
    if (!fillResponse.success) {
      setError(
        `填充失败: ${
          fillResponse.error ??
          fillResponse.result?.reason ??
          "comment_form_fill_failed"
        }`
      )
    }
    setPhase("awaiting_review")
  } catch (reason) {
    setError(errorMessage(reason).slice(0, 500))
    setPhase("awaiting_review")
  } finally {
    setBusy(false)
  }
}
```

Reuse the same tab-id source as `submitAndContinue` / fill (read existing helpers in the file — do not invent a second open).

- [ ] **Step 4: Render controls + regenerate button**

In the comment section (always show controls whenever `context` is active or `phase` is generating/awaiting_review/inspecting after start — minimum: whenever `phase === "awaiting_review" || comment`):

```tsx
<section className="border border-zinc-200 bg-white p-4 space-y-3">
  <div className="flex items-center gap-3">
    <label className="text-sm font-medium text-zinc-700 whitespace-nowrap">字数</label>
    <input
      type="number"
      min={10}
      value={commentLength}
      onChange={(e) => setCommentLength(Number(e.target.value))}
      disabled={busy || phase !== "awaiting_review"}
      className="flex-1 border border-zinc-300 px-3 py-2 text-sm"
    />
  </div>
  <label className="flex items-center gap-2 text-sm text-zinc-700">
    <input
      type="checkbox"
      checked={embedLink}
      onChange={(e) => setEmbedLink(e.target.checked)}
      disabled={busy || phase !== "awaiting_review"}
    />
    嵌入链接
  </label>
  {embedLink ? (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-zinc-700 whitespace-nowrap">链接格式</label>
      <select
        value={linkType}
        onChange={(e) => setLinkType(e.target.value as ManualLinkType)}
        disabled={busy || phase !== "awaiting_review"}
        className="flex-1 border border-zinc-300 px-3 py-2 text-sm"
      >
        <option value="text">Text Link</option>
        <option value="html">HTML</option>
        <option value="markdown">Markdown</option>
        <option value="bbcode">BBCode</option>
      </select>
    </div>
  ) : null}
  {/* existing textarea */}
  {phase === "awaiting_review" ? (
    <button
      type="button"
      onClick={() => void regenerateAndFill()}
      disabled={busy || !context}
      className="h-10 w-full border border-zinc-300 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
    >
      重新生成
    </button>
  ) : null}
</section>
```

Show the section whenever there is `context` in an active item flow after inspect starts, not only when `comment` is non-empty — so controls are visible even while generating. Practical rule: show if `phase` is one of `inspecting | generating | awaiting_review` or `comment` is set.

- [ ] **Step 5: Manual smoke checklist (no unit UI test required)**

1. Reload unpacked DEV extension.
2. Automatic on a page with evidenced placement → controls seeded; first comment filled.
3. Automatic on empty-comment page (`link_placement_not_evidenced`) → comment still appears; no auto `cannot_submit`; regenerate with embed+HTML fills.
4. Toggle Text Link regenerate → plain domain in comment body.

- [ ] **Step 6: Commit**

```bash
cd /Users/coderlim/Projects/link-booster-extension
git add src/sidepanel/AutomaticRunner.tsx
git commit -m "$(cat <<'EOF'
feat: show comment controls and regenerate in Automatic

Continue past inspect failure into review, seed controls from inspection,
and regenerate with auto-fill from sidebar options.
EOF
)"
```

---

### Task 4: Manual tool Text Link option

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/sidepanel/ManualCommentTool.tsx`

- [ ] **Step 1: Widen types and dropdown**

```ts
import type { ManualLinkType } from "~/automation/comment-generation"

const DEFAULT_CONFIG = {
  commentLength: 20,
  embedLink: false,
  linkType: "html" as ManualLinkType,
  autoGenerateComment: false
}
```

Replace `useStorage<"html" | "markdown" | "bbcode">` with `useStorage<ManualLinkType>`.

In the select:

```tsx
<option value="text">Text Link</option>
<option value="html">HTML</option>
<option value="markdown">Markdown</option>
<option value="bbcode">BBCode</option>
```

Update `copyLinkFormat` switch to handle `"text"` → domain string (same as `formatBodyLink` Text Link).

- [ ] **Step 2: Typecheck / unit suite**

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec node scripts/run-unit-tests.cjs
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/coderlim/Projects/link-booster-extension
git add src/sidepanel/ManualCommentTool.tsx
git commit -m "$(cat <<'EOF'
feat: add Text Link option to Manual comment tool

Keep Manual format choices aligned with Automatic controls.
EOF
)"
```

---

### Task 5: Docs commit (auto-backlink)

**Files:**
- Add: `/Users/coderlim/Projects/auto-backlink/docs/superpowers/specs/2026-07-26-automatic-comment-controls-design.md`
- Add: `/Users/coderlim/Projects/auto-backlink/docs/superpowers/plans/2026-07-26-automatic-comment-controls.md`

- [ ] **Step 1: Commit docs on docs branch**

```bash
cd /Users/coderlim/Projects/auto-backlink
git add docs/superpowers/specs/2026-07-26-automatic-comment-controls-design.md \
  docs/superpowers/plans/2026-07-26-automatic-comment-controls.md
git commit -m "$(cat <<'EOF'
docs: automatic comment controls and regenerate plan

Capture dual-track generation, inspect seeding, and Text Link support.
EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Inspect fail → still generate, `awaiting_review` | Task 3 |
| First gen automatic when inspect OK | Task 3 |
| First gen no-embed manual when inspect fail | Task 3 |
| Controls always shown | Task 3 |
| Inspect seeds controls | Task 2 + 3 |
| Regenerate → manual controls → auto-fill | Task 3 |
| Text Link in types + both UIs | Task 1 + 3 + 4 |
| No silent coerce in get-comment handler | Task 3 (Runner chooses mode) |
| Docs | Task 5 |

## Self-review notes

- No TBD placeholders.
- `ManualLinkType` / `"text"` naming consistent across tasks.
- Soft fill failure stays on review (Task 3 Step 2) matches spec Failure handling.
