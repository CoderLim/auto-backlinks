# Link Booster Campaign Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/Users/coderlim/Projects/link-booster-extension` into the supervised browser executor for LinkMaster POC Campaigns.

**Architecture:** The Side Panel owns one non-persistent automation tab and orchestrates one Item at a time. A typed API client talks only to LinkMaster; pure DOM modules inspect, fill, submit, and verify comment pages; AI helpers generate a page-language comment plus category metadata. Every Item pauses before the user-triggered submit action.

**Tech Stack:** Plasmo 0.85, Chrome Manifest V3, React 18, TypeScript, `@plasmohq/messaging`, Node test runner, linkedom fixtures.

---

### Task 1: Extend the Existing Test Harness for DOM Fixtures

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/package.json`
- Modify: `/Users/coderlim/Projects/link-booster-extension/scripts/run-unit-tests.cjs`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/comment-form.test.ts`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/utils/comment-form.ts`

- [ ] **Step 1: Add linkedom and a failing fixture test**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { parseHTML } from "linkedom"

import { inspectCommentPage } from "../utils/comment-form"

test("detects a WordPress author website form", () => {
  const { document } = parseHTML(`
    <article><p>A concrete article detail about sliding blocks.</p></article>
    <form id="commentform">
      <input name="author">
      <input type="email" name="email">
      <input name="url">
      <textarea name="comment"></textarea>
      <button type="submit">Post Comment</button>
    </form>
  `)

  const result = inspectCommentPage(document)
  assert.equal(result.supported, true)
  assert.equal(result.linkType, "UserName Link")
  assert.equal(result.fields.website, true)
})
```

- [ ] **Step 2: Add the test dependencies and runner entries**

Add `linkedom` to `devDependencies`. Add every new test and source module explicitly to `sources` and the emitted JavaScript file to `tests` in `scripts/run-unit-tests.cjs`.

- [ ] **Step 3: Verify the failure**

```bash
pnpm install
pnpm test
```

Expected: FAIL because `inspectCommentPage` is not implemented.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/run-unit-tests.cjs src/__tests__/comment-form.test.ts
git commit -m "test: add comment page dom fixtures"
```

### Task 2: Define the LinkMaster API Contract and Client

**Files:**
- Create: `/Users/coderlim/Projects/link-booster-extension/src/automation/types.ts`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/automation/api-client.ts`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/automation-api.test.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/scripts/run-unit-tests.cjs`

- [ ] **Step 1: Define version 1 types**

Define:

```ts
export type CampaignStatus = "active" | "completed" | "cancelled"
export type CampaignItemStatus =
  | "pending"
  | "inspecting"
  | "awaiting_review"
  | "submitted"
  | "published"
  | "pending_moderation"
  | "not_visible_after_submit"
  | "explicit_reject"
  | "skipped"
  | "cannot_submit"
  | "failed"

export interface TargetSiteSnapshot {
  name: string
  domain: string
  email: string
}

export interface CampaignItem {
  itemId: string
  backlinkId: string
  url: string
  order: number
  status: CampaignItemStatus
}
```

Also define `ActiveCampaign`, `NextItemResponse`, `ObservedMetadata`, `FormInspection`, and `ItemPatch` with no `details`, password, or GitHub token fields.

- [ ] **Step 2: Test request construction and errors**

Use an injected `fetch` mock to assert:

- base URL trailing slashes are normalized;
- every request sends `Authorization: Bearer <token>`;
- 204 returns `null`;
- JSON errors include the HTTP status;
- a network error is retried once only for GET;
- PATCH and POST are never automatically retried by the client.

- [ ] **Step 3: Implement `AutomationApiClient`**

Expose:

```ts
getActiveCampaign(): Promise<ActiveCampaign | null>
getNextItem(campaignId: string): Promise<NextItemResponse | null>
patchItem(campaignId: string, itemId: string, patch: ItemPatch): Promise<CampaignItem>
completeCampaign(campaignId: string): Promise<ActiveCampaign>
cancelCampaign(campaignId: string): Promise<ActiveCampaign>
```

Validate `apiVersion === 1` and reject an empty base URL or token before calling `fetch`.

- [ ] **Step 4: Run and commit**

```bash
pnpm test
git add src/automation src/__tests__/automation-api.test.ts scripts/run-unit-tests.cjs
git commit -m "feat: add linkmaster automation client"
```

### Task 3: Implement Comment Page Inspection and Link Strategy

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/utils/comment-form.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/comment-form.test.ts`

- [ ] **Step 1: Add fixture coverage**

Add fixtures for:

- author, email, Website URL, comment, and submit fields;
- comment form without Website URL;
- existing external body links in `.comment-content`;
- HTML, Markdown, BBCode, and plain URL editor hints;
- no comment form;
- login prompt and CAPTCHA;
- author anchors with and without `nofollow`.

- [ ] **Step 2: Implement inspection types**

