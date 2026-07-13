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

- `server/app.ts` assembles the Hono application. Files under `server/routes/` translate HTTP
  requests and responses but delegate service behavior to `server/services/`.
- `server/services/service-payloads.ts` parses service request bodies,
  `service-operations.ts` owns service CRUD behavior, and `icon-storage.ts` owns icon validation,
  download, and persistence.
- `server/db.ts` and `server/migrations.ts` own SQLite access and schema evolution. Runtime startup,
  health, metrics collection, and observability stay in their dedicated `server/` modules.
- `shared/` owns client/server contracts, runtime schemas, URL normalization, service form-data
  handling, and category-order rules.
- Frontend hooks under `src/hooks/` own API-backed services, metrics, saved category order, and local
  preferences.
- `ServicesSection` composes service-management UI. Its filtering and dialog-selection state lives
  in `services/useServicesSectionState.ts`, while category, empty, feedback, toolbar, and delete UI
  live in focused components under `src/components/services/`.
- `ServiceDialog` coordinates submission and validation. Form and icon-preview state lives in
  `services/useServiceDialogState.ts`, with category, icon, and action controls split into focused
  components.
