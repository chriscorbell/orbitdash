# Release Checklist

## Release Model

- Every push to `main` runs the full quality suite. Changes that affect the shipped project then
  publish `main`, `latest`, and an immutable `sha-<commit>` container tag.
- Stable releases use `vX.Y.Z`. The tag must equal `v` plus the version in `package.json`.
- Manual publishing is limited to `main` or an existing `v*` tag.
- A successful stable release creates a GitHub Release with generated notes.

## Before Release

1. Run `npm run format:check`.
2. Run `npm run lint`.
3. Run `npm run typecheck`.
4. Run `npm run test:unit`.
5. Run `npm run test:integration`.
6. Run `npm run test:e2e`.
7. Run `npm run test:coverage`.
8. Run `npm run build`.
9. Run `npm run bundle:check`.

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

1. Choose the next semantic version and update `version` in `package.json`.
2. Merge the version change through a pull request after `Quality` passes.
3. Tag that merge commit as `vX.Y.Z` using the exact package version and push the tag.
4. Monitor the `Deploy to GHCR` workflow until validation, both architecture smoke tests, manifest
   creation, and GitHub Release creation succeed.
5. Verify the versioned container image starts and reaches `/readyz` successfully.

## After Release

1. Smoke-test service CRUD in the UI.
2. Confirm live metrics render and continue updating.
3. Verify existing persisted services and icons still load after upgrade.

## Rollback And Yank

1. Pin the deployment to the previous `vX.Y.Z` or `sha-<commit>` tag.
2. Pull the selected image, restart the container, and verify `/healthz` and `/readyz`.
3. Restore the pre-upgrade data backup only when a database or persisted-data change requires it;
   changing the image alone does not reverse data changes.
4. Prefer publishing a fixed patch release over deleting an image. If a dangerous image must be
   yanked, first record the reason, then delete its GHCR package version and matching GitHub Release
   through their package/release settings.
