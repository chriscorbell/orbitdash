# Orbitdash 10/10 Code Quality Plan

Current assessment: 8/10.

Target state: a small full-stack TypeScript application with strong automated quality gates, resilient runtime behavior, clear architectural boundaries, and enough operational and developer documentation that changes are low-risk.

How to use this plan:
- Treat each unchecked item as a backlog task.
- Do the work top-to-bottom unless another dependency forces a change.
- Do not count a task as done until its acceptance criteria are satisfied.

## Definition Of 10/10

- The codebase has reliable automated tests across core frontend and backend flows.
- Runtime input validation is schema-based and consistent across routes.
- Complex components and routes are decomposed enough that future edits stay local.
- Security and operational failure modes are explicitly handled.
- Tooling catches regressions before release.
- New contributors can understand, run, test, and ship the app without tribal knowledge.

## Priority 0: Establish Non-Negotiable Quality Gates

- [x] Add a test runner and a `test` script to `package.json`.
Acceptance criteria: `npm test` runs locally and in CI; the script exits non-zero on failures.

- [x] Add separate `test:unit`, `test:integration`, and `test:e2e` scripts if the chosen stack supports them.
Acceptance criteria: each script is independently runnable; CI can target them separately.

- [x] Add CI to run lint, typecheck, tests, and production build on every PR.
Acceptance criteria: pull requests cannot merge without passing all required checks.

- [x] Add coverage reporting with a documented minimum threshold.
Acceptance criteria: coverage runs in CI; thresholds are enforced; failing coverage blocks merges.

- [x] Add a dedicated `typecheck` script instead of relying only on `build`.
Acceptance criteria: maintainers can run type validation without performing a production bundle.

- [x] Add a formatting strategy and enforce it automatically.
Acceptance criteria: a formatter is configured, documented, and run in CI or pre-commit hooks.

## Priority 1: Add Real Test Coverage

- [x] Add backend tests for `GET /api/services`, `POST /api/services`, `PUT /api/services/:id`, and `DELETE /api/services/:id`.
Acceptance criteria: tests cover happy paths, invalid payloads, missing resources, and icon-related edge cases.

- [x] Add backend tests for `GET /api/settings/category-order` and `PUT /api/settings/category-order`.
Acceptance criteria: tests cover invalid arrays, duplicate values, whitespace normalization, and forbidden uncategorized ordering.

- [x] Add backend tests for health endpoints and readiness behavior.
Acceptance criteria: tests verify healthy and degraded database states for `/healthz`, `/readyz`, and `/api/health`.

- [x] Add unit tests for `shared/category-order.ts`.
Acceptance criteria: tests cover duplicate suppression, trimming, uncategorized handling, and deterministic merge behavior.

- [x] Add unit tests for `shared/urls.ts`.
Acceptance criteria: tests cover valid URLs, invalid schemes, trimming, normalization, and icon URL handling.

- [x] Add hook tests for `useServices`, `useMetrics`, and `useCategoryOrder`.
Acceptance criteria: tests verify loading states, success paths, error paths, optimistic/local state updates, and cleanup behavior.

- [x] Add component tests for the service CRUD flow.
Acceptance criteria: tests cover add, edit, delete, validation messages, icon preview behavior, and category handling.

- [ ] Add end-to-end smoke tests for the primary user journey.
Acceptance criteria: tests start the app, create a service, edit it, reorder categories, and verify stats UI renders.

## Priority 2: Replace Ad Hoc Validation With Shared Schemas

- [x] Introduce a schema validation library for request bodies, query strings, and persisted shapes.
Acceptance criteria: backend routes parse external input through schemas before business logic executes.

- [x] Define schemas for service create/update payloads, category order updates, and metrics query params.
Acceptance criteria: invalid input returns consistent 4xx responses with useful error messages.

- [x] Reuse those schemas for frontend form validation where practical.
Acceptance criteria: client and server share validation rules for core fields such as name, URL, category, and icon URL.

- [x] Remove unsafe type assertions around parsed JSON where schemas can provide runtime guarantees.
Acceptance criteria: route handlers no longer depend on blind casts for request bodies.

- [x] Document validation rules in one place.
Acceptance criteria: contributors can find canonical field rules without reading multiple files.

## Priority 3: Refactor Maintainability Hotspots

- [ ] Split `src/components/ServiceDialog.tsx` into focused units.
Acceptance criteria: dialog state, icon handling, category selection, and submit/delete actions are separated into smaller components or hooks.

- [ ] Extract service route business logic from `server/routes/services.ts` into service-layer modules.
Acceptance criteria: the route file becomes mostly HTTP orchestration; validation, persistence, and icon storage concerns are isolated.

- [ ] Introduce a storage abstraction for icons.
Acceptance criteria: icon download, file validation, file persistence, and deletion live outside the route handler.

- [ ] Centralize API error translation.
Acceptance criteria: repeated `try/catch` response shaping logic is replaced with shared helpers or middleware.

- [ ] Audit hooks and components for state density.
Acceptance criteria: any file mixing multiple responsibilities is reduced to simpler, named building blocks.

## Priority 4: Improve Resilience And Failure Handling

- [ ] Add explicit handling for malformed JSON and unsupported content types.
Acceptance criteria: routes return structured 400/415 responses instead of generic internal errors.

- [ ] Add icon file content verification beyond extension and declared MIME type.
Acceptance criteria: the server rejects files whose contents do not match supported image formats.

