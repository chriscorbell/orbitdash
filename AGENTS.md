# Orbitdash Agent Context

Use this file as a practical handoff for future agents working in this repository.

## Project Snapshot

- Orbitdash is a home-server dashboard for live system metrics and curated service links.
- Frontend stack: React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix-based UI primitives, Chart.js, dnd-kit.
- Backend stack: Bun runtime, Hono router, SQLite via `bun:sqlite`, SSE for live metrics.
- Shared runtime layer: `shared/` holds types, runtime schemas, URL normalization, category ordering, and service form-data helpers.
- Container target: GHCR image with multi-arch publish and readiness smoke tests.

## Repository Map

- `src/`: React app, hooks, API client modules, and UI components.
- `server/`: Bun/Hono backend, routes, runtime setup, metrics collection, DB access, migrations, and service-layer modules.
- `shared/`: shared TypeScript contracts and runtime validation helpers used by both frontend and backend.
- `docs/`: contributor, architecture, release, backup, indexing, bundle budget, and quality rubric docs.
- `.github/workflows/`: CI and container publish workflows.
- `.vscode/`: local-only planning/context files. This folder is ignored by git in this repo.

## Core Commands

- Install: `bun install`
- Frontend dev: `npm run dev`
- Backend dev: `npm run dev:server`
- Full stack dev: `npm run dev:all`
- Format: `npm run format`
- Format check: `npm run format:check`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit tests: `npm run test:unit`
- Integration tests: `npm run test:integration`
- E2E tests: `npm run test:e2e`
- Coverage: `npm run test:coverage`
- Build: `npm run build`
- Bundle budget: `npm run bundle:check`

## Validation And CI Expectations

- The `Quality` workflow runs, in order: `bun install --frozen-lockfile`, format check, lint, typecheck, unit tests, integration tests, Playwright install, e2e, coverage, build, and bundle budget enforcement.
- The repo uses Bun for dependency installation in CI. If `package.json` changes without `bun.lock` changing, CI should fail by design.
- Pre-push hooks run `npm run typecheck` and `npm run test:unit`.
- Shared runtime coverage is enforced very strictly. New files under `shared/` should come with thorough tests.

## Deployment And Runtime Notes

- Docker image publishes through `.github/workflows/docker-publish.yml` with amd64 and arm64 builds.
- The publish workflow smoke-tests container readiness through `GET /readyz` before pushing tags.
- Runtime data lives in `/data` in containers or `./data` locally by default.
- Main environment variables:
  - `ORBITDASH_DATA_DIR`
  - `ORBITDASH_DISK_PATH`
  - `PORT`
  - `NODE_ENV`

## Current Architecture Boundaries

- Backend route files should mostly orchestrate HTTP concerns and delegate business logic to service-layer modules.
- Service icon handling lives outside route handlers in dedicated service/storage code.
- Frontend service management is decomposed across `ServicesSection`, `ServiceDialog`, and smaller helper components/hooks under `src/components/services/`.
- Shared runtime validation is centralized in `shared/schemas.ts`.
- Shared multipart service request handling is centralized in `shared/service-form-data.ts` and is consumed by both client and server.

## Important Repo-Specific Gotchas

- `package.json` uses a guarded `prepare` script:
  - `if command -v simple-git-hooks >/dev/null 2>&1; then simple-git-hooks; fi`
  - This is intentional so production-only installs inside Docker do not fail when dev dependencies are absent.
- `src/components/ServiceCard.tsx` uses `DropdownMenu modal={false}` intentionally.
  - This prevents pointer-event lockups after opening the edit dialog from the service action menu.
- The main bundle budget should not be raised casually.
  - A recent regression was fixed by extracting `zod` and `shared/schemas.ts` into a dedicated `validation-*` chunk in `vite.config.ts`.
  - If bundle budgets fail again, inspect chunk boundaries before raising thresholds.
- Bundle budgets are currently tracked for:
  - `index-*`
  - `index-*.css`
  - `react-vendor-*`
  - `charts-*`
  - `validation-*`
  - `ServiceDialog-*`
  - `drag-drop-*`
- Dependabot is configured for `bun`, not `npm`.
  - This was changed because npm-based Dependabot PRs were generated without `bun.lock` updates and always failed frozen-lockfile installs.
  - Existing stale npm-based Dependabot PRs were intentionally closed after the config fix.

## Testing Notes

- Backend integration tests must continue to use Bun because the server depends on Bun-specific runtime and SQLite APIs.
- Playwright smoke tests exercise the primary dashboard flow against the real frontend and backend.
- Use role-based locators in e2e tests where possible. Text-only assertions can become ambiguous, especially in the stats UI.

## Current Quality Baseline

- The codebase was recently brought to a 10/10 internal quality score.
- Recent completed work included:
  - shared schemas for request/response validation
  - frontend hook/component/e2e test coverage
  - runtime/db migration improvements
  - icon storage and service-layer extraction
  - centralized API error responses
  - bundle budget enforcement
  - structured logging and graceful shutdown testing
  - Bun-native Dependabot configuration

## Suggested Agent Workflow

- Read `README.md`, `CONTRIBUTING.md`, and relevant docs in `docs/` before broad changes.
- For frontend dependency or chunking changes, run `npm run build && npm run bundle:check`.
- For server or shared validation changes, run both `npm run test:unit` and `npm run test:integration`.
- For UI flow changes, run `npm run test:e2e` when practical.
- Treat `.vscode/` content as local context and planning material, not as part of the shipped product.
