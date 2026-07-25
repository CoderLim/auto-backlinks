# Confirmation-First Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require operator confirmation before advancing, allow in-progress metadata edits including `autoComment`, and gate sync selection on reviewed changes.

**Architecture:** LinkMaster accepts and persists `autoComment` on backlinks via sync. The extension checklist owns selectability rules and editable proposed values; AutomaticRunner stops on non-automatic paths until confirm, then advances.

**Tech Stack:** LinkMaster Node/Vitest JSON store; Plasmo extension React + node:test.

---

### Task 1: LinkMaster autoComment metadata

**Files:**
- Modify: `link-master/.../src/lib/automation/direct-processing.js`
- Modify: `link-master/.../src/lib/automation/direct-processing-store.js`
- Modify: `link-master/.../src/app/api/automation/results/sync/route.js` (error codes if needed)
- Test: `direct-processing.test.js`, `direct-processing-store.test.js`

- [ ] **Step 1:** Add failing tests for `autoComment` validation, apply, next snapshot
- [ ] **Step 2:** Implement `AUTO_COMMENT_VALUES`, validate, `applyDirectMetadata`, next `originalMetadata`
- [ ] **Step 3:** Run tests; commit

### Task 2: Extension checklist selectability + autoComment

**Files:**
- Modify: `link-booster-extension/.../src/automation/types.ts`
- Modify: `link-booster-extension/.../src/automation/execution-checklist.ts`
- Test: `src/__tests__/execution-checklist.test.ts`

- [ ] **Step 1:** Failing tests for selectable gating, disabled reasons, edit terminal status, default selected
- [ ] **Step 2:** Implement helpers + wire into add/complete/edit
- [ ] **Step 3:** Run tests; commit

### Task 3: AutomaticRunner confirmation-first UI/flow

**Files:**
- Modify: `link-booster-extension/.../src/sidepanel/AutomaticRunner.tsx`

- [ ] **Step 1:** Non-form path awaits confirmation (no auto `finishLocally`→`loadNext`)
- [ ] **Step 2:** In-progress editable metadata + autoComment + terminal status select
- [ ] **Step 3:** Checkbox disabled titles from checklist helpers
- [ ] **Step 4:** Smoke-relevant unit tests still pass; commit

### Task 4: Docs touch-up

- [ ] Note acceptance in poc checklist if needed; commit
