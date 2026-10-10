# Backup And Restore

Orbitdash persists everything under one data directory:

- `orbitdash.db`
- `orbitdash.db-shm`
- `orbitdash.db-wal`
- `icons/`

Because SQLite runs in WAL mode, the safe default for a manual copy is to stop orbitdash and back
up the entire data directory together instead of copying only `orbitdash.db`.

## Built-In Backups

orbitdash also backs itself up while it runs, without stopping:

- **Automatic snapshots** land in `backups/` inside the data directory: one nightly, one before any
  schema migration runs, and one before every import. Each snapshot is a folder holding a
  consistent copy of the database (taken with SQLite `VACUUM INTO`) plus the `icons/` directory.
  The newest 7 are kept; set `ORBITDASH_BACKUP_KEEP` to change that.
- **Export** (Settings, then Data, then Export, or `GET /api/backup/export`) downloads one JSON file
  with every service, setting and icon. Each service carries its external URL, extra links and
  tags; files exported before those existed import without them.
- **Import** (Settings, then Data, then Import, or `POST /api/backup/import` with the exported JSON)
  validates the file, takes a `pre-import` snapshot, and then replaces all services, settings and
  icons in one step.
- **Manual snapshot** (Settings, then Data, then Snapshot, or `POST /api/backup/snapshots`).

Metric history describes the machine orbitdash runs on, not the dashboard's configuration. It
is treated like this:

- **Export** leaves it out.
- **Import** leaves the current history alone, so restoring services from another machine doesn't
  bring its telemetry or wipe this one's.
- **Snapshots** copy the whole database, history included: about 2 MB at full retention (48
  hours of minutes and 90 days of quarter hours). Restoring a snapshot brings back the history up
  to when it was taken, followed by a gap.

Status checks are split the same way:

- **Export** includes each service's check settings (on or off, method, target, interval,
  certificate handling). Backups from before status checks import with checks off.
- **Check history** (results, hourly totals, current statuses) is left out of exports and kept
  across imports. A service imported with the same id keeps its history; history of services that
  no longer exist is removed by the hourly prune.
- **Snapshots** include check history like any other table.

Notification channels live in the `settings` table, secrets included:

- **Export and snapshots contain every channel's tokens, topics, webhook URLs and header values in
  plain text.** Keep export files and the `backups/` folder as private as the services they reach.
- **Import** replaces the channels and notification options with the file's. The delivery log and
  the record of outages already announced are left alone, like status history.

### Restore From A Snapshot

Snapshots are complete data directories without the WAL files, so restoring one is a copy:

```bash
docker compose stop orbitdash
cp -a ./data/backups/2026-10-10T03-00-00-000Z-nightly ./restore
mv ./data ./data-before-restore
mv ./restore ./data
docker compose start orbitdash
```

Keep `./data-before-restore` until you have confirmed the restored dashboard looks right; it also
still holds the other snapshots.

## Locate The Data Directory

- Docker and Docker Compose: `/data` inside the container, usually bind-mounted to a host path such
  as `./orbitdash-data` or `./data`.
- Local development or direct Bun execution: `./data` by default.
- Custom deployments: whatever path is configured through `ORBITDASH_DATA_DIR`.

## Create A Backup

### Docker Compose

```bash
docker compose stop orbitdash
tar -czf orbitdash-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C ./data .
docker compose start orbitdash
```

### Docker Run With A Bind Mount

```bash
docker stop orbitdash
tar -czf orbitdash-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C ./orbitdash-data .
docker start orbitdash
```

### Local Bun Or Node Process

```bash
pkill -f "bun server/index.ts"
tar -czf orbitdash-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C ./data .
```

If you use a different process supervisor, stop orbitdash through that supervisor before archiving
the directory.

## Restore From Backup

1. Stop orbitdash.
2. Move or remove the current data directory.
3. Recreate the target directory if needed.
4. Extract the backup into that directory.
5. Start orbitdash again.
6. Verify the dashboard reaches `/readyz` and existing services/icons still render.

### Example Restore

```bash
docker compose stop orbitdash
rm -rf ./data
mkdir -p ./data
tar -xzf orbitdash-backup-20260405-120000.tar.gz -C ./data
docker compose start orbitdash
curl --fail http://127.0.0.1:7770/readyz
```

## Post-Restore Checks

- `curl --fail http://127.0.0.1:7770/healthz`
- `curl --fail http://127.0.0.1:7770/readyz`
- open the UI and confirm saved services appear
- confirm uploaded or downloaded icons still load
