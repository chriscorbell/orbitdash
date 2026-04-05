# Database Indexing Notes

Orbitdash uses a small SQLite schema, so index choices should follow the actual read and write
paths rather than speculative optimization.

## Current Query Patterns

- `metrics_samples`
  - writes: `INSERT OR REPLACE ... VALUES (?, ?, ?, ?)` on `ts`
  - pruning: `DELETE FROM metrics_samples WHERE ts < ?`
  - reads: `SELECT ... FROM metrics_samples WHERE ts > ? ORDER BY ts ASC`
- `services`
  - list view: `SELECT * FROM services ORDER BY category ASC, name ASC`
  - detail/update/delete: `SELECT * FROM services WHERE id = ?`
- `settings`
  - category order lookup: `SELECT value FROM settings WHERE key = ?`
  - category order upsert: `INSERT ... ON CONFLICT(key) DO UPDATE`

## Existing Index Coverage

- `metrics_samples.ts` is the primary key, so SQLite already maintains an index that supports:
  - point writes keyed by timestamp
  - range pruning on `ts < ?`
  - range reads on `ts > ? ORDER BY ts ASC`
- `services.id` is the primary key, so the route-level fetch, update, and delete lookups already use
  an index.
- `settings.key` is the primary key, which covers both lookup and upsert paths.
- `services_category_name_idx` supports the dashboard's list query ordered by category and name.

## Why There Are No Extra Indexes Yet

- The metrics table is append-heavy and only queried by timestamp, so the primary-key index is the
  right structure and an additional timestamp index would be redundant.
- Services are not filtered by URL, icon, or creation date today, so indexing those columns would
  add write cost without a matching read path.
- Settings currently store a single keyed blob for category ordering, so the primary key is enough.

## When To Revisit

- Add or adjust indexes when a new route introduces a repeated filter or sort pattern.
- Re-check this document if metrics retention grows beyond the current rolling one-minute window.
- Update the notes alongside any schema change so the index rationale stays current.
