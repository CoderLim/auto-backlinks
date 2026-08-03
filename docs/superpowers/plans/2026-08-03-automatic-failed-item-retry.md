# Automatic Failed Item Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-aligned retry action that restarts the current failed Automatic item without fetching or appending another item.

**Architecture:** Keep retry orchestration inside `AutomaticRunner`, where the current item and connection identity already live. Add a pure execution-checklist transition that clears the failed display state before the existing `inspectAndPrepare` flow is called again, allowing state behavior to be tested independently.

**Tech Stack:** React 18, TypeScript, Plasmo, Tailwind CSS, Node test runner

---

### Task 1: Retry the Current Failed Automatic Item

**Files:**
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/automation/execution-checklist.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/execution-checklist.test.ts`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/sidepanel/AutomaticRunner.tsx`
- Modify: `/Users/coderlim/Projects/link-booster-extension/src/__tests__/automatic-runner-ui.test.ts`

- [ ] **Step 1: Write failing checklist-state and runner UI tests**

Add an execution-checklist test that creates a failed row and asserts that
`retryExecutionRow(rows, identity)` preserves the row identity and metadata,
sets `executionState` to `opened`, and clears `detectedStatus`, `failureReason`,
and `commentSummary`.

Add source-level runner assertions for all of the following:

```ts
assert.match(source, /const retryCurrentItem = async \(\) =>/)
assert.match(source, /setPendingOutcome\(null\)[\s\S]*retryExecutionRow/)
assert.match(
  source,
  /await inspectAndPrepare\(makeCurrentClient\(\), current, apiConnectionKey\)/
)
assert.match(source, /pendingOutcome\?\.status === "failed"[\s\S]*>\s*重试\s*</)
```

Also isolate the `retryCurrentItem` function body and assert it does not contain
`loadNext`, `getNextDirectItem`, or `addExecutionRow`.

- [ ] **Step 2: Run tests and verify the new behavior fails**

Run:

```bash
pnpm test
```

Expected: FAIL because `retryExecutionRow`, `retryCurrentItem`, and the retry
button do not exist.

- [ ] **Step 3: Implement the pure retry row transition**

Export this focused helper from `execution-checklist.ts`:

```ts
export const retryExecutionRow = (
  rows: ExecutionChecklistRow[],
  identity: ExecutionRowIdentity
) =>
  rows.map((row) =>
    matchesIdentity(row, identity)
      ? {
          ...row,
          executionState: "opened" as const,
          detectedStatus: undefined,
          failureReason: undefined,
          commentSummary: undefined
        }
      : row
  )
```

Use the module's existing private `matchesIdentity` helper so identity semantics
remain centralized.

- [ ] **Step 4: Implement retry orchestration in AutomaticRunner**

Import `retryExecutionRow`, then add a handler after `inspectAndPrepare`:

```ts
const retryCurrentItem = async () => {
  const current = context
  const apiConnectionKey = contextConnectionKeyRef.current
  if (
    busy ||
    !current ||
    pendingOutcome?.status !== "failed" ||
    !apiConnectionKey ||
    apiConnectionKey !== connectionKeyRef.current
  ) {
    return
  }

  setBusy(true)
  setError("")
  setPendingOutcome(null)
  setInspection(null)
  setGenerated(null)
  setComment("")
  setDirectoryManual(false)
  updateRows((rows) =>
    retryExecutionRow(rows, {
      connectionKey: apiConnectionKey,
      targetSite: current.targetSite,
      backlinkId: current.item.backlinkId
    })
  )
  await inspectAndPrepare(makeCurrentClient(), current, apiConnectionKey)
}
```

The handler deliberately reuses `inspectAndPrepare`; it must not call the next
item API or append an execution row.

- [ ] **Step 5: Render the right-aligned retry button**

Inside the existing red error banner, make the message span flex and render
this action only for the retryable failed outcome:

```tsx
<span className="min-w-0 flex-1 break-words">{error}</span>
{pendingOutcome?.status === "failed" && context ? (
  <button
    type="button"
    onClick={() => void retryCurrentItem()}
    disabled={busy}
    className="ml-auto flex shrink-0 items-center gap-1 border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">
    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
    重试
  </button>
) : null}
```

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
pnpm test
pnpm build
```

Expected: both commands exit 0 with no failed tests or TypeScript/build errors.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/automation/execution-checklist.ts \
  src/__tests__/execution-checklist.test.ts \
  src/sidepanel/AutomaticRunner.tsx \
  src/__tests__/automatic-runner-ui.test.ts
git commit -m "feat: retry failed automatic item"
```
