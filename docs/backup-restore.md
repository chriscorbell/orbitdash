# Backup And Restore

Orbitdash persists everything under one data directory:

- `orbitdash.db`
- `orbitdash.db-shm`
- `orbitdash.db-wal`
- `icons/`

Because SQLite runs in WAL mode, the safe default is to stop orbitdash and back up the entire data
directory together instead of copying only `orbitdash.db`.

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
