# Ahrefs Import Quality Filters

**Date:** 2026-07-25  
**Scope:** `link-master/scripts/import-ahrefs-backlinks.js` only (not opencli)

## Goal

After Ahrefs links are fetched via opencli, reject low-quality rows **before** they are appended to `backlinks.json`.

## Pipeline

`opencli ahrefs backlinks` → parse `{ summary, links[] }` → normalize URL → **quality filters** → dedupe → write

## Reject rules (any match → skip import)

1. **Low / missing DR** — `dr` missing, blank, non-numeric, or numeric value `< 10` (`10` kept).
2. **SEO hostname label** — after lowercasing hostname, any `.`-separated label starts with `seo`  
   (e.g. `seo.example.com`, `seo-tools.com`, `blog.seo.com`, `blog.seotools.com`).
3. **`-seo-` token** — lowercased hostname **or** pathname contains the substring `-seo-`.

Existing filters (invalid URL, root path, duplicate) remain unchanged.

## Out of scope

- opencli / Ahrefs CLI behavior
- Cleaning rows already stored in `backlinks.json`
- Changing import CLI flags beyond printing new reject counts

## Stats / CLI

Add counters for rejected quality rows (e.g. `low_dr`, `seo_hostname`, `seo_token`) and print them alongside existing stats. Dry-run uses the same filters without writing.

## Tests

Extend `src/lib/import-ahrefs-backlinks.test.js` with cases for each reject rule and keep cases for DR ≥ 10 / non-SEO hosts.
