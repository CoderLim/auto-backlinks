# Unsupervised Auto Mode Design

Date: 2026-07-25

> **Status:** Removed from the Automatic side panel (2026-07-25). The unsupervised
> **自动** control and auto-run loop are not shipping; keep this note for future
> revival. Manual **开始** + status actions (including **跳过** → `deferred`) remain.

## Goal

Add an **自动** control next to **跳过** that runs the queue without waiting for
operator confirmation on each item.

## UI

Status action row (wrap):

`已发布 | 不能发布 | 不适合当前站 | 跳过 | 自动`

Button label cycles:

- idle / off → **自动**
- auto running → **暂停**
- auto paused → **继续**

Do **not** place this control beside **开始**. **开始** remains the supervised
confirmation-first path.

When there is no current row, still show the action row with only **自动**
enabled (the four status marks stay hidden or disabled).

## Behavior

### Start / continue auto

1. Clear pause flag, set auto mode running.
2. If no current item, `loadNext`.
3. If a current item is already open in a supervised waiting state, treat it
   under auto rules from that point (see below).

### Per item

After inspect:

- If `supported && !requiresLogin && !hasCaptcha`: generate comment (if needed), fill, submit,
  verify, write the verification terminal status into the local checklist
  (`published` / `pending_moderation` / `not_visible_after_submit` / `explicit_reject` /
  `failed`), then advance.
- Otherwise: mark **`deferred`** on the checklist row, clear current, advance.
  This includes visible CAPTCHA / reCAPTCHA / hCaptcha challenges
  (`hasCaptcha`).

Do not call `awaitOperatorOutcome` / wait for **提交并继续** while auto is
running.

### Pause / continue

- **暂停**: set paused; finish the in-flight item if one is mid submit/verify,
  then stop before opening the next item (reuse existing `pausedRef` /
  `finishLocally` pause gate).
- **继续**: clear pause, resume auto loop with `loadNext` (or continue current
  if still open and auto-eligible).

### Sync

No automatic Sync. Operator uses **同步到 LinkMaster** as today.

### Stop conditions

- Queue empty → phase `completed`, leave auto mode off/paused.
- Local unsynced cap (100) → pause with existing message.
- Connection change / errors → pause or error as today; leave auto mode paused.
