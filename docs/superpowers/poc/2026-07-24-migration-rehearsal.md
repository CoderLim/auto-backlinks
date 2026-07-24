# Automation Migration Rehearsal

Date: 2026-07-24

## Decision

Proceed with the POC implementation. The migration and completion rules passed
their isolated checks. Do not create a real Campaign yet: all seven current
target sites are missing either `name` or `email`, so at least one site identity
must be completed first.

No production JSON file was modified during this rehearsal.

## Scope

- LinkMaster worktree:
  `/Users/coderlim/Projects/link-master/.worktrees/auto-backlink-campaign-control-plane`
- Legacy source: Git object `d407ac6^`
- Temporary copy:
  `/var/folders/r0/147ds8hj5x96t_c8dtx4y0840000gn/T/auto-backlink-migration-rehearsal-SuP9iq`
- Migration input: copied `backlinks.json`, `records.json`, and `sites.json`
- Campaign completion: LinkMaster's real archive and Campaign store functions,
  exercised by Vitest

The migration script now accepts `DATA_DIR`, which makes an isolated write
rehearsal possible:

```bash
LINKMASTER_DIR=/path/to/link-master \
LINKMASTER_LEGACY_REF='d407ac6^' \
node scripts/rehearse-data-migration.mjs
```

## Migration Results

Dry-run changes:

| File | Changed | Total |
| --- | ---: | ---: |
| `backlinks.json` | 2561 | 2561 |
| `records.json` | 138 | 179 |
| `sites.json` | 7 | 7 |

Counts after `--write`:

| Object | Before | After | Lost IDs |
| --- | ---: | ---: | ---: |
| Backlinks | 2561 | 2561 | 0 |
| Records | 179 | 179 | 0 |
| Sites | 7 | 7 | not applicable |

Field checks:

- 2559 legacy `type` values copied exactly to `link_type`.
- 2 legacy `bbcode Link` values were intentionally canonicalized to
  `BBCode Link`.
- 0 placement mismatches remained.
- 0 legacy `link_type` to new `link_rel` mismatches remained.
- Every migrated backlink dropped the legacy `type` key.
- Every site has string fields for `name`, `domain`, `email`, `tagline`, and
  `description`.
- `https://limbuilder.github.io/yt-converter` retained its path.
- All 7 sites still have an incomplete execution identity (`name` or `email`).

A second dry run against the migrated copy reported:

```text
backlinks.json: 0 of 2561 objects would change
records.json: 0 of 179 objects would change
sites.json: 0 of 7 objects would change
```

This establishes migration idempotency for the production-shaped legacy
snapshot.

## Migrated File Hashes

SHA-256 after migration:

```text
backlinks.json abfce4bd960ac70d1fc0cba5ea554d8be22c80833dd8689774aed995b7f128a5
records.json   745d0d7d7a537b846744810adecb523ac66f3611b051ba22efa237b7ad26ab15
sites.json     d817db9fe1dc206df0b151421996342a67231767402aa2eab0671a6c5458e79c
```

The migration backup was written under the temporary rehearsal directory, not
inside either Git repository.

## Completion Results

Command:

```bash
pnpm test -- \
  src/lib/automation/archive.test.js \
  src/lib/automation/campaign-store.test.js
```

The LinkMaster suite ran 7 test files and 75 tests with 0 failures. Its
synthetic Campaign includes `published`, `cannot_submit`, `silent_reject`, and
`pending_moderation` outcomes and verifies:

- only `published` and `cannot_submit` create or update records;
- `silent_reject` remains a Campaign result but is not archived;
- explicit `topicCategory`, `linkType`, and `linkRel` overwrite their matching
  backlink fields;
- `Unknown` values leave existing metadata unchanged;
- applying metadata correction twice is equivalent to applying it once;
- archiving twice produces byte-equivalent structured data;
- store-level completion is idempotent and does not duplicate records.

The API completion smoke run from the LinkMaster phase additionally completed a
20-Item Campaign with 1 `published`, 1 `cannot_submit`, and 18 `skipped` Items.
Backlinks and records were unchanged before completion, then exactly two
records were archived on completion.

## Failures Encountered

1. The first history extraction exceeded Node's default `execFileSync` buffer.
   The rehearsal tool now uses a 16 MiB limit and the full snapshot loads.
2. A direct bare-Node import of LinkMaster's ESM archive module failed because
   the module relies on Next/Vitest extension resolution. The completion check
   was moved to LinkMaster's actual Vitest runtime rather than copying the
   production functions into the evidence repository.
3. The first Vitest attempt was blocked by the filesystem sandbox while Vite
   created a temporary config file. Re-running with the approved repository
   write permission passed all 75 tests.

None of these failures wrote to production data.

## Proceed Conditions

Before a real Campaign:

1. Fill a valid `name` and `email` for the selected target site.
2. Run migration dry-run against a fresh backup and expect 0 changes if the
   deployed data already matches this branch.
3. Confirm `campaigns.json` contains no active Campaign.
4. Keep the four production JSON files backed up outside the repositories.
