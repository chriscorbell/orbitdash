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
- Status checks
  - checks to run: `SELECT ... FROM services WHERE check_enabled = 1`, at startup and after config
    changes
  - each check: `INSERT OR IGNORE INTO status_results`, an upsert into `status_hourly` and one into
    `service_status`, in one transaction
  - history: `SELECT ... WHERE service_id = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC` on either
    history table
  - prune: `DELETE FROM status_results WHERE ts < ?` and the same for `status_hourly`, plus a sweep
    for rows whose service is gone, hourly

## Existing Index Coverage

- `services.id` is the primary key, so the route-level fetch, update, and delete lookups already use
  an index.
- `settings.key` is the primary key, which covers both lookup and upsert paths.
- `services_category_name_idx` supports the dashboard's list query ordered by category and name.
- In both history tables `ts` is an `INTEGER PRIMARY KEY`, which makes it the rowid. Range reads,
  upserts and prunes all walk the table b-tree directly, with no separate index to maintain.
- `status_results` and `status_hourly` are `WITHOUT ROWID` tables keyed by `(service_id, ts)`, so a
  service's history is one contiguous range of the primary key. `status_results_ts_idx` lets the
  hourly prune delete old results across every service without scanning the table; at a check
  every 15 seconds for 50 services the table holds close to 300,000 rows. `status_hourly` stays
  small (one row per service per hour), so its prune scans. `service_status` has one row per
  service and needs only its primary key.
- The `check_enabled = 1` filter has no index: it runs only at startup and after config changes,
  over a table of tens of rows.

## Why There Are No Extra Indexes Yet

- Services are not filtered by URL, icon, or creation date today, so indexing those columns would
  add write cost without a matching read path.
- Settings currently store a single keyed blob for category ordering, so the primary key is enough.

## When To Revisit

- Add or adjust indexes when a new route introduces a repeated filter or sort pattern.
- Update the notes alongside any schema change so the index rationale stays current.
