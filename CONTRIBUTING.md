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
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:coverage
npm run build
```

These scripts are the canonical local task aliases for formatting, validation, testing, and
building.

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
- `test:e2e` is reserved for browser smoke coverage.
- `test:coverage` currently enforces shared runtime coverage and should expand as more suites land.

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

## Release Workflow

See [docs/release-checklist.md](docs/release-checklist.md) for the release procedure, pre-publish
validation, and container verification steps.
