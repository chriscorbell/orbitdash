# Release Checklist

## Before Release

1. Run `npm run format:check`.
2. Run `npm run lint`.
3. Run `npm run typecheck`.
4. Run `npm run test:unit`.
5. Run `npm run test:integration`.
6. Run `npm run test:coverage`.
7. Run `npm run build`.

## Container Verification

1. Build and start the container image.
2. Verify `GET /healthz` returns `200`.
3. Verify `GET /readyz` returns `200`.
4. Confirm the expected volume is mounted for `/data`.
5. Confirm the expected host port is mapped to container port `3000`.

## Data Safety

1. Back up the mounted data directory before upgrading production.
2. Confirm the SQLite database file and `icons/` directory are present in the backup.
3. Follow [backup-restore.md](backup-restore.md) when creating or restoring backups so the WAL files
   are preserved with the database.

## Publish

1. Push the release commit and any version tags.
2. Monitor the GitHub Actions publish workflow.
3. Verify the pushed container image starts and reaches `/readyz` successfully.

## After Release

1. Smoke-test service CRUD in the UI.
2. Confirm live metrics render and continue updating.
3. Verify existing persisted services and icons still load after upgrade.
