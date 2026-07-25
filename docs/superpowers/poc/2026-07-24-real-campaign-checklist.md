# Direct Backlink Processing Checklist

This checklist validates the v1 records-driven flow. It does not create a
Campaign or choose an Item count.

## Build Locations

LinkMaster:

```text
/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane
```

Unpacked Link Booster extension:

```text
/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/build/chrome-mv3-prod
```

Packaged extension:

```text
/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/build/chrome-mv3-prod.zip
```

Expected ZIP SHA-256:

```text
99c73cf49351e539e1f4fce7ce024eb28421fe582bb9be7972fb12f9f63ac237
```

## Automated Preflight

- [x] LinkMaster direct-processing domain and store tests pass.
- [x] LinkMaster full suite passes: 122 tests.
- [x] LinkMaster production build exits zero.
- [x] Link Booster full suite passes: 76 tests.
- [x] Link Booster TypeScript and production build pass.
- [x] Link Booster package and ZIP integrity checks pass.
- [x] Runtime `data/json/*.json` files are not committed.
- [x] Target listing exposes only `name` and `domain`.
- [x] Direct results save before the extension requests the next backlink.
- [x] Save failure blocks Start, Stop, and next advancement until Retry Save.

The LinkMaster build continues to print its existing `/api/statistics` dynamic
server usage diagnostic and exits with status zero.

## Chrome Setup

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Reload the existing Link Booster entry or load the unpacked directory above.
4. Open the Link Booster options page.
5. Set LinkMaster Base URL to `http://localhost:3000`.
6. Set the configured Automation API Token.
7. Click Test Connection.
8. Confirm the response reports at least one usable target website.
9. Open the Link Booster side panel.
10. Confirm Automatic is the primary tab and Manual remains available.

## Direct Processing Acceptance

- [ ] Select the target website. With one usable site it is preselected.
- [ ] Click Start without creating a Campaign or entering an Item count.
- [ ] Confirm the extension opens one non-root backlink page.
- [ ] On a supported form, confirm it scrolls to the form and fills name, email,
  website when present, and comment.
- [ ] Confirm the side panel waits for Submit and Continue.
- [ ] Submit one test comment and confirm LinkMaster immediately writes a record
  before the next page opens.
- [ ] Confirm the saved record includes target site, backlink ID, URL, terminal
  status, generated comment, timestamps, and observed metadata when available.
- [ ] Confirm explicit observed metadata immediately overwrites
  `link_category`, `link_type`, and `link_rel`.
- [ ] On Skip, confirm a `skipped` record is written before the next page opens.
- [ ] On no form/login/CAPTCHA, confirm a terminal record is written and the
  extension continues.
- [ ] Confirm the next request does not return any backlink that already has the
  same normalized `(targetSite, backlinkId)` record.
- [ ] Confirm Stop closes the automation tab without a LinkMaster mutation.
- [ ] Confirm exhaustion shows processing complete.

## Save Failure Acceptance

Use a temporarily invalid LinkMaster URL or token only after a result is ready
to save:

- [ ] The current terminal result stays visible.
- [ ] The extension shows Retry Save.
- [ ] Start, Stop, and next advancement cannot discard the unsaved result.
- [ ] Changing connection settings does not replace the save-failed state.
- [ ] Restoring valid settings and clicking Retry Save persists the original
  result and only then opens the next backlink.

## Reload Semantics

V1 has no in-flight recovery:

- [ ] Reloading before a terminal result is saved may return the same first
  unrecorded backlink.
- [ ] Reloading after a result is saved skips that backlink because the record
  exists.

## Data Safety

Before a real submission, keep an external backup of:

```text
data/json/backlinks.json
data/json/records.json
data/json/sites.json
data/json/campaigns.json
```

Campaign data is legacy history only. The direct flow must not create, patch,
complete, or cancel a Campaign.
