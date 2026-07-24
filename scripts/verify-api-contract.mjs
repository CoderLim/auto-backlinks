import assert from "node:assert/strict"

const forbiddenKeys = new Set([
  "details",
  "password",
  "githubToken",
  "github_token",
  "screenshot",
  "html"
])

const baseUrlInput = process.env.LINKMASTER_BASE_URL?.trim()
const token = process.env.AUTOMATION_API_TOKEN?.trim()

if (!baseUrlInput) {
  console.error("LINKMASTER_BASE_URL is required")
  process.exit(1)
}

if (!token) {
  console.error("AUTOMATION_API_TOKEN is required")
  process.exit(1)
}

let baseUrl

try {
  const parsed = new URL(baseUrlInput)
  assert.ok(
    parsed.protocol === "http:" || parsed.protocol === "https:",
    "LINKMASTER_BASE_URL must use HTTP or HTTPS"
  )
  baseUrl = parsed.toString().replace(/\/+$/, "")
} catch (error) {
  console.error(`Invalid LINKMASTER_BASE_URL: ${error.message}`)
  process.exit(1)
}

const assertNoForbiddenKeys = (value, path = "$") => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoForbiddenKeys(entry, `${path}[${index}]`)
    )
    return
  }

  if (!value || typeof value !== "object") {
    return
  }

  for (const [key, entry] of Object.entries(value)) {
    assert.ok(!forbiddenKeys.has(key), `Forbidden key ${path}.${key}`)
    assertNoForbiddenKeys(entry, `${path}.${key}`)
  }
}

const assertTargetSnapshot = (snapshot) => {
  assert.equal(typeof snapshot, "object")
  assert.ok(snapshot)
  assert.equal(typeof snapshot.name, "string")
  assert.ok(snapshot.name.length > 0)
  assert.equal(typeof snapshot.domain, "string")
  assert.match(snapshot.domain, /^https?:\/\//)
  assert.equal(typeof snapshot.email, "string")
  assert.ok(snapshot.email.length > 0)
}

const assertItem = (item) => {
  assert.equal(typeof item, "object")
  assert.ok(item)
  assert.equal(typeof item.itemId, "string")
  assert.ok(item.itemId.length > 0)
  assert.equal(typeof item.backlinkId, "string")
  assert.ok(item.backlinkId.length > 0)
  assert.equal(typeof item.url, "string")
  assert.match(item.url, /^https?:\/\//)
  assert.ok(Number.isInteger(item.order) && item.order > 0)
  assert.equal(typeof item.status, "string")
}

const get = async (path) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    }
  })

  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get("content-type") ?? ""
  assert.match(contentType, /^application\/json\b/)
  const payload = await response.json()

  assert.equal(
    response.ok,
    true,
    `GET ${path} failed: ${payload.error?.code ?? response.status}`
  )
  assert.equal(payload.apiVersion, 1)
  assert.ok(Object.hasOwn(payload, "data"))
  assertNoForbiddenKeys(payload)
  return payload.data
}

const campaign = await get("/api/automation/campaigns/active")

if (!campaign) {
  console.log("PASS: no active Campaign")
  process.exit(0)
}

assert.equal(campaign.schemaVersion, 1)
assert.equal(campaign.status, "active")
assert.equal(typeof campaign.campaignId, "string")
assert.ok(campaign.campaignId.length > 0)
assert.equal(typeof campaign.targetSite, "string")
assertTargetSnapshot(campaign.targetSiteSnapshot)
assert.ok(Array.isArray(campaign.items))
campaign.items.forEach(assertItem)

const next = await get(
  `/api/automation/campaigns/${encodeURIComponent(campaign.campaignId)}/next`
)

if (!next) {
  console.log(
    `PASS: Campaign ${campaign.campaignId} has no pending Item`
  )
  process.exit(0)
}

assert.equal(next.campaignId, campaign.campaignId)
assert.equal(next.targetSite, campaign.targetSite)
assert.deepEqual(next.targetSiteSnapshot, campaign.targetSiteSnapshot)
assertItem(next.item)
assert.equal(next.item.status, "pending")
assert.ok(
  campaign.items.some(
    (item) =>
      item.itemId === next.item.itemId &&
      item.backlinkId === next.item.backlinkId
  )
)

console.log(
  `PASS: validated Campaign ${campaign.campaignId}, Item ${next.item.itemId}`
)
