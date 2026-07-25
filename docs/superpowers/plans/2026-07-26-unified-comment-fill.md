# Unified Comment Generation & Form Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Automatic and Manual share one comment-generation kernel and one form-fill kernel, expose generation as `get-comment`, and purge leftover Campaign naming from the executor path.

**Architecture:** Keep mode-specific orchestration (Automatic inspect gate vs Manual sidebar controls). Unify DOM fill through `comment-form-actions.fill()` without requiring `inspection.supported`. Replace old `genComment` `get-comment` with the validated generator formerly behind `get-campaign-comment`, supporting `mode: "automatic" | "manual"`. Extend target options with `email` so Manual can fill identity the same way Automatic does.

**Tech Stack:** Plasmo Chrome MV3, React, TypeScript, Node test runner (`scripts/run-unit-tests.cjs`), LinkMaster Next.js targets route

**Spec:** `docs/superpowers/specs/2026-07-26-unified-comment-fill-design.md`

---

## File Map

Link Booster (`/Users/coderlim/Projects/link-booster-extension`):

- Modify: `src/utils/comment-form.ts` — prefer visible Quill/wpDiscuz editor when choosing comment control
- Modify: `src/utils/comment-form-actions.ts` — fill without `supported` gate; website when control exists; Quill+textarea sync
- Modify: `src/__tests__/comment-form-actions.test.ts` — cover unsupported-but-fillable + Quill sync
- Modify: `src/__tests__/comment-form.test.ts` — comment-control preference if selector logic changes
- Modify: `src/content.ts` — single fill action; delete `fillManualForm` / `fill-form`
- Modify: `src/background/messages/fill-comment-form.ts` — always shared fill; truthful success
- Modify: `src/utils/campaign-tab-actions.ts` — rename fill action type if content action renamed
- Create: `src/automation/comment-generation.ts` — move/rename from `campaign-comment.ts`; add Manual placement
- Create: `src/__tests__/comment-generation.test.ts` — rename/extend from `campaign-comment.test.ts`
- Delete: `src/automation/campaign-comment.ts`, `src/__tests__/campaign-comment.test.ts` (after move)
- Modify: `src/background/messages/get-comment.ts` — dual-mode handler
- Delete: `src/background/messages/get-campaign-comment.ts`
- Modify: `src/sidepanel/ManualCommentTool.tsx` — new `get-comment` + fill identity with email
- Modify: `src/sidepanel/AutomaticRunner.tsx` — call `get-comment` with `mode: "automatic"`
- Modify: `src/automation/types.ts` — `TargetSiteOption.email`
- Modify: `src/automation/api-client.ts` / `src/__tests__/automation-api.test.ts` — parse email on targets
- Modify: imports in `execution-checklist.ts`, `classify-topic-category.ts`, `AutomaticRunner.tsx`
- Delete: `src/sidepanel/CampaignRunner.tsx` if unused
- Modify: `scripts/run-unit-tests.cjs` — new test/source paths

LinkMaster (`/Users/coderlim/Projects/link-master`):

- Modify: targets route / serializer so `GET /api/automation/targets` includes `email`
- Modify: related tests

Contracts (`/Users/coderlim/Projects/auto-backlink`):

- Modify: `contracts/automation-api-v1.md` — document `email` on target options

---

### Task 1: Shared `fill()` — drop supported gate + Quill preference

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/utils/comment-form-actions.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/utils/comment-form.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/comment-form-actions.test.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/scripts/run-unit-tests.cjs` (only if needed later)

- [ ] **Step 1: Write failing tests for fill-without-supported and Quill sync**

Add to `comment-form-actions.test.ts`:

```ts
test("fills a discoverable form even when link placement is not evidenced", async () => {
  const { document } = parseHTML(`
    <form id="commentform" class="comment-form">
      <input name="author">
      <input type="email" name="email">
      <textarea name="comment"></textarea>
      <button type="submit">Post Comment</button>
    </form>
  `)

  const inspection = await inspect(document)
  assert.equal(inspection.supported, false)
  assert.equal(inspection.reason, "link_placement_not_evidenced")

  const result = await fill(document, {
    name: "Tekken 3",
    email: "owner@tekken3.cc",
    website: "https://tekken3.cc",
    comment: "The timing window is clear from the article."
  })

  assert.equal(result.success, true)
  assert.ok((result.filledCount ?? 0) >= 3)
  assert.equal(
    (document.querySelector('[name="comment"]') as HTMLTextAreaElement).value,
    "The timing window is clear from the article."
  )
  assert.equal(
    (document.querySelector('[name="author"]') as HTMLInputElement).value,
    "Tekken 3"
  )
})

