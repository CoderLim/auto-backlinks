# Multi-source Backlink Import

**Date:** 2026-07-25  
**Scope:** `link-master/scripts/import-backlinks.js` (replaces `import-ahrefs-backlinks.js`, no shim)

## CLI

```bash
node scripts/import-backlinks.js <website> [--source ahrefs|sim] [--limit 1-100] [--dry-run]
```

- Default `--source ahrefs`
- `--limit` only affects `sim` (default 50)

## Sources

| source | opencli | authority field mapped to `dr` |
|--------|---------|--------------------------------|
| ahrefs | `ahrefs backlinks <domain> -f json` | `dr` |
| sim | `sim backlinks <domain> --limit N -f json` | `domainScore` |

Sim JSON is a top-level array; normalized to unified `{ links[] }` before filters.

## Filters (unchanged)

Low/missing DR, SEO hostname labels, `-seo-` in host/path, root/invalid/duplicate.

## History

`data/json/backlink-import-history.json` (reads legacy `ahrefs-import-history.json` if present).
