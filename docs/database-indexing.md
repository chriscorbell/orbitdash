# Database Indexing Notes

Orbitdash uses a small SQLite schema, so index choices should follow the actual read and write
paths rather than speculative optimization.

Live metric samples are not stored in SQLite: retention is a rolling one-minute window, so they
live in an in-memory buffer inside `server/metrics.ts`. Rolled-up history is stored (see below).

## Current Query Patterns

- `services`
  - list view: `SELECT * FROM services ORDER BY category ASC, name ASC`
  - detail/update/delete: `SELECT * FROM services WHERE id = ?`
- `settings`
  - category order lookup: `SELECT value FROM settings WHERE key = ?`
  - category order upsert: `INSERT ... ON CONFLICT(key) DO UPDATE`
- `metric_history_1m` and `metric_history_15m`
  - range read: `SELECT ... WHERE ts >= ? AND ts <= ? ORDER BY ts ASC`
  - per-minute write: `INSERT ... ON CONFLICT(ts) DO UPDATE`, once a minute in one transaction
  - prune: `DELETE ... WHERE ts < ?`, hourly

## Existing Index Coverage

- `services.id` is the primary key, so the route-level fetch, update, and delete lookups already use
  an index.
- `settings.key` is the primary key, which covers both lookup and upsert paths.
- `services_category_name_idx` supports the dashboard's list query ordered by category and name.
- In both history tables `ts` is an `INTEGER PRIMARY KEY`, which makes it the rowid. Range reads,
  upserts and prunes all walk the table b-tree directly, with no separate index to maintain.

## Why There Are No Extra Indexes Yet

- Services are not filtered by URL, icon, or creation date today, so indexing those columns would
  add write cost without a matching read path.
- Settings currently store a single keyed blob for category ordering, so the primary key is enough.

## When To Revisit

- Add or adjust indexes when a new route introduces a repeated filter or sort pattern.
- Update the notes alongside any schema change so the index rationale stays current.
