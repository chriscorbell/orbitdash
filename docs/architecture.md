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

### One Event Stream

The server pushes live data over a single server-sent event stream, `GET /api/events`, filtered by
topic (`metrics`, `host`, `config`). SSE fits because updates only flow one way. Every successful
mutation publishes a `config.changed` event naming what changed (`layout`, `settings`, or `all`)
and the tab that made it, so other tabs and devices refresh without a reload and the originating
tab can ignore its own echo. In the browser, `src/lib/live/event-stream.ts` keeps one connection
per tab that subscribes to exactly the topics with listeners and closes while the tab is hidden;
metrics sampling on the server speeds up to once a second only while some stream includes
`metrics` or `host`. The older `/api/metrics/stream` endpoint remains for compatibility.

### Host Metrics

The collector in `server/host/` reads `/proc` and `/sys` directly, so it needs no agent, no child
processes on Linux, and no privileges. It is layered so almost all of it is pure:

- `host-fs.ts` is the only code that touches the filesystem. A `HostFs` reads host paths, and with
  `ORBITDASH_HOST_ROOT` set it reads them under that root, so a container with the host's `/`
  mounted read-only sees the host. Unreadable files come back as null, never as exceptions.
- `procfs.ts` and `sysfs.ts` parse file contents and decide which filesystems, disks and network
  interfaces count as real. Tests feed them fixture strings or a fake `HostFs`.
- `collector.ts` keeps the previous reading's counters and turns them into CPU usage and disk and
  network rates. A rate is null for the first reading and when a counter goes backwards. Where
  `/proc` is missing (macOS, restricted containers) it falls back to Node's `os` figures for CPU,
  load and memory and leaves the rest empty. Temperatures are re-read at most every 5 seconds,
  because some sensors (NVMe drives) are slow to answer.

Each tick produces one versioned `HostSnapshot` (per-core CPU, load, frequency, temperatures,
memory, filesystems, disk I/O, network) and derives the small `MetricSample` (`cpu`, `ram`, `disk`
percentages) from it. Samples keep feeding the live strip through `/api/metrics` and the `metrics`
topic; the snapshot is served separately by `GET /api/metrics/host` and the `host` topic, so the
per-second payload only grows for views that ask for the detail. Some host facts depend on the
reader's namespace: `/proc/net` and `/proc/self/mounts` describe the container, so the collector
reads PID 1's (`/proc/1/net/dev`, `/proc/1/mounts`), which are the host's through a host root.

### Metric History

The live view stays in memory: the last minute of samples, one a second while someone watches.
History lives in `server/history/` and keeps nine metrics: CPU, memory and main-disk percentages,
the 1-minute load, the CPU temperature, network receive and send rates summed over counted
interfaces, and disk read and write rates summed over physical disks. Each one is kept as a
time-weighted average and a maximum per bucket.

- **Sampling.** Every collector tick feeds history: once a second while a live stream is open,
  every 10 seconds otherwise. That idle tick already ran for the strip's buffer, so history adds no
  extra reads of the host. Each sample counts for the time since the previous one (capped at 10
  seconds), so a minute that is partly watched isn't dominated by its 1-second samples. The max
  is the highest sample, so it reads a little higher when the minute was watched.
- **Rollup.** `rollup.ts` holds the math as pure functions: bucket boundaries, merging,
  retention cutoffs, range plans, and the response builder. `recorder.ts` keeps the current
  minute in memory. A job writes each finished minute about 2 seconds after it ends, in one
  transaction that also rebuilds that minute's quarter hour from its stored minutes.
- **Storage.** There are two tables keyed by bucket start in milliseconds:
  `metric_history_1m`, kept 48 hours, and `metric_history_15m`, kept 90 days. An hourly job
  prunes them. At full retention they hold about 11,500 rows, roughly 2 MB.
- **Restarts.** Shutdown writes the minute in progress. If the next process starts within the
  same minute, it merges its samples into that row rather than replacing it. Rows are only ever
  upserted by bucket start, and a minute leaves memory only once its transaction commits, so no
  sample is counted twice. A crash loses at most the unwritten minute, which then shows as a gap.
- **Reading.** `GET /api/metrics/history?range=` serves `1h` as 1-minute points, `24h` as
  5-minute points (regrouped from minute rows, 288 points), and `7d` and `30d` as 15-minute
  points. Minutes not yet written are merged in, so the current minute shows up. The response is
  columnar (`ts` plus `avg`/`max` arrays per metric), which is the shape uPlot takes. Buckets with
  no data are left out, and one all-null entry marks each gap so a line chart breaks there.

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
- Categories are rows in their own table (`server/services/category-store.ts`) with a `position`;
  services reference them by `category_id` and carry their own `position` within a category. API
  responses still include the category name as `category` for display and older clients.
- `server/db.ts` and `server/migrations.ts` own SQLite access and schema evolution. Migrations can
  run SQL statements and an optional `up(db)` data step inside one transaction. Runtime startup,
  health, metrics collection, and observability stay in their dedicated `server/` modules.
- `shared/` owns client/server contracts, runtime schemas, URL normalization, service form-data
  handling, and category-order rules.
- Frontend hooks under `src/hooks/` own API-backed services (`useServices`, with optimistic moves),
  categories (`useCategories`, with optimistic renames, deletes and reorders), metrics, and
  dashboard settings.
- `ServicesSection` composes service-management UI. Its filtering, grouping and dialog-selection
  state lives in `services/useServicesSectionState.ts`. Services are grouped by category id
  (`src/lib/board-groups.ts`) and laid out by `board/BoardColumns.tsx`, as balanced columns or
  stacked rows. Outside edit mode the board is plain links (`services/CategorySectionList.tsx`); in
  edit mode the lazily loaded `board/EditableBoard.tsx` adds dnd-kit dragging of cards and
  categories, rename in place, add tiles and card menus.
- `ServiceDialog` coordinates submission and validation. Form and icon-preview state lives in
  `services/useServiceDialogState.ts`, with category, icon, and action controls split into focused
  components.
