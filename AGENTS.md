# Orbitdash Agent Context

## Project Snapshot

- orbitdash is a startpage: links shown as cards with a title and an icon, grouped under categories. That is the whole product. 2.0 removed everything else 1.x had (metrics, status checks, alerts, notifications, Docker, integrations, widgets, importers, auth, settings); don't bring features back without being asked.
- Frontend: React 19, TypeScript, Vite, plain CSS (`src/styles.css`, no Tailwind), lucide-react, dnd-kit for edit mode. Colors are shadcn/ui's default theme tokens (Neutral base color, dark values only); new colors are mixes of those tokens, not new literals. The font is Geist (`@fontsource-variable/geist`).
- Backend: Node 24 running TypeScript directly (type stripping, no build step), Hono on `@hono/node-server`, SQLite through the built-in `node:sqlite`.
- Package manager: pnpm (pinned in `packageManager`). The runtime image installs only `dependencies` (`hono`, `@hono/node-server`); everything the browser bundle needs is a devDependency.

## Repository Map

- `server/`: `index.ts` (startup, static files), `app.ts` (routes), `board.ts` (all SQL for links and categories), `db.ts` (schema and the 1.x upgrade), `icons.ts` (icon files), `icon-library.ts` (dashboard-icons and selfh.st search), `urls.ts`.
- `shared/types.ts`: the API's types, imported by both sides.
- `src/`: `App.tsx`, `api.ts`, `useBoard.ts`, `components/`, `lib/` (pure helpers with tests).
- `e2e/`: Playwright, run against the production server on a fresh data folder.

## Commands

- `pnpm dev:all` (API on 3001 with `--watch`, Vite on 5173 proxying `/api`)
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`
- CI (`.github/workflows/test.yml`) runs all of these in that order. The publish workflow reuses it, then builds amd64 and arm64 images and smoke-tests `GET /readyz` before pushing to GHCR.

## Things To Know

- Server files import each other with `.ts` extensions, because Node runs them as-is. Only erasable TypeScript works there: no enums, namespaces or parameter properties.
- `node:sqlite` turns foreign keys on by default. `openDatabase` opens with them off and turns them on after the schema is ready, because the 1.x upgrade drops tables that reference each other.
- The schema version is `PRAGMA user_version`. A database with a `schema_migrations` table is from 1.x: `upgradeFromV1` copies it to `orbitdash-v1.db`, keeps the links and categories and drops everything else. Keep that path working; people upgrade from any 1.x release.
- Every mutation answers with the whole `Board`, and the client replaces its state with it. `PUT /api/layout` takes the complete arrangement and answers 409 if it doesn't name every link and category exactly once.
- Icon files get a new name on every change, which is why `/api/icons/*` is cached as immutable. Never rewrite an icon file in place.
- There's no auth. The cross-site guard in `app.ts` (Origin and Sec-Fetch-Site) is what stops other sites from writing; keep it in front of every mutation.
- `public/sw.js` unregisters the 1.x offline service worker. Keep serving it, with `Cache-Control: no-cache`, so browsers that installed 1.x drop the old cached shell.
- Edit mode (`EditBoard.tsx`, which pulls in dnd-kit) and the dialogs load lazily. Keep them out of the entry chunk.
- `typescript` stays on 6.x and `@types/node` on 24.x until typescript-eslint and the runtime catch up; Dependabot ignores their majors.
- Tests never touch the network: the icon library and icon downloads take injected `fetch` functions.
