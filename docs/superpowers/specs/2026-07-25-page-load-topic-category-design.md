# Page-load topic category detection

## Goal

After a campaign page finishes loading and page text can be extracted, automatically classify the page industry into `topicCategory` (→ `link_category` on sync). Do not wait for comment generation.

## Behavior

1. Trigger: after navigation completes and page text extraction succeeds (same extract path used for comment generation).
2. Classifier: small LLM call that returns exactly one value from `APPROVED_TOPIC_CATEGORIES`, or falls back to `Unknown` on failure / empty text.
3. Checklist UI: while classification is in flight for a row, the category column shows **识别中** (not editable). When done, show the detected value (still editable).
4. Manual override always wins after detection completes.
5. Comment generation may still return `topicCategory`; if the operator has not manually edited category, prefer the page-load result already on the row unless comment gen returns a different valid value—**keep page-load result** and ignore comment-gen category when page-load already set a non-Unknown value. If page-load is Unknown, allow comment-gen to fill it.
6. No page text → skip classification, leave proposed category as normalized original (or Unknown); do not show 识别中 indefinitely.

## Non-goals

- Detecting placement type (Blog/Forum) in this change.
- Changing LinkMaster enum validation.
- Blocking fill/submit on classification; classification runs in parallel with inspect/fill when possible, but UI shows 识别中 until settled.

## Implementation sketch

- New helper: `classifyTopicCategory(pageText)` + validation against approved list.
- `ExecutionChecklistRow` gains optional `topicCategoryState: "idle" | "detecting" | "detected" | "failed"`.
- `AutomaticRunner`: after open + extract page text, set detecting → classify → `editProposedMetadata` with result.
- Category `<select>` replaced by 识别中 text when `topicCategoryState === "detecting"`.