```ts
export interface CommentPageInspection {
  supported: boolean
  fields: { name: boolean; email: boolean; website: boolean; comment: boolean; submit: boolean }
  linkType: "UserName Link" | "Text Link" | "HTML Link" | "Markdown Link" | "BBCode Link" | null
  linkRel: "Dofollow" | "Nofollow" | "Unknown"
  requiresLogin: boolean
  hasCaptcha: boolean
  usesModeration: boolean
  reason?: string
}
```

- [ ] **Step 3: Apply the approved priority**

`inspectCommentPage(document)` must:

1. return `UserName Link` when a Website URL field and comment field exist;
2. otherwise use a body-link mode only when existing comment-body anchors prove body links are accepted and editor evidence identifies a supported format;
3. return unsupported when neither path is evidenced;
4. classify `Nofollow` when the representative anchor contains that token, `Dofollow` when an inspected representative anchor does not, and `Unknown` when no representative anchor exists.

- [ ] **Step 4: Add safe body link formatting**

Export `formatBodyLink(site, linkType)` and assert exact output:

```text
Text Link: https://tekken3.cc
HTML Link: <a href="https://tekken3.cc">Tekken 3</a>
Markdown Link: [Tekken 3](https://tekken3.cc)
BBCode Link: [url=https://tekken3.cc]Tekken 3[/url]
```

- [ ] **Step 5: Run and commit**

```bash
pnpm test
git add src/utils/comment-form.ts src/__tests__/comment-form.test.ts
git commit -m "feat: detect comment forms and link strategy"
```

### Task 4: Generate and Validate Campaign Comments

**Files:**
- Create: `/Users/coderlim/Projects/link-booster-extension/src/automation/campaign-comment.ts`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/campaign-comment.test.ts`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/background/messages/get-campaign-comment.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/utils/page-content.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/scripts/run-unit-tests.cjs`

- [ ] **Step 1: Test the structured prompt**

Assert the prompt:

- requires the page's language;
- requires 1–3 sentences;
- requests one exact `referencedDetail` copied from the article;
- requests one category from the approved 21-value enum;
- forbids invented experience and generic praise;
- forbids target name/URL for `UserName Link`;
- requires the exact formatted link for body-link modes.

- [ ] **Step 2: Define the model result**

```ts
export interface CampaignCommentResult {
  comment: string
  referencedDetail: string
  topicCategory: string
  language: string
}
```

Use JSON response mode with an explicit schema and `additionalProperties: false`.

- [ ] **Step 3: Implement deterministic validation**

`validateCampaignComment(result, pageText, inspection, targetSite)` must reject:

- empty or more than three sentences;
- a `referencedDetail` not found in normalized page text;
- a category outside the approved enum;
- a returned language that does not match the page language when the page declares one;
- target URL or target name in `UserName Link` comments;
- a missing exact body link for body-link modes.

It returns `{ valid: true }` or `{ valid: false, reason }`.

- [ ] **Step 4: Implement one regeneration**

First export `getPageContent(tabId)` from `page-content.ts` while retaining `getActivePageContent` for the manual tool. The message handler accepts `tabId`, inspection, and target snapshot, fetches that tab's page content, generates once, validates, and regenerates once with the first validation reason. A second failure returns `comment_quality_failed`.

- [ ] **Step 5: Run and commit**

```bash
pnpm test
git add src/automation/campaign-comment.ts src/background/messages/get-campaign-comment.ts src/__tests__/campaign-comment.test.ts src/utils/page-content.ts scripts/run-unit-tests.cjs
git commit -m "feat: generate validated campaign comments"
```

### Task 5: Consolidate Content-Script Form Actions

**Files:**
- Create: `/Users/coderlim/Projects/link-booster-extension/src/utils/comment-form-actions.ts`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/comment-form-actions.test.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/content.ts`
- Delete: `/Users/coderlim/Projects/link-booster-extension/src/content/fill-form.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/scripts/run-unit-tests.cjs`

- [ ] **Step 1: Test DOM actions**

Using linkedom fixtures, assert:

- inspection returns the same result as Task 3;
- fill writes name, email, Website URL, and comment and dispatches input/change events;
- body-link mode leaves Website URL untouched;
- missing required identity aborts before filling;
- submit clicks only the submit control inside the detected comment form;
- no contact, search, newsletter, or unrelated form is used.

- [ ] **Step 2: Implement pure actions**

Export:

```ts
inspect(document: Document): CommentPageInspection
fill(document: Document, payload: FillPayload): FillResult
submit(document: Document): SubmitResult
verify(document: Document, payload: VerifyPayload): VerificationResult
```

`verify` returns exactly one of `published`, `pending_moderation`, `explicit_reject`, or `not_visible_after_submit`; `published` requires both normalized comment text and the adjacent target link.

- [ ] **Step 3: Replace message handling**

Make `src/content.ts` handle:

```text
inspect-comment-page
fill-campaign-form
submit-campaign-comment
verify-campaign-comment
```

Keep one message listener and one selector implementation. Remove the duplicate `fillForm`/`fill-form` implementation.

- [ ] **Step 4: Run and commit**

```bash
pnpm test
pnpm build
git add src/content.ts src/utils/comment-form-actions.ts src/__tests__/comment-form-actions.test.ts scripts/run-unit-tests.cjs
git rm src/content/fill-form.ts
git commit -m "refactor: consolidate comment form actions"
```

### Task 6: Add the Dedicated Automation Tab Controller

**Files:**
- Create: `/Users/coderlim/Projects/link-booster-extension/src/automation/tab-controller.ts`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/tab-controller.test.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/background/messages/fill-comment-form.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/scripts/run-unit-tests.cjs`

