# Orbitdash Agent Context

Use this file as a practical handoff for future agents working in this repository.

## Project Snapshot

- Orbitdash is a home-server dashboard for live system metrics and curated service links.
- Frontend stack: React 19, TypeScript, Vite 8 (Rolldown), Tailwind CSS 4, Radix-based UI primitives, TanStack Query, Chart.js, dnd-kit. Design tokens (themes, accent presets via `data-accent`, Geist fonts) live in `src/index.css`.
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
- `server/static-assets.ts` serves `dist/`: the `.br`/`.gz` files `npm run build` writes, immutable caching for hashed `/assets/*`, and ETag revalidation for everything else. It scans `dist/` once at startup, so restart the server after rebuilding.
- Runtime data lives in `/data` in containers or `./data` locally by default.
- Main environment variables:
  - `ORBITDASH_DATA_DIR`
  - `ORBITDASH_DISK_PATH`
  - `ORBITDASH_HOST_ROOT` (a read-only mount of the host's `/`; host metrics are read under it)
  - `ORBITDASH_DOCKER_HOST` (Docker endpoint: `tcp://dockerproxy:2375`, `unix:///...`, or `off`; a mounted `/var/run/docker.sock` is found without it)
  - `ORBITDASH_PROMETHEUS` / `ORBITDASH_PROMETHEUS_TOKEN` (`/metrics` endpoint, off by default; the token is required while auth is on)
  - `ORBITDASH_SEED_FILE` (services to add on a fresh install; defaults to `/data/seed.yaml`)
  - `PORT`
  - `NODE_ENV`
  - `LOG_LEVEL` (`debug` | `info` | `warn` | `error`, default `info`)
  - Auth: `ORBITDASH_AUTH` (`none` | `password` | `proxy`), `ORBITDASH_PASSWORD` or `ORBITDASH_PASSWORD_HASH`, `ORBITDASH_SESSION_DAYS`, `ORBITDASH_GUEST` (`none` | `view`), `ORBITDASH_PROXY_HEADER`, `ORBITDASH_TRUSTED_PROXIES`. See `docs/architecture.md` under "Optional Authentication".

## Current Architecture Boundaries

- Backend route files should mostly orchestrate HTTP concerns and delegate business logic to service-layer modules.
- Service icon handling lives outside route handlers in dedicated service/storage code.
- Frontend service management is decomposed across `ServicesSection`, `ServiceDialog`, the board layout and edit mode under `src/components/board/`, and smaller helper components/hooks under `src/components/services/`.
- The board groups services by category id (`src/lib/board-groups.ts`) using the categories from `GET /api/categories` (`useCategories`); category ordering is changed by dragging in edit mode, not in settings.
- Shared runtime validation is centralized in `shared/schemas.ts`.
- Shared multipart service request handling is centralized in `shared/service-form-data.ts` and is consumed by both client and server.
- The metrics collector lives in `server/host/`. `host-fs.ts` is its only file access; every reader takes file contents or an injected `HostFs`, so tests run on fixture strings (`test-fixtures.ts`). The strip's `MetricSample` (`cpu`, `ram`, `disk`) is derived from the richer, versioned `HostSnapshot` of the same tick; keep its three fields stable and add detail to the snapshot.
- Auth lives in `server/auth/` (config, CIDR matching, sessions, rate limiting, the `/api/*` middleware) with routes in `server/routes/auth.ts`. A new `/api` route is protected automatically; a new public one has to be added to `PUBLIC_API_PATHS` in `server/auth/http.ts`, and a GET that guests must not read needs a rule in `guestRule` there. Decide trust from `getPeerIp` (the socket), never from forwarded headers.
- Metric history lives in `server/history/`. The rollup math in `rollup.ts` is pure and tested directly; `recorder.ts` holds the minute in progress; `store.ts` owns the SQL for `metric_history_1m` and `metric_history_15m`. Collection must not subscribe to the live topics for history, because subscribing switches sampling to once a second. `tickCollection` calls `metricHistory.record` directly instead.

## Important Repo-Specific Gotchas

- `package.json` uses a guarded `prepare` script:
  - `if command -v simple-git-hooks >/dev/null 2>&1; then simple-git-hooks; fi`
  - This is intentional so production-only installs inside Docker do not fail when dev dependencies are absent.
- `src/components/board/ServiceActionsMenu.tsx` uses `DropdownMenu modal={false}` intentionally.
  - This prevents pointer-event lockups after opening the edit dialog from the service action menu.
- Outside edit mode service cards are plain links with no menu. Editing, duplicating, deleting and arranging happen in edit mode (`src/components/board/EditableBoard.tsx`, loaded lazily with dnd-kit).
- The main bundle budget should not be raised casually.
  - Chunking uses Rolldown `codeSplitting.groups` in `vite.config.ts`. A group also captures its modules' dependencies, so group priority decides where shared packages like React land. `docs/bundle-size-budget.md` explains the layout and the tracked budgets.
  - If bundle budgets fail again, inspect chunk boundaries before raising thresholds.
  - `drag-drop-*`, `SettingsDialog-*`, `EditableBoard-*`, `SignInScreen-*` and `toaster-*` must stay lazy: modules loaded on first render reach dnd-kit, the settings dialog, the edit board, the sign-in screen and the toaster only through `lazy()` components. `npm run bundle:check` fails if `index.html` preloads any of them.
  - The same goes for `ServiceStatus-*`: `ServiceCard.tsx` reaches the status dot and details only through `lazy()`. Status response schemas live in `src/lib/api/status.ts` (not `schemas.ts`) for that reason; the pair test in `src/lib/api/schemas.test.ts` covers them.
- Status checks (`server/status/`, see "Status Checks" in `docs/architecture.md`) are off by default and the migration leaves existing services off. Keep it that way: an upgrade must never start contacting anything. Checker tests use injected fetch/connect and a fake clock, never the network, and logs must never include a check's URL or target (they can hold credentials).
- Notifications (`server/notifications/`, see "Notifications" in `docs/architecture.md`) listen to the event bus; don't call them from the status or alert code. Channel secrets live in `settings` (so backups carry them) and must only leave the server masked (`toChannelView`), guests included. Tests stub `fetch` (`spyOn(globalThis, "fetch")` or the injected `FetchLike`) and never send real notifications. The settings section is the lazy `NotificationSettings-*` chunk; its zod/mini schemas in `src/lib/api/notifications.ts` avoid `discriminatedUnion` to keep the first-paint `validation` chunk small.
- The offline service worker (`src/sw/`, built to `dist/sw.js`) runs in production builds only; its caching rules are in `docs/architecture.md` under "Installable App And Offline Shell".
  - A new GET endpoint the dashboard renders goes to the network until it gets a route in `src/sw/routes.ts`.
  - `/sw.js` and `/manifest.webmanifest` must keep `Cache-Control: no-cache`, or browsers keep running an old build.
  - The e2e suite runs on the Vite dev server, which never registers the worker. Check worker changes with `npm run build && npm start` on `localhost` (a secure context, so the worker registers).
- The Dockerfile's build stage copies build inputs one by one. A new file that `vite.config.ts` or `tsc -b` needs (like `scripts/vite-service-worker.ts` or `tsconfig.sw.json`) also needs a `COPY` line there.
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
