# Direct Backlink Processing Checklist

This checklist validates the v1 records-driven flow. It does not create a
Campaign or choose an Item count.

## Build Locations

LinkMaster:

```text
/Users/coderlim/Projects/link-master
```

Unpacked Link Booster extension:

```text
/Users/coderlim/Projects/link-booster-extension/build/chrome-mv3-prod
```

Packaged extension:

```text
/Users/coderlim/Projects/link-booster-extension/build/chrome-mv3-prod.zip
```

The ZIP SHA-256 is generated during the final package verification.

## Automated Preflight

- [x] LinkMaster direct-processing domain and store tests pass.
- [x] LinkMaster full suite passes: 149 tests.
- [x] LinkMaster production build exits zero.
- [x] Link Booster full suite passes: 82 tests.
- [x] Link Booster TypeScript and production build pass.
- [x] Link Booster package and ZIP integrity checks pass.
- [x] Runtime `data/json/*.json` files are not committed.
- [x] Target listing exposes only `name` and `domain`.
- [x] Terminal results stay in a local execution list until explicit Sync.
- [x] Batch synchronization validates the full list before it writes records or
  metadata.

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
- [ ] Confirm every opened backlink gets one visible execution-list row with
  URL, execution status, terminal result, comment, original metadata, proposed
  metadata, and sync state.
- [ ] Confirm a terminal result or Skip opens the next backlink without writing
  `records.json`.
- [ ] Edit proposed metadata in the execution list and confirm its original to
  proposed value remains visible.
- [ ] Confirm the next request excludes already-opened local rows for the same
  target, as well as persisted records.
- [ ] Click Sync to LinkMaster and confirm the resulting records include target
  site, backlink ID, URL, terminal status, generated comment, and timestamps.
- [ ] Confirm explicit reviewed metadata overwrites `link_category`,
  `link_type`, and `link_rel` only after successful Sync.
- [ ] Confirm Stop closes the automation tab without a LinkMaster mutation.
- [ ] Confirm exhaustion shows processing complete.

## Sync Failure Acceptance

Use a temporarily invalid LinkMaster URL or token after terminal rows exist:

- [ ] Every terminal result stays visible and is marked sync failed.
- [ ] The extension shows Retry Sync.
- [ ] Processing can continue without discarding any unsynchronized result.
- [ ] Restoring valid settings and clicking Retry Sync persists exactly the
  reviewed rows and marks them synced.

## Reload Semantics

V1 has no in-flight recovery:

- [ ] Reloading before synchronization may return the same first
  unrecorded backlink.
- [ ] Reloading after successful synchronization skips that backlink because the record
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
