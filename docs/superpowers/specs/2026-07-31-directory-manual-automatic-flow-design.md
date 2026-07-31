# Directory Manual Flow in Automatic Mode

## Goal

When Link Booster Automatic mode receives a backlink whose effective
`link_type` is `directory`, open the backlink page and leave the item for
manual handling. Directory items do not use the comment workflow or automatic
submission verification.

## Behavior

Automatic mode continues to request the item, create its execution checklist
row, and open its URL. After the page opens, it reads the effective link type
from the checklist row, falling back to the item's original metadata.

If that link type is `directory`, Automatic mode immediately enters its
existing review state without sending any of these actions:

- `inspect-comment-page`
- `get-comment`
- `fill-comment-form`
- `submit-campaign-comment`
- `verify-campaign-comment`

The comment controls and **提交并继续** action are hidden for a directory item.
The existing manual result actions remain available:

- 已发布
- 不能发布
- 不适合当前站
- 跳过

Selecting one of those outcomes records the result locally and advances using
the existing flow.

## Checklist Editing

Directory items use the same execution checklist row as every other item.
Metadata editing and the full LinkMaster-compatible Backlink editor remain
available and unchanged.

The branch uses the row's proposed `linkType` when available. This means a type
correction made before preparation is respected; otherwise the original
metadata determines the flow. Editing the type after the page has already
entered manual review does not restart preparation.

## Non-directory Compatibility

All non-directory link types retain the existing behavior: inspect the comment
form, generate and fill a comment, wait for review, submit, and verify.

## Error Handling

Failure to open a directory URL follows the existing failed-item operator
review path. Once the page has opened, directory processing requires no form or
AI capability, so missing forms, login prompts detected by comment inspection,
and comment-generation failures cannot block it.

## Testing

Add a focused, testable flow-decision helper and cover both outcomes:

- effective `directory` selects manual handling;
- all other link types select the comment workflow.

Add an AutomaticRunner regression assertion that the directory branch occurs
after opening the page and before inspection/generation, and that it enters the
existing review state. Run the full extension unit suite and production build.
