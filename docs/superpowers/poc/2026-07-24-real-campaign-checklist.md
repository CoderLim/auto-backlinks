# Supervised Campaign Checklist

Date prepared: 2026-07-24

This checklist separates Chrome acceptance from the first real 20-30 Item
Campaign. Do not submit an external comment until every preflight item is
checked.

## Current Gate

- [x] LinkMaster migration rehearsal passed on copied data.
- [x] LinkMaster API contract smoke passed.
- [x] LinkMaster test suite passed: 75 tests.
- [x] Link Booster test suite passed: 56 tests.
- [x] Link Booster production build and package passed.
- [ ] One target site has a non-empty name and valid email.
- [ ] Extension UI and content-script boundary passed in normal Chrome.
- [ ] A non-development automation token is configured.
- [ ] Production JSON backup and hashes are recorded.
- [ ] No active Campaign exists.

The first two unchecked items currently prevent a real Campaign.

## Build Locations

LinkMaster implementation:

```text
/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane
```

Chrome unpacked extension:

```text
/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/build/chrome-mv3-prod
```

Packaged extension:

```text
/Users/coderlim/Projects/link-booster-extension/.worktrees/auto-backlink-campaign-executor/build/chrome-mv3-prod.zip
```

Expected ZIP SHA-256:

```text
d035ac07aff6067e3fcecf494d30ec6ce258e3c22bc43b7f54a00d3ee329b24c
```

## Chrome Acceptance

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked and select the unpacked build directory above.
4. Open the extension's Details page and confirm the version is `0.0.3`.
5. Open Extension options.
6. Enter the running LinkMaster base URL and automation token.
7. Click Test Connection. With no active Campaign, a successful authenticated
   connection may report that no Campaign is active; an authentication error is
   not acceptable.
8. Pin or open Link Booster, then open its side panel.
9. Confirm Campaign is the primary tab and Manual remains available.
10. Resize the side panel narrow and wide. Text and controls must not overlap.

Do not use an automated browser instance that includes
`--disable-extensions`; it cannot validate this boundary.

## Target Site Identity

In LinkMaster, edit the selected site and verify:

- [ ] `name` is the website name and desired anchor text.
- [ ] `domain` is the exact normalized target URL, including a meaningful path
  such as `/yt-converter` when configured.
- [ ] `email` is valid.
- [ ] `tagline` is current.
- [ ] `description` is current.

When a publisher page has a Website URL field, the executor uses `name` in the
username field, `domain` in the Website URL field, and does not mention the
target in the comment body.

When no Website URL field exists, the executor adds the target to the body only
when existing comments or editor instructions prove a supported Text, HTML,
Markdown, or BBCode format.

## Token and Repository

- [ ] Generate a new automation token; do not reuse `test-token` or
  `dev-secret`.
- [ ] Configure the same token in LinkMaster and the extension options.
- [ ] Keep the JSON repository private.
- [ ] Confirm logs and screenshots do not contain the token.
- [ ] Confirm the bearer token cannot list or create Campaigns.
- [ ] Keep LinkMaster admin authentication separate from the bearer token.

## Back Up JSON

Before migration or Campaign creation, copy these files to a timestamped
directory outside all three repositories:

```text
data/json/backlinks.json
data/json/records.json
data/json/sites.json
data/json/campaigns.json
```

Record SHA-256 hashes here:

```text
backlinks.json:
records.json:
sites.json:
campaigns.json:
backup directory:
```

Stop if any source file is invalid JSON or any copied hash differs from its
source.

## Migration

1. Point `DATA_DIR` at a copy first.
2. Run the migration without `--write`.
3. Inspect counts and changed-object totals.
4. Run with `--write` only on the intended data directory.
5. Run the dry-run again; expect zero changed objects.
6. Build LinkMaster.

Stop if:

- a backlink or record ID disappears;
- `/yt-converter` or another configured target path changes;
- JSON parsing fails;
- a previously migrated `link_rel` is lost;
- site identity fields disappear.

## Create the Campaign

- [ ] LinkMaster reports no active Campaign.
- [ ] Select exactly one completed target site identity.
- [ ] Choose 20-30 Items.
- [ ] Confirm the generated fixed list contains no root URL.
- [ ] Confirm it contains no `inaccessible` or `unsubmittable` backlink.
- [ ] Confirm no duplicate backlink ID is present.
- [ ] Confirm no exact `(targetSite, backlinkId)` record already exists.
- [ ] Review the approximate 25% historical / 75% fresh mix.

The POC does not fetch new competitor backlinks. It uses LinkMaster's existing
backlink data.

## Run Under Supervision

For each Item:

1. Start or continue the Campaign in the side panel.
2. Wait for the dedicated tab to finish navigation.
3. Review the detected form, link type, link rel, and category.
4. Review every filled identity field and the 1-3 sentence comment.
5. If the page has a Website URL field, confirm the body contains no target
   mention.
6. If the target is in the body, confirm the format is proven by the page.
7. Click Submit and Continue once, or Skip.
8. Wait for LinkMaster to save the result before the next Item opens.

The executor does not solve CAPTCHA, bypass login, submit automatically, or
retry a mutation. A save error must leave the current result available for
Retry Save.

## Immediate Stop Conditions

Stop the Campaign without submitting the current Item when:

- the wrong target site or identity is filled;
- a contact, search, or newsletter form is selected;
- a comment is submitted without the user click;
- a PATCH or POST appears to retry automatically;
- an already processed Item is submitted again;
- the API reports authentication or version errors;
- GitHub JSON has a conflict or parse error;
- the target link format is unsupported;
- the dedicated tab opens a non-HTTP(S) URL.

For a silent rejection, record `silent_reject` and continue. Do not investigate
the publisher's root cause during POC.

## Complete and Audit

- [ ] Every Item is terminal.
- [ ] Complete the Campaign once.
- [ ] LinkMaster retains every Item result.
- [ ] Only `published` and `cannot_submit` appear in `records.json`.
- [ ] Explicit observed metadata overwrites `link_category`, `link_type`, and
  `link_rel`.
- [ ] `Unknown` values do not overwrite existing metadata.
- [ ] Repeating completion does not change backlinks or records.
- [ ] Manually audit every `published` result and at least five corrections.

Record counts and rates for accessibility, article extraction, form detection,
fill, manual review, published, moderation, silent rejection, explicit
rejection, cannot submit, skipped, failed, corrected metadata, and manual time
per Item.

## Database Decision

After the first Campaign, choose one:

```text
continue POC on GitHub JSON
move to Cloudflare D1 before expanding
stop and revise the detector/executor
```

Move to D1 before expanding when concurrent executors, durable task recovery,
high write frequency, conflict-free history, or operational querying becomes a
real requirement. Backlink volume alone is not the trigger.
