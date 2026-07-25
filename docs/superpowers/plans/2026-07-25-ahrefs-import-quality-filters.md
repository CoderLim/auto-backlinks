# Ahrefs Import Quality Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter Ahrefs-fetched backlinks by DR and SEO hostname/path rules before writing `backlinks.json`.

**Architecture:** Add pure helpers + reject stats inside `scripts/import-ahrefs-backlinks.js` `buildImportedBacklinks` loop; cover with Vitest in the existing import test file. Do not touch opencli.

**Tech Stack:** Node.js script, Vitest

---

### Task 1: Failing tests for quality filters

**Files:**
- Modify: `link-master/src/lib/import-ahrefs-backlinks.test.js`

- [ ] Add cases: missing DR, DR `"9"`, DR `"10"` kept
- [ ] Add cases: `seo.` / `blog.seo.com` / `seo-tools.com` rejected; normal host kept
- [ ] Add cases: hostname/path containing `-seo-` rejected
- [ ] Expect new stats keys in `result.stats`
- [ ] Run test; confirm RED

### Task 2: Implement filters in import script

**Files:**
- Modify: `link-master/scripts/import-ahrefs-backlinks.js`

- [ ] Add `isLowOrMissingDr`, `hasSeoHostnameLabel`, `hasSeoTokenInHostOrPath`
- [ ] Apply after URL normalize, before duplicate check
- [ ] Wire stats + CLI print lines
- [ ] Run tests; confirm GREEN

### Task 3: Commit (when requested)

- [ ] Commit script + tests only (no runtime JSON)
