# Topic Category Confirmed Flag Design

Date: 2026-07-26

## Goal

Avoid re-running page-load topic-category LLM classification when a backlink’s
category has already been confirmed. Persist an explicit boolean on the
LinkMaster backlink so Automatic skips classify on later visits.

中文语义：**分类已确认**。

## Decisions

| Topic | Choice |
| --- | --- |
| Approach | Independent boolean on the backlink (Approach A) |
| Field (storage) | `topic_category_confirmed` |
| Field (API / extension) | `originalMetadata.topicCategoryConfirmed` |
| UI / docs label | 分类已确认 |
| Set `true` when | Final category is a valid approved non-`Unknown` value (LLM detect, operator edit, or sync payload) |
| Stay / set `false` when | Category remains `Unknown`, classify failed, or no confirmed category synced |
| Skip classify when | `topicCategoryConfirmed === true` |
| Legacy rows | Missing field: treat as confirmed if `link_category` is already a valid non-`Unknown` approved category; otherwise `false` |

## Behavior

### Claim / next-item

`GET` next direct item includes:

```json
"originalMetadata": {
  "topicCategory": "Technology",
  "topicCategoryConfirmed": true,
  "linkType": "UserName Link",
  "linkRel": "Nofollow"
}
```

Resolution for the boolean sent to the client:

1. If `topic_category_confirmed === true` → `true`
2. Else if field missing/undefined and `link_category` normalizes to approved non-`Unknown` → `true` (legacy soft default)
3. Else → `false`

### Extension AutomaticRunner

- Before calling `classify-topic-category`:
  - If `item.originalMetadata.topicCategoryConfirmed === true` → **do not** begin detection; keep proposed category as normalized original; no「识别中」.
  - Else → existing detect flow (识别中 → LLM → apply).
- Local checklist may still let the operator edit category; sync remains the persistence path for confirmation.

### Sync / saveDirectResults

When applying `observedMetadata.topicCategory` (or metadata-only updates):

- Normalize category with the same approved list used today.
- If normalized value is non-`Unknown` → write `link_category` **and** set `topic_category_confirmed: true`.
- If normalized value is `Unknown` → write `link_category` as `Unknown` if that is the update semantics today; **do not** set confirmed to `true`. Leave prior confirmed flag unchanged unless product later needs an explicit reset (out of scope: no operator「取消确认」in this change).

### Import / new backlinks

- New imports default `topic_category_confirmed: false` (and typically `link_category: Unknown`).

## Non-goals

- Re-classify UI to show「分类已确认」badge (optional later).
- Local-only URL cache without LinkMaster.
- Forcing re-classify when confirmed (no reset control in this change).
- Changing approved category enum lists.

## Success criteria

1. Confirmed backlinks skip `classify-topic-category` and never show「识别中」for that reason.
2. First-time / unconfirmed backlinks still classify as today.
3. After syncing a valid non-Unknown category, the next claim reports `topicCategoryConfirmed: true`.
4. Legacy rows with a real `link_category` behave as confirmed without a bulk migration script.
5. Contracts document the new metadata field.

## Primary codebases

- `link-master` — backlink JSON shape, next-item payload, saveDirectResults
- `link-booster-extension` — `DirectItem` types, skip detect gate
- `auto-backlink` — `contracts/automation-api-v1.md` + this spec