test("prefers visible Quill editor and syncs wc_comment textarea", async () => {
  const { document } = parseHTML(`
    <form class="wpd_comm_form wpd_main_comm_form" method="post">
      <textarea name="wc_comment" class="wc_comment"></textarea>
      <div class="ql-editor" contenteditable="true"></div>
      <input class="wc_name" name="wc_name" placeholder="Name*" />
      <input class="wc_email" type="email" name="wc_email" placeholder="Email*" />
      <input class="wc_comm_submit" type="submit" name="submit" value="Lähetä kommentti" />
    </form>
  `)

  const result = await fill(document, {
    name: "Tekken 3",
    email: "owner@tekken3.cc",
    website: "https://tekken3.cc",
    comment: "Visible editor comment body."
  })

  assert.equal(result.success, true)
  assert.equal(
    document.querySelector(".ql-editor")?.textContent,
    "Visible editor comment body."
  )
  assert.equal(
    (document.querySelector('[name="wc_comment"]') as HTMLTextAreaElement).value,
    "Visible editor comment body."
  )
})

test("fills website only when a website control exists", async () => {
  const { document } = parseHTML(`
    <form class="comment-form">
      <input name="author">
      <input type="email" name="email">
      <textarea name="comment"></textarea>
      <button type="submit">Post</button>
    </form>
  `)

  const result = await fill(document, identity)
  assert.equal(result.success, true)
  assert.equal(result.filledCount, 3)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec node scripts/run-unit-tests.cjs
```

Expected: FAIL on the new assertions (current `fill()` returns `comment_form_not_supported` / wrong Quill target).

- [ ] **Step 3: Implement fill gate + Quill preference**

In `comment-form-actions.ts`, change `fill()` roughly to:

```ts
export async function fill(
  document: Document,
  payload: FillPayload
): Promise<FillResult> {
  revealCommentComposer(document)
  await sleep(350)

  const controls = findCommentFormControls(document)
  if (!controls) {
    return {
      success: false,
      filledCount: 0,
      reason: "comment_form_not_found"
    }
  }

  const needsWebsite = Boolean(controls.website)
  const identityComplete = Boolean(
    payload.name?.trim() &&
      payload.email?.trim() &&
      payload.comment?.trim() &&
      (!needsWebsite || payload.website?.trim())
  )

  if (!identityComplete) {
    return {
      success: false,
      filledCount: 0,
      reason: "missing_required_identity"
    }
  }

  const commentTarget = resolveCommentWriteTarget(document, controls.comment)

  const values: Array<[Element | null, string]> = [
    [controls.name, payload.name],
    [controls.email, payload.email],
    [needsWebsite ? controls.website : null, payload.website],
    [commentTarget.primary, payload.comment]
  ]

  let filledCount = 0
  for (const [control, value] of values) {
    if (!control) continue
    setControlValue(document, control, value)
    filledCount += 1
  }

  if (commentTarget.sync && commentTarget.sync !== commentTarget.primary) {
    setControlValue(document, commentTarget.sync, payload.comment)
  }

  return {
    success: filledCount > 0,
    filledCount,
    ...(filledCount > 0 ? {} : { reason: "no_fields_filled" })
  }
}
```

Add helper in the same file (or `comment-form.ts`):

```ts
function resolveCommentWriteTarget(document: Document, comment: Element) {
  const form = comment.closest("form") ?? document
  const quill =
    form.querySelector?.(".ql-editor[contenteditable='true']") ??
    form.querySelector?.('[contenteditable="true"][role="textbox"]') ??
    form.querySelector?.('div[contenteditable="true"]')

  if (quill && comment !== quill) {
    return { primary: quill, sync: comment }
  }
  return { primary: comment, sync: null }
}
```

Do **not** call `inspectCommentPage` for the supported gate inside `fill()`.

- [ ] **Step 4: Re-run unit tests**

Run:

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec node scripts/run-unit-tests.cjs
```

Expected: PASS for new fill tests; update any old test that expected `fill()` to fail solely because `supported === false`.

- [ ] **Step 5: Commit**

```bash
cd /Users/coderlim/Projects/link-booster-extension
git add src/utils/comment-form-actions.ts src/utils/comment-form.ts src/__tests__/comment-form-actions.test.ts
git commit -m "$(cat <<'EOF'
fix: fill comment forms without link-placement gate

Allow Manual and shared fill to write discoverable controls even when
inspection cannot prove link placement, and prefer Quill over hidden textareas.
EOF
)"
```

---

### Task 2: Unify `fill-comment-form` message path

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/content.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/background/messages/fill-comment-form.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/utils/campaign-tab-actions.ts`

- [ ] **Step 1: Remove Manual-only fill fork in content script**

In `content.ts`:

- Delete `fillManualForm` entirely.
- Remove `fill-form` from the message union and listener branch.
- Keep a single fill action. Prefer renaming `fill-campaign-form` → `fill-comment-form` in content + tab helpers + background. If rename is noisy, keep `fill-campaign-form` string temporarily but only one code path may remain.

Listener shape:

```ts
case "fill-comment-form": // or fill-campaign-form during rename
  respond(await fill(document, message.data))
  break
```

- [ ] **Step 2: Make background always use shared fill and truthful success**

Replace `fill-comment-form.ts` so both branches send the same content action:

```ts
const payload = {
  action: "fill-comment-form", // match content.ts
  data: {
    name,
    email,
    website,
    comment: comment ?? ""
  }
}

// resolve tabId: body.tabId if valid, else active tab
// sendMessage (+ inject content scripts on Receiving end missing)
// res.send({
//   success: Boolean(result?.success),
//   result
// })
```

Never force `success: true` for Manual.

- [ ] **Step 3: Update `campaign-tab-actions.ts` action name to match**

Keep TypeScript unions in sync with content.ts.

- [ ] **Step 4: Smoke-check TypeScript / tests**

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec node scripts/run-unit-tests.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/coderlim/Projects/link-booster-extension
git add src/content.ts src/background/messages/fill-comment-form.ts src/utils/campaign-tab-actions.ts
git commit -m "$(cat <<'EOF'
refactor: route Manual and Automatic fills through one content action

Remove fillManualForm and stop reporting false fill successes.
EOF
)"
```

---

### Task 3: Comment generation module — rename + Manual placement

**Files:**
- Create: `/Users/coderlim/Projects/link-booster-extension/src/automation/comment-generation.ts`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/comment-generation.test.ts`
- Delete: `src/automation/campaign-comment.ts`, `src/__tests__/campaign-comment.test.ts`
- Modify: imports in `execution-checklist.ts`, `classify-topic-category.ts`, `AutomaticRunner.tsx`
- Modify: `scripts/run-unit-tests.cjs`

- [ ] **Step 1: Move module and add Manual placement types**

Copy `campaign-comment.ts` → `comment-generation.ts`. Rename public symbols:

- `CampaignComment*` → `GeneratedComment*` / `CommentGeneration*` (choose one consistent prefix, e.g. `CommentGeneration`)
- `buildCampaignCommentMessages` → `buildCommentMessages`
- `validateCampaignComment` → `validateGeneratedComment`
- `generateValidatedCampaignComment` → `generateValidatedComment`
- `CAMPAIGN_COMMENT_RESPONSE_SCHEMA` → `COMMENT_RESPONSE_SCHEMA`
- Error strings: `invalid_campaign_comment_json` → `invalid_comment_json`

Extend input so Manual does not need a real FormInspection:

```ts
export type ManualLinkType = "html" | "markdown" | "bbcode"

export type CommentPlacement =
  | { kind: "inspection"; inspection: FormInspection }
  | {
      kind: "manual"
      embedLink: boolean
      linkType?: ManualLinkType
      length: number
    }

export interface CommentGenerationInput {
  pageText: string
  pageLanguage?: string
  targetSite: TargetSiteSnapshot
  placement: CommentPlacement
  validationReason?: string
}
```

- [ ] **Step 2: Write failing tests for Manual placement prompts/validation**

In `comment-generation.test.ts` (ported + new):

```ts
test("manual embedLink false omits target url from prompt", () => {
  const messages = buildCommentMessages({
    pageText: "The article explains the King combo timing window.",
    pageLanguage: "English",
    targetSite,
    placement: {
      kind: "manual",
      embedLink: false,
      length: 20
    }
  })
  const prompt = messages.map(({ content }) => content).join("\n")
  assert.match(prompt, /do not include.*Tekken 3/i)
  assert.match(prompt, /do not include.*https:\/\/tekken3\.cc/i)
  assert.match(prompt, /about 20 words|approximately 20|~20|length.*20/i)
})

test("manual embedLink html requires exact HTML link", () => {
  const messages = buildCommentMessages({
    pageText: "The article explains the King combo timing window.",
    pageLanguage: "English",
    targetSite,
    placement: {
      kind: "manual",
      embedLink: true,
      linkType: "html",
      length: 40
    }
  })
  const prompt = messages.map(({ content }) => content).join("\n")
  assert.ok(prompt.includes('<a href="https://tekken3.cc">Tekken 3</a>'))
})
```

Map Manual `html|markdown|bbcode` → existing `formatBodyLink` body types (`HTML Link`, etc.).

- [ ] **Step 3: Implement placement branching in build/validate**

```ts
const placementInstruction = (input: CommentGenerationInput) => {
  if (input.placement.kind === "inspection") {
    const { inspection } = input.placement
    // existing UserName / body-link / none logic
  }
  const { embedLink, linkType, length } = input.placement
  const lengthLine = `Aim for about ${length} words.`
  if (!embedLink) {
    return `${lengthLine} Do not include the target name "${input.targetSite.name}" or target URL "${input.targetSite.domain}" in the comment.`
  }
  const bodyType =
    linkType === "markdown"
      ? "Markdown Link"
      : linkType === "bbcode"
        ? "BBCode Link"
        : "HTML Link"
  return `${lengthLine} Include this exact formatted link without changing any character: ${formatBodyLink(input.targetSite, bodyType)}`
}
```

Validation for Manual:

- `embedLink === false` → reject if name/domain/hostname appear in comment (same idea as UserName Link).
- `embedLink === true` → require exact `formatBodyLink(...)`.
- Keep sentence count, referencedDetail, topicCategory, language checks.

Keep Automatic path behavior identical by wrapping existing inspection into `{ kind: "inspection", inspection }`.

- [ ] **Step 4: Update run-unit-tests.cjs paths and fix imports**

Replace `campaign-comment` entries with `comment-generation` in `scripts/run-unit-tests.cjs`. Update all imports. Delete old files.

- [ ] **Step 5: Run tests**

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec node scripts/run-unit-tests.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/coderlim/Projects/link-booster-extension
git add src/automation/comment-generation.ts src/__tests__/comment-generation.test.ts \
  src/automation/execution-checklist.ts src/automation/classify-topic-category.ts \
  src/sidepanel/AutomaticRunner.tsx scripts/run-unit-tests.cjs
git rm -f src/automation/campaign-comment.ts src/__tests__/campaign-comment.test.ts
git commit -m "$(cat <<'EOF'
refactor: rename comment generation and support Manual placement

Replace campaign-comment with a shared generator that accepts inspection or
Manual embed/link-type/length controls.
EOF
)"
```

---

### Task 4: Single `get-comment` background handler

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/background/messages/get-comment.ts`
- Delete: `/Users/coderlim/Projects/link-booster-extension/src/background/messages/get-campaign-comment.ts`

- [ ] **Step 1: Rewrite `get-comment.ts`**

```ts
import type { PlasmoMessaging } from "@plasmohq/messaging"
import {
  generateValidatedComment,
  type CommentGenerationMessage
} from "~/automation/comment-generation"
import type { FormInspection, TargetSiteSnapshot } from "~/automation/types"
import { modelManager } from "~/utils/model-providers"
import { getActivePageContent, getPageContent } from "~/utils/page-content"

type AutomaticBody = {
  mode: "automatic"
  tabId: number
  inspection: FormInspection
  targetSite: TargetSiteSnapshot
}

type ManualBody = {
  mode: "manual"
  length: number
  embedLink: boolean
  linkType?: "html" | "markdown" | "bbcode"
  language?: string
  targetSite: TargetSiteSnapshot
  tabId?: number
}

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    const body = req.body as AutomaticBody | ManualBody
    const targetSite = body.targetSite
    if (
      !targetSite?.name?.trim() ||
      !targetSite.domain?.trim() ||
      !targetSite.email?.trim()
    ) {
      throw new Error("invalid_target_site_identity")
    }

    let pageText = ""
    let pageLanguage: string | undefined

    if (body.mode === "automatic") {
      if (!Number.isInteger(body.tabId) || body.tabId <= 0) {
        throw new Error("invalid_tab_id")
      }
      if (!body.inspection?.supported || !body.inspection.linkType) {
        throw new Error("link_placement_not_evidenced")
      }
      const page = await getPageContent(body.tabId)
      pageText = [page.title, page.textContent].filter(Boolean).join("\n\n").slice(0, 40_000)
      pageLanguage = page.lang
    } else {
      const page = body.tabId
        ? await getPageContent(body.tabId)
        : await getActivePageContent()
      pageText = [page.title, page.textContent].filter(Boolean).join("\n\n").slice(0, 40_000)
      pageLanguage = body.language?.trim() || page.lang
    }

    const provider = await modelManager.getCurrentProvider()
    const result = await generateValidatedComment(
      {
        pageText,
        pageLanguage,
        targetSite,
        placement:
          body.mode === "automatic"
            ? { kind: "inspection", inspection: body.inspection }
            : {
                kind: "manual",
                embedLink: body.embedLink,
                linkType: body.linkType,
                length: body.length
              }
      },
      (messages: CommentGenerationMessage[], config) =>
        provider.generateResponse(messages, {
          responseFormat: config.responseFormat,
          responseSchema: config.responseSchema
        })
    )

    res.send(result)
  } catch (error) {
    res.send({ error: error instanceof Error ? error.message : String(error) })
  }
}

