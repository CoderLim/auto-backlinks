# Automatic Comment Controls & Regenerate Design

Date: 2026-07-26

## Goal

In Automatic mode, always surface the generated comment after prepare, show
Manual-equivalent generation controls (length / embed link / link format), and
support regenerate → auto-fill — even when page inspect fails.

Primary codebase: `link-booster-extension`.

## Decisions

| Topic | Choice |
| --- | --- |
| Approach | Dual-track generation (Approach A) |
| Inspect failure | Do **not** auto-mark `cannot_submit`; still generate and enter `awaiting_review` |
| First generation (inspect OK) | `get-comment` `mode: "automatic"` with inspection placement |
| First generation (inspect fail) | Generate once with Manual placement `embedLink: false` (no body link) |
| Controls visibility | Always shown during prepare / `awaiting_review` |
| Inspect → controls | On inspect success, populate controls from `linkType` |
| Regenerate | Always read current controls → `mode: "manual"` → auto-fill |
| Link format options | Add **Text Link** (`"text"`) alongside html / markdown / bbcode |
| Login / unsupported form | Same soft path: still attempt generate + review UI (operator finishes via status buttons) |

## Inspect → control mapping

| Inspect `linkType` | 嵌入链接 | 链接格式 |
| --- | --- | --- |
| `UserName Link` | off | unchanged (hidden / ignored while embed off) |
| `Text Link` | on | `text` |
| `HTML Link` | on | `html` |
| `Markdown Link` | on | `markdown` |
| `BBCode Link` | on | `bbcode` |
| missing / unsupported | leave defaults (embed off for first-gen fail path) | — |

字数：inspect 不提供；保留操作员当前值（或既有默认）。

## Flow

```text
open tab → inspect → sync controls if supported
       → first generate (automatic | no-embed manual)
       → attempt fill
       → awaiting_review (comment + controls visible)
       → optional: regenerate (manual controls) → auto-fill
       → operator edits / status buttons / 提交并继续
```

### Failure handling

- Inspect `supported: false` or `requiresLogin`: still run first generate (no-embed
  manual), show comment + controls, try fill; fill errors surface as UI error but
  stay on review (do not force `cannot_submit` solely for inspect failure).
- Hard failures (tab/model/network): keep existing `failed` / outcome behavior.
- Fill failure after a successful generate: show error + comment; remain reviewable
  so regenerate/refill is possible.

## API / types

### `get-comment`

- AutomaticRunner chooses mode explicitly:
  - inspect OK → `mode: "automatic"` + inspection
  - inspect fail → `mode: "manual"`, `embedLink: false`, length from controls
- Do not silently coerce unsupported automatic bodies inside the handler.
- Manual `linkType` union becomes `"text" | "html" | "markdown" | "bbcode"`.
- `comment-generation` `manualBodyLinkType("text")` → `Text Link` / plain domain
  via existing `formatBodyLink(..., "Text Link")`.

### Manual UI

- Same dropdown gains Text Link for consistency (shared type; Manual tool updated).

## UI (AutomaticRunner)

- Always show: 字数、嵌入链接、链接格式（embed on 时显示格式下拉，含 Text）。
- Always show comment textarea once a comment exists (or while generating empty
  placeholder optional — minimum: show after first generate).
- Add **重新生成** on `awaiting_review`: uses controls, then auto-fill.
- Comment editable on `awaiting_review` (existing behavior).

## Out of scope

- Changing Automatic first-pass to always ignore inspection when controls differ
  (first pass still dual-track as above).
- Shared extracted `CommentControls` component (may inline first; extract later).
- Re-enabling Automatic comment quality validation.
- LinkMaster / auto-backlink server changes.

## Success criteria

1. Inspect fail (`link_placement_not_evidenced` etc.) still yields a visible
   comment and review UI.
2. Controls always visible; inspect success seeds embed/format.
3. Regenerate uses controls and auto-fills the page form.
4. Text Link available in Automatic + Manual format selects.
5. Existing inspect-success Automatic first path still works.