- [ ] **Step 1: Generalize tab-targeted helpers**

Use the existing `getPageContent(tabId)` helper from Task 4 and make fill/inspect messages require a `tabId`. Do not query the currently active tab inside Campaign handlers.

- [ ] **Step 2: Test controller behavior with a Chrome API fake**

Assert:

- first Item creates one active tab;
- later Items update the same tab;
- navigation resolves only after `status === "complete"`;
- closing the tab returns a terminal controller error;
- tab ID is held only in memory and is not written to storage.

- [ ] **Step 3: Implement the controller**

Expose:

```ts
open(url: string): Promise<number>
getTabId(): number | null
close(): Promise<void>
```

Reject non-HTTP(S) URLs and use a finite 30-second load timeout.

- [ ] **Step 4: Run and commit**

```bash
pnpm test
git add src/automation/tab-controller.ts src/__tests__/tab-controller.test.ts src/background/messages/fill-comment-form.ts scripts/run-unit-tests.cjs
git commit -m "feat: reuse a dedicated campaign tab"
```

### Task 7: Build the Campaign Runner Side Panel

**Files:**
- Create: `/Users/coderlim/Projects/link-booster-extension/src/sidepanel/CampaignRunner.tsx`
- Create: `/Users/coderlim/Projects/link-booster-extension/src/sidepanel/ManualCommentTool.tsx`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/sidepanel/index.tsx`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/options/index.tsx`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/utils/constants.ts`

- [ ] **Step 1: Add automation connection settings**

Replace the local website-list settings with:

```text
LinkMaster Base URL
Automation API Token
Test Connection
```

Store them as `linkMasterBaseUrl` and `automationApiToken`. Keep model-provider settings. Remove hardcoded commenter names/emails and `DEFAULT_WEBSITES`.

- [ ] **Step 2: Split the existing Side Panel**

Move the existing summarize/plain-comment functionality into `ManualCommentTool.tsx`. Remove its website selector and link-embedding controls. Make `index.tsx` a compact tab switcher with `Campaign` as the default and `Manual` as the secondary view.

- [ ] **Step 3: Implement the Campaign state machine**

`CampaignRunner` performs:

```text
load active -> get next -> mark inspecting -> open tab -> inspect ->
generate/category -> fill -> mark awaiting_review ->
user submit -> mark submitted -> verify -> save terminal result -> next
```

Provide Start, Pause, Submit and Continue, Skip, and Cancel controls. Pause is local only. Disable every action while its request is pending.

- [ ] **Step 4: Render operational states**

Show target site, Item position, source URL, detected link type/rel/category, comment editor, form fields found, and the current error. Do not render passwords, `details`, GitHub data, or hidden model traces.

- [ ] **Step 5: Implement retry boundaries**

Retry page load, content extraction, generation, and GET once. Never retry the submit click. If result persistence fails, keep the current tab and result on screen and expose “Retry Save”; do not load the next Item.

- [ ] **Step 6: Build and manually inspect**

```bash
pnpm build
pnpm dev
```

Load `build/chrome-mv3-dev`. Check the Side Panel at its narrow default width: no text or buttons overlap, long URLs wrap, and Submit/Skip remain visible.

- [ ] **Step 7: Commit**

```bash
git add src/sidepanel src/options/index.tsx src/utils/constants.ts
git commit -m "feat: add supervised campaign runner"
```

### Task 8: Verify the Extension Executor

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run all automated checks**

```bash
pnpm test
pnpm build
pnpm package
```

Expected: all unit tests pass and Plasmo creates build/package artifacts.

- [ ] **Step 2: Run local fixtures in Chrome**

Serve fixture pages for:

```text
author website form
body HTML link form
moderation response
explicit rejection
silent rejection
unsupported form
```

Verify one dedicated tab is reused and every Item pauses before submission.

- [ ] **Step 3: Verify privacy boundaries**

Inspect network requests and extension storage. Confirm the extension receives only the current target snapshot, stores only LinkMaster URL/token and model settings, and sends no GitHub token, `details`, password, screenshot, or full HTML.

- [ ] **Step 4: Confirm the worktree is clean**

```bash
git status --short
```

Expected: no output. If verification exposed a defect, commit its exact files in the task where it was fixed before rerunning this step.