export default handler
```

Adjust imports to match actual `page-content` exports (`getActivePageContent` / `getPageContent`).

- [ ] **Step 2: Delete `get-campaign-comment.ts`**

```bash
cd /Users/coderlim/Projects/link-booster-extension
git rm src/background/messages/get-campaign-comment.ts
```

- [ ] **Step 3: Point AutomaticRunner at `get-comment`**

In `AutomaticRunner.tsx`, replace:

```ts
name: "get-campaign-comment",
```

with:

```ts
name: "get-comment",
body: {
  mode: "automatic",
  tabId,
  inspection: currentInspection,
  targetSite: current.targetSiteSnapshot
}
```

Keep response handling (`comment`, errors) compatible with `GeneratedComment` shape.

- [ ] **Step 4: Commit**

```bash
cd /Users/coderlim/Projects/link-booster-extension
git add src/background/messages/get-comment.ts src/sidepanel/AutomaticRunner.tsx
git rm -f src/background/messages/get-campaign-comment.ts
git commit -m "$(cat <<'EOF'
feat: unify comment generation behind get-comment modes

Automatic uses inspection placement; remove get-campaign-comment entrypoint.
EOF
)"
```

---

### Task 5: Target options include email (Minimal API amendment)

Spec originally marked LinkMaster API out of scope, but Manual cannot match Automatic identity without email on the selected target. This task is the required minimal exception.

**Files:**
- Modify: `/Users/coderlim/Projects/auto-backlink/contracts/automation-api-v1.md`
- Modify: LinkMaster targets route under `/Users/coderlim/Projects/link-master` (find current `targets/route` + tests)
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/automation/types.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/automation-api.test.ts`

