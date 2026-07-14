# Contributing

## Local Setup

### Prerequisites

- Bun 1.3+
- Node.js 22+

### Install

```bash
bun install
```

### Run The App

```bash
npm run dev
npm run dev:server
npm run dev:all
```

- `npm run dev` starts the Vite frontend.
- `npm run dev:server` starts the Bun/Hono backend.
- `npm run dev:all` starts both for local full-stack work.

## Common Commands

```bash
npm run test:e2e:install
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run bundle:check
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:coverage
npm run build
```

These scripts are the canonical local task aliases for formatting, validation, testing, and
building.

Run `npm run build && npm run bundle:check` when changing charting, drag-and-drop, dialog, or
vendor-heavy frontend dependencies.

## Local Hooks

Git hooks are installed through `npm run prepare` during dependency installation.

- `pre-commit` runs `lint-staged`, which formats staged files and lints staged TypeScript files.
- `pre-push` runs `npm run typecheck` and `npm run test:unit`.

If hooks need to be reinstalled manually, run:

```bash
npm run prepare
```

## Test Strategy

- `test:unit` covers shared runtime logic and frontend unit/component tests through Vitest.
- `test:integration` covers backend route and runtime integration tests through Bun's native test
  runner.
- `test:e2e` runs the Playwright browser smoke suite against the real frontend and backend.
- `test:coverage` runs three named gates so reports stay honest and readable:
  - shared runtime modules, excluding type-only `shared/types.ts`, require 100% statements,
    branches, functions, and lines
  - frontend coverage includes `App`, tested service-management components, API-backed hooks, and
    the API client; it requires 75% statements, 55% branches, 70% functions, and 75% lines
  - server coverage includes production modules loaded by Bun integration tests, excluding shared
    modules and `server/test-utils.ts`; it requires 80% functions and 75% lines

Low-value UI primitives, entry-point wiring, and purely presentational components stay outside the
coverage gate. Unit, integration, and E2E suites remain authoritative for their intended layers;
do not add implementation-coupled tests only to increase percentages.

Run `npm run test:e2e:install` once per machine before using the browser suite so Chromium is
installed locally.

When changing server routes or shared validation logic, run both `test:unit` and
`test:integration` locally before pushing.

## Environment Variables

| Variable              | Default                                            | Purpose                                                      |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `ORBITDASH_DATA_DIR`  | `./data` outside Docker, `/data` in Docker         | Controls where the SQLite database and icon files are stored |
| `ORBITDASH_DISK_PATH` | `/`                                                | Controls which mount path is used for disk usage collection  |
| `PORT`                | `3001`                                             | Backend listen port                                          |
| `NODE_ENV`            | unset in development, `production` for `npm start` | Standard runtime mode flag                                   |

## Architecture Notes

See [docs/architecture.md](docs/architecture.md) for the high-level design choices and the reasons
behind the current stack.

For SQLite query and index rationale, see [docs/database-indexing.md](docs/database-indexing.md).

For release-time quality scoring, see [docs/quality-rubric.md](docs/quality-rubric.md).

## Frontend Async States

See [docs/frontend-state-guidelines.md](docs/frontend-state-guidelines.md) for the expected loading,
success, empty, and error-state patterns across the dashboard UI.

## Release Workflow

See [docs/release-checklist.md](docs/release-checklist.md) for the release procedure, pre-publish
validation, and container verification steps.

`package.json` owns the stable release version. The current `0.0.0` value is an intentional
pre-release placeholder and must be replaced in the release PR before the first `vX.Y.Z` tag.

For persistent data handling, see [docs/backup-restore.md](docs/backup-restore.md).
