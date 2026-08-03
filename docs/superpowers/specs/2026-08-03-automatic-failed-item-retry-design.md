# Automatic Failed Item Retry

## Goal

Allow an operator to retry the current Automatic-mode backlink after page
loading times out or processing fails, without creating a duplicate execution
checklist row or advancing to another backlink.

## Interface

When Automatic mode has a current failed outcome and displays its red error
banner, the banner shows a **重试** button aligned on the right. The error icon
and message retain the remaining width and wrap when necessary.

The button is visible only while the failed current item is waiting for an
operator outcome. It is not shown for connection errors, validation messages,
comment-editing errors, sync errors, or failures that no longer have a current
item to retry.

While retrying, the button is disabled and uses the existing loading treatment
so repeated clicks cannot start concurrent attempts.

## Retry Behavior

Clicking **重试** clears the current error and pending failed outcome, then
restarts preparation for the same `DirectItemContext` from the page-opening
step. The retry uses the same API connection and the same execution checklist
row. It does not request another item and does not append a second row.

The normal preparation flow then opens the URL, handles directory items, checks
the comment page, generates the comment, and fills the form as applicable.
Existing internal one-time retries remain unchanged.

If the new attempt succeeds, the row proceeds to the existing review state. If
it fails, the latest failure reason replaces the previous one and the operator
can retry again or choose an existing manual result action.

## State and Error Handling

Retry is allowed only when all of the following are true:

- a current item context exists;
- a failed `pendingOutcome` exists;
- the runner is not busy;
- the connection associated with the current item still matches the active
  LinkMaster connection.

If those conditions are not satisfied, the retry action is unavailable. The
existing target change and connection reset behavior continues to clear stale
current-item state.

## Testing

Add focused regression coverage that verifies:

- the error banner renders a right-aligned **重试** action for a failed pending
  outcome;
- the retry handler clears the failed outcome and calls the existing
  preparation flow with the current item and connection;
- the handler does not fetch a new item or add a checklist row;
- the action is guarded while busy or when retry context is absent.

Run the complete extension unit test suite and production build.