- [ ] **Step 1: Update contract example**

In `contracts/automation-api-v1.md`, change Target Options to:

```json
{
  "apiVersion": 1,
  "data": [
    {
      "name": "CSV Viewer",
      "domain": "https://csvviewer.net",
      "email": "comment@csvviewer.net"
    }
  ]
}
```

State that email is returned for comment-form identity filling; still omit credentials/descriptions.

- [ ] **Step 2: Return email from LinkMaster targets**

Update the targets serializer/tests so each option includes non-empty `email` (same sites already filtered by valid email).

- [ ] **Step 3: Extend extension type + client expectations**

```ts
export interface TargetSiteOption {
  name: string
  domain: string
  email: string
}
```

Update `automation-api.test.ts` fixtures accordingly.

- [ ] **Step 4: Commit (per repo)**

```bash
cd /Users/coderlim/Projects/auto-backlink
git add contracts/automation-api-v1.md
git commit -m "$(cat <<'EOF'
docs: include email on automation target options

Manual and Automatic fill identity both need the target commenter email.
EOF
)"

cd /Users/coderlim/Projects/link-master
# add targets route + tests
git commit -m "$(cat <<'EOF'
feat: return email on automation target options

Enable extension Manual fill to use the same identity as Automatic.
EOF
)"

cd /Users/coderlim/Projects/link-booster-extension
git add src/automation/types.ts src/__tests__/automation-api.test.ts
git commit -m "$(cat <<'EOF'
feat: expect email on TargetSiteOption

Manual fill and get-comment require target email identity.
EOF
)"
```

