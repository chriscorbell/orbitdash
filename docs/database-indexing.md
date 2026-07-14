# Database Indexing Notes

Orbitdash uses a small SQLite schema, so index choices should follow the actual read and write
paths rather than speculative optimization.

Metric samples are not stored in SQLite: retention is a rolling one-minute window, so they live in
an in-memory buffer inside `server/metrics.ts`.

## Current Query Patterns

- `services`
  - list view: `SELECT * FROM services ORDER BY category ASC, name ASC`
  - detail/update/delete: `SELECT * FROM services WHERE id = ?`
- `settings`
  - category order lookup: `SELECT value FROM settings WHERE key = ?`
  - category order upsert: `INSERT ... ON CONFLICT(key) DO UPDATE`

## Existing Index Coverage

- `services.id` is the primary key, so the route-level fetch, update, and delete lookups already use
  an index.
- `settings.key` is the primary key, which covers both lookup and upsert paths.
- `services_category_name_idx` supports the dashboard's list query ordered by category and name.

## Why There Are No Extra Indexes Yet

- Services are not filtered by URL, icon, or creation date today, so indexing those columns would
  add write cost without a matching read path.
- Settings currently store a single keyed blob for category ordering, so the primary key is enough.

## When To Revisit

- Add or adjust indexes when a new route introduces a repeated filter or sort pattern.
- Update the notes alongside any schema change so the index rationale stays current.