- [ ] Add limits and safeguards around remote icon downloads.
Acceptance criteria: timeouts, content-length limits, redirect limits, and host/protocol restrictions are enforced and tested.

- [ ] Review the app for server-side request forgery exposure from remote icon fetching.
Acceptance criteria: private-network and localhost fetches are either blocked or consciously documented and justified.

- [ ] Add structured logging for operational errors.
Acceptance criteria: unexpected failures include route context and actionable metadata without leaking secrets.

- [ ] Improve user-visible error handling in the frontend.
Acceptance criteria: service creation, update, deletion, metrics failures, and category-order failures all show clear UI feedback.

- [ ] Add retry or reconnect strategy visibility for live metrics.
Acceptance criteria: the UI communicates disconnected, reconnecting, and recovered states consistently.

## Priority 5: Tighten Database And Data Model Quality

- [ ] Add migration support instead of relying only on startup schema creation.
Acceptance criteria: schema changes are versioned, repeatable, and safe for upgrades.

- [ ] Add database integration tests using an isolated temporary database.
Acceptance criteria: tests verify schema initialization, inserts, updates, deletes, and readiness checks.

- [ ] Define constraints closer to the database where appropriate.
Acceptance criteria: important invariants such as required fields and sensible defaults are enforced in schema design, not only application code.

- [ ] Review sorting and indexing strategy for services and metrics queries.
Acceptance criteria: indexes are justified by real query patterns and documented where non-obvious.

- [ ] Add a backup and restore story for persisted data.
Acceptance criteria: maintainers can back up the SQLite file and icon assets with documented steps.

## Priority 6: Strengthen Frontend Quality And Accessibility

- [ ] Add accessibility-focused tests for dialogs, switches, forms, and keyboard interactions.
Acceptance criteria: core flows are operable by keyboard and pass automated a11y checks.

- [ ] Replace any custom interactive control that lacks full semantics with hardened primitives or equivalent behavior.
Acceptance criteria: controls expose correct labels, focus behavior, and keyboard support.

- [ ] Add loading and empty-state consistency guidelines.
Acceptance criteria: every async section has an intentional loading, success, empty, and error presentation.

- [ ] Reduce unnecessary casting in client code.
Acceptance criteria: payload and response flows are strongly typed end-to-end without avoidable `as` usage.

- [ ] Measure and document bundle-size expectations.
Acceptance criteria: large chunks are identified, monitored, and reduced if they exceed agreed thresholds.

## Priority 7: Improve Developer Experience

- [ ] Add a contributor guide with local setup, test strategy, release workflow, and architecture notes.
Acceptance criteria: a new contributor can clone, run, test, and understand the project from docs alone.

- [ ] Add `make`, npm, or task aliases for common workflows.
Acceptance criteria: linting, testing, building, and running the full stack are available through obvious commands.

- [ ] Add pre-commit or pre-push hooks for fast local validation.
Acceptance criteria: basic quality checks run automatically before code leaves a developer machine.

- [ ] Document environment variables and defaults comprehensively.
Acceptance criteria: data directory, disk path, ports, and runtime assumptions are described in one place.

- [ ] Add architecture decision notes for major patterns.
Acceptance criteria: maintainers can understand why Bun, Hono, SQLite, SSE, and shared types were chosen.

## Priority 8: Production Readiness And Observability

- [ ] Add request-level logging and basic metrics.
Acceptance criteria: maintainers can inspect request volume, failures, and health trends in production.

- [ ] Add graceful shutdown tests or documented expectations.
Acceptance criteria: shutdown closes background loops and the database cleanly under normal stop signals.

- [ ] Add container-level documentation and verification for production deployment.
Acceptance criteria: documented health checks, volumes, ports, and upgrade behavior match the actual image behavior.

- [ ] Add a release checklist.
Acceptance criteria: versioning, changelog updates, smoke tests, and image verification happen before publishing.

- [x] Add dependency maintenance automation.
Acceptance criteria: outdated dependencies and security advisories are surfaced regularly.

## Priority 9: Finish The Last 10 Percent

- [ ] Remove leftover duplication between frontend API modules and backend route logic where shared helpers would reduce drift.
Acceptance criteria: repeated field normalization and error message patterns are intentionally centralized.

- [ ] Audit naming consistency across client, server, and shared types.
Acceptance criteria: the same concepts use the same names everywhere unless a translation boundary requires otherwise.

- [ ] Review comment quality and add only the high-value comments that explain non-obvious behavior.
Acceptance criteria: comments describe intent and edge cases rather than repeating the code.

- [ ] Add a lightweight quality rubric to the repo.
Acceptance criteria: maintainers can score architecture, tests, resilience, performance, and docs during major changes.

- [ ] Re-run the full assessment after all tasks are complete.
Acceptance criteria: the codebase has passing CI, meaningful coverage, documented operations, schema-backed validation, and no major maintainability hotspots.

## Suggested Execution Order

1. Quality gates and test harness.
2. Backend and shared-module tests.
3. Frontend component and hook tests.
4. Schema validation rollout.
5. Route and component refactors.
6. Security and resilience hardening.
7. Documentation, CI polish, and release process.

## What Would Most Improve The Score Fastest

- Automated tests for backend routes, shared utilities, and the service CRUD UI.
- Schema-based validation for all external inputs.
- Refactoring of the service route and service dialog into smaller units.
- CI enforcement of test, typecheck, lint, build, and coverage thresholds.
- Security hardening of remote icon fetching.