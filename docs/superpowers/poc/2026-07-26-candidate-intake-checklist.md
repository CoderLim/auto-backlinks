# Candidate Intake Smoke Checklist

Validates staging import → Intake admit/reject → Automatic still uses
`backlinks.json` only.

## Build Locations

LinkMaster worktree:

```text
/Users/coderlim/Projects/link-master/.worktrees/feature/backlink-candidate-intake
```

Link Booster worktree:

```text
/Users/coderlim/Projects/link-booster-extension/.worktrees/feature/backlink-candidate-intake
```

## Automated Preflight

- [ ] LinkMaster candidate domain + store + import tests pass.
- [ ] Link Booster unit suite passes (includes intake-pass + API client).
- [ ] `data/json/backlink-candidates.json` exists (empty array OK).

## Import Staging

1. From LinkMaster worktree, run a small import (sim preferred):

```bash
node scripts/import-backlinks.js <domain> --source sim --limit 5
```

2. Confirm new rows appear only in `data/json/backlink-candidates.json`.
3. Confirm `data/json/backlinks.json` length is unchanged by that import.
4. Re-run the same import and confirm duplicates are skipped against both
   candidates and backlinks.

## Chrome Setup

1. Load the unpacked Link Booster build from the worktree (or `pnpm build` then
   load `build/chrome-mv3-dev` / prod as usual).
2. Options: LinkMaster Base URL + Automation API Token → Test Connection.
3. Open the side panel and confirm three tabs: Automatic | Manual | Intake.

## Intake Acceptance

- [ ] Start Intake with a non-empty staging pool.
- [ ] Newest candidate opens first (end-to-front).
- [ ] Page with comment + submit that accepts dummy fill is admitted:
  - removed from `backlink-candidates.json`
  - appended to `backlinks.json` with `link_type` / `link_rel` /
    `link_category` / `autoComment: ready`
  - no new `records.json` row
- [ ] Page without a fillable form is rejected (deleted from staging only).
- [ ] Login wall / captcha pages are rejected.
- [ ] Stop closes the automation tab without admit/reject of the in-flight
  page (unless already decided).
- [ ] Kill LinkMaster or use a bad token mid-run → error + Retry; candidate
  remains in staging until Retry succeeds.
- [ ] Pool exhaustion shows done / complete.

## Automatic Regression

- [ ] Automatic still requests `/api/automation/next` against `backlinks.json`
  only.
- [ ] Newly admitted backlinks can appear in Automatic after Intake.
- [ ] Intake never calls submit or `/api/automation/results/sync`.
