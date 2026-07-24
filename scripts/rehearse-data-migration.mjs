import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  execFileSync
} from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const linkmasterDir = process.env.LINKMASTER_DIR?.trim()
const legacyRef = process.env.LINKMASTER_LEGACY_REF?.trim()

if (!linkmasterDir || !legacyRef) {
  console.error(
    "LINKMASTER_DIR and LINKMASTER_LEGACY_REF are required"
  )
  process.exit(1)
}

const resolvedLinkmasterDir = path.resolve(linkmasterDir)
const migrationScript = path.join(
  resolvedLinkmasterDir,
  "scripts/migrate-automation-data.js"
)

assert.ok(fs.existsSync(migrationScript), "Migration script not found")

const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "auto-backlink-migration-rehearsal-")
)
const backupDir = path.join(tempDir, "backup")
const dataFiles = ["backlinks.json", "records.json", "sites.json"]

for (const fileName of dataFiles) {
  const content = execFileSync(
    "git",
    ["show", `${legacyRef}:data/json/${fileName}`],
    {
      cwd: resolvedLinkmasterDir,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024
    }
  )
  JSON.parse(content)
  fs.writeFileSync(path.join(tempDir, fileName), content, "utf8")
}

fs.writeFileSync(path.join(tempDir, "campaigns.json"), "[]\n", "utf8")

const readJson = (name) =>
  JSON.parse(fs.readFileSync(path.join(tempDir, name), "utf8"))
const hash = (value) =>
  createHash("sha256").update(value).digest("hex")
const ids = (values) => values.map(({ id }) => id)

const before = {
  backlinks: readJson("backlinks.json"),
  records: readJson("records.json"),
  sites: readJson("sites.json")
}

const migrationEnv = {
  ...process.env,
  DATA_DIR: tempDir,
  MIGRATION_BACKUP_DIR: backupDir
}
const dryRunOutput = execFileSync(process.execPath, [migrationScript], {
  cwd: resolvedLinkmasterDir,
  env: migrationEnv,
  encoding: "utf8"
}).trim()
const writeOutput = execFileSync(
  process.execPath,
  [migrationScript, "--write"],
  {
    cwd: resolvedLinkmasterDir,
    env: migrationEnv,
    encoding: "utf8"
  }
).trim()

const after = {
  backlinks: readJson("backlinks.json"),
  records: readJson("records.json"),
  sites: readJson("sites.json")
}

assert.deepEqual(ids(after.backlinks), ids(before.backlinks))
assert.deepEqual(ids(after.records), ids(before.records))
assert.equal(after.sites.length, before.sites.length)

const afterBacklinksById = new Map(
  after.backlinks.map((backlink) => [backlink.id, backlink])
)
let placementExact = 0
let placementCanonicalized = 0
let placementMismatches = 0
let relationMismatches = 0

for (const backlink of before.backlinks) {
  const migrated = afterBacklinksById.get(backlink.id)

  if (migrated.link_type === backlink.type) {
    placementExact += 1
  } else if (
    backlink.type === "bbcode Link" &&
    migrated.link_type === "BBCode Link"
  ) {
    placementCanonicalized += 1
  } else {
    placementMismatches += 1
  }

  if (migrated.link_rel !== backlink.link_type) {
    relationMismatches += 1
  }

  assert.equal(Object.hasOwn(migrated, "type"), false)
}

assert.equal(placementMismatches, 0)
assert.equal(relationMismatches, 0)

const normalizedPathSites = after.sites.filter((site) => {
  try {
    return new URL(site.domain).pathname === "/yt-converter"
  } catch {
    return false
  }
})
assert.ok(
  normalizedPathSites.some(
    ({ domain }) =>
      domain === "https://limbuilder.github.io/yt-converter"
  ),
  "The /yt-converter site path must be preserved"
)

for (const site of after.sites) {
  for (const field of [
    "name",
    "domain",
    "email",
    "tagline",
    "description"
  ]) {
    assert.equal(
      typeof site[field],
      "string",
      `Site identity field ${field} must exist`
    )
  }
}

const summary = {
  tempDir,
  legacyRef,
  migration: {
    dryRunOutput: dryRunOutput.split("\n"),
    writeOutput: writeOutput.split("\n"),
    countsBefore: {
      backlinks: before.backlinks.length,
      records: before.records.length,
      sites: before.sites.length
    },
    countsAfter: {
      backlinks: after.backlinks.length,
      records: after.records.length,
      sites: after.sites.length
    },
    lostBacklinkIds: 0,
    lostRecordIds: 0,
    placementExact,
    placementCanonicalized,
    placementMismatches,
    relationMismatches,
    preservedPathSites: normalizedPathSites.map(({ domain }) => domain),
    incompleteSiteIdentities: after.sites.filter(
      ({ name, email }) => !name || !email
    ).length,
    fileHashesAfter: Object.fromEntries(
      dataFiles.map((fileName) => [
        fileName,
        hash(fs.readFileSync(path.join(tempDir, fileName)))
      ])
    )
  }
}

console.log(JSON.stringify(summary, null, 2))