---

### Task 6: Wire ManualCommentTool to shared generate + fill

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/sidepanel/ManualCommentTool.tsx`

- [ ] **Step 1: Update `generateComment` to call new `get-comment`**

```ts
const response = await sendToBackground({
  name: "get-comment",
  body: {
    mode: "manual",
    length: commentLength,
    embedLink,
    linkType,
    language: "English", // keep current Manual default unless page lang is already available
    targetSite: {
      name: selectedSite.name,
      domain: selectedSite.domain,
      email: selectedSite.email
    }
  }
})
```

Require `selectedSite` even when `embedLink` is false (identity + grounding site). Map `response.comment` into existing UI state; optional `translation` can fall back to `comment` if absent.

- [ ] **Step 2: Update `fillCommentForm` identity + success handling**

```ts
const response = await sendToBackground({
  name: "fill-comment-form",
  body: {
    name: selectedSite.name,
    email: selectedSite.email,
    website: selectedSite.domain,
    comment
  }
})

if (response.success && response.result?.filledCount > 0) {
  setFillFormStatus("填充完成")
} else {
  setFillFormStatus("填充失败")
}
```

Disable fill/generate when `!selectedSite?.email`.

- [ ] **Step 3: Keep Manual controls UI**

Do not remove length / embedLink / linkType controls. They feed `get-comment` only.

- [ ] **Step 4: Manual compile check**

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec tsc --noEmit
```

