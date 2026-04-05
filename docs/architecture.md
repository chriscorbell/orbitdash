# Architecture Notes

## Stack Choices

### Bun

Bun is used for the backend runtime because it provides fast startup, native SQLite integration,
and a simple local development workflow for the server side of the app.

### Hono

Hono keeps the HTTP layer small and explicit. The codebase benefits from a lightweight router and
middleware model without carrying a large framework surface.

### SQLite

SQLite is used because orbitdash is a single-process, home-server-oriented application with simple,
local persistence requirements. It keeps deployment lightweight and works well with a mounted data
directory. Schema setup now runs through a small migration ledger so upgrades can become explicit
and repeatable instead of relying on one large startup-only schema block.

### SSE For Metrics

Metrics are streamed to the frontend over server-sent events because the app only needs one-way,
low-frequency updates. SSE is simpler than WebSockets for this use case and works well with the
current dashboard refresh model.

### Shared Types And Schemas

Shared TypeScript types define API contracts used on both client and server. Shared runtime schemas
in `shared/schemas.ts` enforce those contracts at runtime for server request parsing and frontend
form validation.

## Current Boundaries

- `server/` contains runtime, routes, metrics collection, and data access.
- `shared/` contains ordering logic, URL normalization, type contracts, and runtime schemas.
- `src/` contains the React UI, hooks, and API client modules.

## Current Known Hotspots

- `server/routes/services.ts` still carries a lot of business logic and icon handling.
- `src/components/ServiceDialog.tsx` still mixes form state, preview handling, and submit/delete
  flows.

These are the main refactor targets for the remaining quality roadmap.
