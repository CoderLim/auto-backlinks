# Unified Comment Generation & Form Fill Design

Date: 2026-07-26

## Goal

Make Automatic and Manual share one comment-generation kernel and one form-fill
kernel, remove leftover Campaign naming/concepts from the executor path, and
stop Manual/Automatic from diverging on DOM fill (e.g. wpDiscuz + Quill pages
where Manual appears to work and Automatic does not).

Primary codebase: `link-booster-extension`.

## Decisions

| Topic | Choice |
| --- | --- |
| Unification shape | Shared kernels + dual orchestration (Approach 1) |
| Generation | Current `get-campaign-comment` capability becomes the only generator, exposed as `get-comment` |
| Manual UI controls | Keep length / embed-link / link-type; they remain effective in Manual |
| Link placement | Automatic: from page inspection. Manual: from sidebar controls |
| Fill identity | Both modes use target-site `name` / `email` / `domain` (Automatic’s current source) |
| Everything else | Prefer Manual’s UX/orchestration baseline where not overridden above |
| Campaign | Concept already retired; purge remaining campaign names/paths in this change |

## Architecture

### Shared kernels (single implementation)

- Form discovery / reveal / fill / submit / verify:
  `utils/comment-form.ts`, `utils/comment-form-actions.ts`
- Comment generation + validation:
  rename `automation/campaign-comment.ts` → `automation/comment-generation.ts`
  (or equivalent non-campaign name)
- Background messages:
  - One `get-comment` handler (absorbs today’s campaign generator; retires old
    `genComment`-based `get-comment`)
  - One `fill-comment-form` handler that always drives the shared `fill()` path
    (no `fillManualForm` / `fill-form` fork)

### Mode orchestration (different)

**Automatic**

1. Open page → inspect (with reveal).
2. If unsupported → stop (`cannot_submit` / reason); do not generate or fill.
3. `get-comment` with `mode: "automatic"` (`tabId`, `inspection`, `targetSite`).
4. `fill-comment-form` with `tabId` + target-site identity + comment.
5. Enter review / submit / verify as today.

**Manual**

1. Keep length / embed-link / link-type controls.
2. `get-comment` with `mode: "manual"` (controls + `targetSite`; link placement
   does **not** come from inspection).
3. User-triggered `fill-comment-form` (optional `tabId`, else active tab) using
   the same fill kernel and the same target-site identity fields.
4. Report real fill success/failure (no false `success: true`).

## Message contracts

### `get-comment`

```ts
// Automatic
{
  mode: "automatic"
  tabId: number
  inspection: FormInspection // must be supported with linkType
  targetSite: { name: string; domain: string; email: string }
}

// Manual
{
  mode: "manual"
  length: number
  embedLink: boolean
  linkType?: "html" | "markdown" | "bbcode"
  language?: string
  targetSite: { name: string; domain: string; email: string }
  tabId?: number // else active tab page content
}
```

Success response (unified shape):

```ts
{
  comment: string
  referencedDetail?: string
  topicCategory?: string
  language?: string
  translation?: string
}
```

Failure: `{ error: string }`.

Behavior:

- Automatic: existing validated generation; link instruction from `inspection.linkType`.
- Manual: same generation kernel (page-grounded comment + structured response).
  - `embedLink === false` → do not put target name/URL in the comment.
  - `embedLink === true` → embed using Manual `linkType`
    (`html` / `markdown` / `bbcode`; plain URL if needed as an explicit extra
    option later — not required now).
  - Honor `length`.
  - Do not require `inspection` or proven link placement.

### `fill-comment-form`

```ts
{
  tabId?: number // required for Automatic; optional for Manual → active tab
  name: string
  email: string
  website: string
  comment: string
}
```

- Content script uses only shared `fill()` (rename content action away from
  `fill-campaign-form` if touched).
- Delete `fillManualForm` and the `fill-form` action branch.
- Success: `{ success: true, result: { filledCount, ... } }`
- Failure: `{ success: false, error?: string, result?: { reason?: string } }`

Identity: both UIs pass target-site `name` / `email` / `domain`. Manual must not
pass `email: ""`.

## Shared fill behavior

- Always `revealCommentComposer` before locating controls.
- Prefer the visible editor when Quill/wpDiscuz is active (e.g. `.ql-editor` /
  contenteditable), and sync the underlying `textarea` when present.
- Skip website when no website control exists; fill website only when the form
  exposes a website/url control.
- **Critical:** shared `fill()` must **not** require `inspection.supported` or
  proven `linkType`. Those gates belong only to Automatic orchestration /
  Automatic `get-comment`. `fill()` fails only when:
  - required identity values are missing for fields that will be written
    (name/email/comment always; website only if a website control exists), or
  - no comment form controls can be found / nothing was written.
- Manual therefore can fill pages Automatic would skip after inspect.
- Automatic still refuses generate/fill at the runner when inspect is unsupported.

## Error handling

| Stage | Automatic | Manual |
| --- | --- | --- |
| Inspect unsupported | Stop before generate/fill | N/A (no inspect gate) |
| Generate | Surface `error`; stop item | Surface `error` in UI |
| Fill | `comment_form_fill_failed` / concrete `reason` | UI shows failure from real result |
| Missing identity | Fail generate/fill per required fields | Same identity source; empty email no longer special-cased |

## Cleanup scope

In scope:

- Remove old `genComment` `get-comment` path and `get-campaign-comment` message
  entry (logic lives under the new `get-comment`).
- Remove content `fillManualForm` / `fill-form` fork.
- Rename campaign-oriented generation module/types/tests used by this path.
- Drop Campaign as a primary UI/concept on the executor path; remove or fully
  disconnect leftover `CampaignRunner` if it has no side-panel entry.

Out of scope:

- LinkMaster API / queue protocol changes.
- Forcing Manual to inspect before generate.
- Removing Manual length / embed-link / link-type controls.

## Testing

- wpDiscuz page without website field + Quill: shared `fill()` writes the
  visible editor (and syncs textarea if any) for both modes.
- Classic WordPress author/email/url/comment form still fills correctly.
- `get-comment` automatic mode still requires supported inspection + linkType.
- `get-comment` manual mode: embedLink on/off, each linkType, length honored.
- `fill-comment-form` with and without `tabId`; Manual no longer reports success
  when nothing was filled.
- Shared `fill()` succeeds on a discoverable form even when link placement is
  not evidenced (Manual path); Automatic runner still blocks earlier on inspect.
- Automatic inspect failure never calls generate/fill.
- Missing target-site email fails according to identity rules (both modes use
  the same source).

## Non-goals

- Unifying summarize / translation UX beyond what generation already returns.
- Changing backlink queue selection or result sync contracts.
- Broad rewrite of Automatic review/submit/verify beyond using the shared fill
  and renamed generator.
