# Ahrefs Import Domain History

**Date:** 2026-07-25  
**Scope:** `link-master/scripts/import-ahrefs-backlinks.js`

## Behavior

- Local file: `data/json/ahrefs-import-history.json`
- Before fetch: if domain exists in history → `console.warn`, continue
- After successful non-dry-run: upsert `{ importedAt, importedCount }`
- Dry-run: no history write