Expected: no type errors related to ManualCommentTool / TargetSiteOption.email.

- [ ] **Step 5: Commit**

```bash
cd /Users/coderlim/Projects/link-booster-extension
git add src/sidepanel/ManualCommentTool.tsx
git commit -m "$(cat <<'EOF'
feat: point Manual mode at shared get-comment and fill identity

Keep sidebar controls; fill name/email/website from the selected target.
EOF
)"
```

---

### Task 7: Remove unused Campaign runner / leftover naming on executor UI path

**Files:**
- Delete: `/Users/coderlim/Projects/link-booster-extension/src/sidepanel/CampaignRunner.tsx` (confirm no imports first)
- Grep and fix remaining user-facing "Campaign" strings on sidepanel/options if trivial
- Leave `campaign-resume.ts` / historical tests only if still referenced by Automatic; if purely dead, delete in a follow-up — do not expand scope unless unused

- [ ] **Step 1: Confirm CampaignRunner is unused**

```bash
cd /Users/coderlim/Projects/link-booster-extension
rg -n "CampaignRunner" src
```

Expected: no imports from `index.tsx`.

- [ ] **Step 2: Delete file and fix any stray imports**

```bash
git rm src/sidepanel/CampaignRunner.tsx
```

- [ ] **Step 3: Run full unit suite**

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec node scripts/run-unit-tests.cjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/coderlim/Projects/link-booster-extension
git commit -m "$(cat <<'EOF'
chore: remove unused CampaignRunner from side panel path

Campaign execution UI is retired; Automatic/Manual share the new kernels.
EOF
)"
```

---

### Task 8: Verification checklist (manual)

- [ ] **Step 1: Unit suite green**

```bash
cd /Users/coderlim/Projects/link-booster-extension && pnpm exec node scripts/run-unit-tests.cjs
```

- [ ] **Step 2: Manual browser check on wpDiscuz page**

URL: `https://pt-media.org/2026/07/23/varillinen-taksikuski-suuttui-ku-ei-ollutkaan-taksilupaa/`

1. Manual: select target with email → generate (controls work) → fill → visible Quill/name/email populated.
2. Automatic: if inspect unsupported → no generate/fill; if supported → fill uses same DOM path and shows values in Quill.

- [ ] **Step 3: Confirm old message names are gone**

```bash
cd /Users/coderlim/Projects/link-booster-extension
rg -n "get-campaign-comment|fillManualForm|action: \"fill-form\"" src
```

Expected: no matches (except maybe docs/history outside `src`).

---

## Spec coverage self-check

| Spec requirement | Task |
| --- | --- |
| Shared fill kernel; no Manual fork | Task 1–2 |
| fill without `supported` gate | Task 1 |
| Quill/wpDiscuz visible editor | Task 1 |
| `get-comment` dual mode; retire campaign generator entry | Task 3–4 |
| Manual controls kept and effective | Task 3, 6 |
| Automatic still uses inspection placement | Task 4 |
| name/email/website from target site | Task 5–6 |
| Truthful Manual fill success | Task 2, 6 |
| Purge CampaignRunner / campaign entrypoints | Task 4, 7 |
| Tests listed in spec | Task 1, 3, 8 |

## Note on contract scope

Including `email` on `GET /api/automation/targets` is a deliberate one-field amendment required by the approved identity decision. No other queue/result protocol changes.
