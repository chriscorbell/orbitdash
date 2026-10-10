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
topic (`metrics`, `host`, `config`, `alerts`, `status`). SSE fits because updates only flow one way. Every successful
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

### Status Checks

Each service can have a status check: off by default, and off for every existing service after an
upgrade, so orbitdash never starts contacting anything on its own. The settings live on the
service row (`check_enabled`, `check_method`, `check_target`, `check_interval`,
`check_ignore_tls`) and travel with the service through the API, duplicates, the trash and
backups. The code is in `server/status/`:

- **Checker** (`checker.ts`). HTTP checks send `HEAD`, and `GET` when the server answers 405 or
  501 or drops the connection. Redirects are followed by hand, up to 5, and only to http(s); a
  redirect anywhere else ends the check with that answer. The body is cancelled as soon as the
  headers arrive, so a check never downloads a page. 2xx, 3xx, 401 and 403 count as up (a login
  wall still means the service answered). TCP checks open a connection with `Bun.connect` and close
  it. There is no ICMP: the container runs with every capability dropped. Each check has one
  10-second deadline for all of its requests, and "allow self-signed certificates" passes
  `tls: { rejectUnauthorized: false }` to Bun's fetch. Errors become short reasons ("Connection
  refused", "Certificate not trusted", "HTTP 503") worked out from the error code only, since
  messages can contain the URL and with it credentials; logs carry the service id and that reason.
- **States** (`state.ts`). `up` answered within 2 seconds, `degraded` answered slower, `down`
  failed, `unknown` not checked yet. A reachable service turns down only after 2 failed checks in a
  row, and the second check comes 15 seconds after the first failure instead of a full interval
  later, so an outage still shows within seconds. A service that was down (or never checked) turns
  down or up on its first result. "Up for 3h" and "Down since 14:02" come from `changed_at`, which
  moves when a service goes down or comes back, not between up and degraded.
- **Scheduler** (`scheduler.ts`). The job runner calls it every second. Each check has a due time;
  due checks start earliest first while fewer than 8 are running, and a finished check frees its
  slot at once. The next run is measured from the start of the last one, moved by up to 10% of the
  interval each time, so checks never fall into lockstep. At startup, first runs spread over up to
  30 seconds, or keep their cadence from the last stored check; a check that was just turned on or
  changed runs within 2 seconds. Config changes (`config.changed` events for layout or all) mark the
  checks for a reload on the next tick. Shutdown aborts running checks and drops their results
  before the database closes.
- **Storage** (`store.ts`, migration 9). `service_status` keeps the current status per service,
  with the target it describes, so a status from an old target is never shown for a new one.
  `status_results` keeps every result for 24 hours and `status_hourly` keeps hourly totals for 30
  days; each check writes its result, its hour's totals and the new status in one transaction. The
  hourly prune job also removes history of services that are gone for good (not in the trash).
- **Reading.** `GET /api/status` lists the current status of every service with checks on, and
  each result is pushed as a `status` event (`null` when a check is turned off or its service is
  deleted). `GET /api/status/:id/history?range=24h|30d` returns 48 half hours from raw results or
  30 days from the hourly totals, with an uptime percentage rounded down so one failure never reads
  as 100%.

In the browser, cards with checks on load `src/components/status/ServiceStatus.tsx` on demand (the
`ServiceStatus-*` chunk), so dashboards without checks don't download it. Statuses are one
TanStack Query cache keyed by service id, kept current by a single `status` subscription and
refetched after the connection drops. Hovering or focusing a card shows the details, which fetch
the 24h history when they open.

### Notifications

`server/notifications/` sends status changes and metric alerts to ntfy, Gotify, Discord and
generic webhooks. The producers know nothing about it: it subscribes to the `status` and `alerts`
topics on the event bus, the same events the browser gets, so the status monitor and alert
evaluator stay as they were.

- **Engine** (`engine.ts`) decides what to say and when, and sends nothing itself. A service that
  goes down opens an incident; its "down" message waits until the outage has lasted the configured
  delay (2 minutes by default), measured from the status's `changedAt`, so a blip says nothing and
  an outage is announced once. The recovery, with the downtime, only follows an announced "down".
  Alerts are announced when they fire (their rules have their own duration) and when they resolve,
  if their firing was. A tick every 10 seconds sends delayed "down"s.
- **Quiet hours** hold messages instead of dropping them, because the point is not being woken up,
  not missing that a service has been down since 3am. Held events are merged per service or alert,
  and the first tick after the window ends sends each channel one summary of the events it would
  have received. The window is read in the configured IANA zone, or the server's.
- **Incidents** (`notification_incidents`, migration 12) record each open outage and when it was
  announced, so a restart neither repeats a "down" nor forgets one that is due. At startup,
  incidents whose service is no longer down or checked are dropped. Alerts need no such record:
  the alert service closes alerts left firing by a previous run without events.
- **Delivery** (`deliver.ts`, `channels.ts`). `channels.ts` builds each type's request as a pure
  function (ntfy's JSON publishing, Gotify's message API, a Discord embed with mentions off, the
  versioned webhook payload). `deliver.ts` posts it with a 10-second `AbortSignal.timeout` and
  retries network errors, timeouts, 429 and 5xx twice (1 and 4 seconds, longer if `Retry-After`
  asks, up to 15). Redirects are not followed, so credentials only go to the configured host.
  Messages to one channel go out one at a time, in order. Shutdown aborts deliveries in flight and
  drops their results before the database closes.
- **Secrets.** Channels and options are JSON in `settings` (`notifications.channels`,
  `notifications.options`), which puts them in backups. `channel-config.ts` masks every secret in
  API responses, to editors and guests alike, and merges updates so that a secret left out (or sent
  back as its mask) keeps the stored value. Errors are described from status codes and error codes
  only, and logs carry the channel id and that short reason, never a URL or token. A test also
  returns the receiver's own `message` or `error` field (shortened) to whoever pressed the button;
  the delivery log keeps only the short reason.
- **Log.** `notification_deliveries` keeps the newest 50 deliveries for the settings section.

In the browser the section is its own lazy chunk (`NotificationSettings-*`), loaded when the
settings page opens its Notifications section. Its zod/mini response schemas live in `src/lib/api/notifications.ts` and use a
plain union rather than `discriminatedUnion`, which would pull more of zod into the first-paint
`validation` chunk.

### Links, Tags And Bulk Edits

A service keeps its `url` as the main link: the one for your own network, and what status checks
reach unless they have a target of their own. Migration 11 adds three columns to `services`:

- `external_url`, nullable, normalized like `url` (`shared/urls.ts`).
- `links`, a JSON array of up to 5 `{ label, url }` pairs (`shared/service-links.ts`).
- `tags`, a JSON array of up to 10 lowercase, single-spaced, unique strings (`shared/tags.ts`).

Links and tags are small lists on the row rather than tables of their own. Nothing queries them on
the server (the palette searches in the browser), and on the row they travel with the service for
free: the trash keeps the whole row as JSON, duplicates copy it, and backups export it. CHECK
constraints keep both columns JSON arrays. The zod-free rules in `shared/service-links.ts` and
`shared/tags.ts` are what the service form checks before saving and what the server's schemas and
backup import apply, so both sides reject the same input. Multipart requests carry the two lists
as JSON strings (`shared/service-form-data.ts`).

Which URL a card opens is decided in the browser (`src/lib/link-target.ts`). The
`layout.linkPreference` setting is `auto`, `internal` or `external`; like any layout setting it can
be a per-device override. For `auto`, `isPrivateHostname` looks at `window.location.hostname`:
loopback, RFC 1918 and CGNAT (Tailscale) IPv4, IPv6 loopback, unique-local and link-local
addresses, single-label names and the usual private suffixes count as your own network and open
`url`; anything else opens `external_url`, falling back to `url`. The command palette opens the
same URL as the cards.

Cards stay plain links. A card with named links or an external URL is wrapped in a `group` with a
sibling menu button (a link can't contain a button), loaded on demand as the
`ServiceLinksMenu-*` chunk. It appears in place of the status dot on hover or keyboard focus and
always shows on touch screens, where the card makes room for it. In edit mode the same items
(`ServiceLinkItems`) sit in the card's actions menu, together with an Open item.

Edit mode keeps a selection of card ids (`src/lib/board-selection.ts`: single toggles, shift-click
runs in board order, whole categories). The bulk bar sends one request per action:
`POST /api/services/bulk/move`, `/bulk/delete`, `/bulk/restore` and `/bulk/checks`, each with
`{ ids }`. `server/services/service-bulk.ts` runs each in one transaction, skips ids that no longer
exist (404 only when none match), and answers with every service (or the delete summary), which the
browser writes straight into the services cache. Since each is one request, each publishes one
`layout` config event. Moves append to the target category in board order and leave services that
are already there in place. Bulk delete uses the same 30-minute trash as single deletes, and
restore puts services back lowest position first so a category's order comes back intact. The bulk
API client and its cache updates (`board/useBulkServiceActions.ts`) live with the lazy editor.

### Docker And Discovery

`server/docker/` reads containers from the Docker Engine API. `client.ts` finds Docker through
`ORBITDASH_DOCKER_HOST`, then `DOCKER_HOST`, then a socket mounted at `/var/run/docker.sock`; `off`
turns it off. The documented setup is a docker-socket-proxy that only allows reads
(`CONTAINERS=1 EVENTS=1 POST=0`), since a mounted socket grants full control of the host. orbitdash
never starts, stops or changes a container.

- **Monitor** (`monitor.ts`) lists containers every 30 seconds, reads CPU and memory every 15
  seconds (4 containers at a time), and follows `/events` so a start or stop shows within a second;
  bursts of events are debounced into one refresh, and the stream reconnects with backoff. Each
  change is published on the `containers` topic and kept as the latest snapshot for
  `GET /api/docker`, the Docker integration and `/metrics`.
- **Labels** (`containers.ts`) are trimmed to the ones discovery reads before they leave the
  module: `orbitdash.*`, `homepage.*` except `homepage.widget.*` (Homepage keeps API keys there),
  and the Compose service name.
- **Discovery** (`discovery.ts`) suggests running containers that aren't on the dashboard yet:
  labeled ones first, then ones publishing a web port. A container drops out once a service uses
  its link or port, when it's dismissed (`settings` key, so it survives restarts and backups), or
  when it opts out with `orbitdash.enable=false`. Icons resolve the way imports do (a label, else
  the container's name in the icon library), and adding one is an ordinary service create.

In the browser the containers tile and card load on demand, and the discovery banner only asks once
Docker is configured.

### Integrations

An integration reads a few figures from an app's own API and shows them on its card. Adapters live
in `server/integrations/adapters/`, one file per app, and only describe their fields and turn an
HTTP response into figures; `docs/integrations.md` is the contract for writing one. Around them:

- **Settings** are stored per service under `integration.<serviceId>`. Fields marked secret are
  encrypted with AES-256-GCM using `<data>/secret.key` (created on first use, mode 600), so a
  backup alone doesn't hand out API keys, and API responses only say whether a secret is set.
- **HTTP** (`http.ts`) gives adapters relative requests against the service's URL with an 8-second
  deadline, a 4 MB cap, optional self-signed TLS and the same error-code-only messages as status
  checks.
- **Poller** (`poller.ts`) only polls while someone is looking: a browser subscribed to the
  `integrations` topic keeps the cards it shows active for 5 minutes, and readings go out as
  `integration` events. A dashboard nobody has open makes no requests.

In the browser the lazy `IntegrationLayer` subscribes for the cards on screen and fills a small
external store (`src/lib/integration-readings.ts`); cards read it with `useSyncExternalStore`, so
they need no query client. The service dialog's integration field tests a draft before it's saved.

### Widgets

The clock, weather and agenda widgets sit in a row above the board or as pills in the header
(`widgets.placement`). The clock runs in the browser. Weather and calendars go through the server
(`server/widgets/`), so browsers never contact third parties and feed URLs, which often carry
private tokens, stay on the server:

- **Weather** comes from Open-Meteo, which needs no API key. Forecasts are cached for 10 minutes
  and place searches for a day, keyed by rounded coordinates.
- **Agenda** feeds (`widgets.agenda.feeds` in `settings`) are checked when added and downloaded at
  most every 15 minutes. `ical.js` expands recurring events across the chosen range. The API lists
  feeds without their URLs.

### Importing

`server/importers/` reads Homepage, Dashy, Homer and Homarr configs, browser bookmark exports and
orbitdash seed files. `formats.ts` detects the format and parses it into groups of services without
touching the database; `service.ts` previews them (resolving icons, flagging links already on the
dashboard) and applies the picked ones after taking a `pre-import` backup snapshot. The same path
seeds an empty dashboard from `ORBITDASH_SEED_FILE` (or `<data>/seed.yaml`) once on first start.

### Prometheus

`GET /metrics` (outside `/api`) serves host metrics, service checks, containers and the firing alert
count in the text exposition format. It's off unless `ORBITDASH_PROMETHEUS=true`. With
`ORBITDASH_PROMETHEUS_TOKEN` set it needs that bearer token; while sign-in is on it refuses to
answer without one, since a scraper can't hold a session. It reads the latest snapshots and never
starts a collection of its own.

### Settings Page

Settings are a page at `/settings/<section>` (`src/components/settings/SettingsPage.tsx`), loaded
lazily with its sections. The section list in `settings-sections.ts` is the one place that names
them; the page validates the path and falls back to General. Guests never see it.

### Installable App And Offline Shell

orbitdash ships a web app manifest (`public/manifest.webmanifest`, icons in `public/icons/` made by
`scripts/generate-pwa-icons.mjs`) and a small hand-written service worker, so it can be installed
on phones and desktops and still opens, with the last known services, categories and settings,
while the server is unreachable. Browsers only allow both on https or localhost; over plain http the
app works as before.

The worker is about 4 kB and has no dependencies. Workbox (through `vite-plugin-pwa`) was the
alternative, but it adds a second bundler toolchain (Rollup, Babel, terser) to the dev
dependencies and a larger runtime for the handful of rules orbitdash needs. The pieces:

- `src/sw/routes.ts` decides how each request is handled, `src/sw/strategies.ts` holds the
  network-first, cache-first and stale-while-revalidate strategies, and `src/sw/respond.ts` ties
  them together. All three are pure enough to unit test with a fake Cache.
- `scripts/vite-service-worker.ts` bundles `src/sw/service-worker.ts` on its own during
  `vite build` and writes it to `dist/sw.js` with the build's precache list (`src/sw/precache.ts`:
  index.html, every script and stylesheet including the lazy chunks, and the Latin fonts) and a
  version hash of those files. `tsconfig.sw.json` type-checks it with worker globals.
- Page loads and the dashboard's JSON (`/api/services`, `/api/categories`, `/api/settings*`) are
  network first. They fall back to the cache when the network fails, answers 5xx, or takes longer
  than 4 seconds, and after one fallback the cache answers at once for 10 seconds. Hashed
  `/assets/*` and wallpapers are cache first, icons stale-while-revalidate. Non-GET requests, the
  event stream, metrics, statuses and `/api/system` (live uptime) always go to the network, and
  nothing marked `no-store` is cached.
- Updates: each build changes `sw.js`, which the server sends with `Cache-Control: no-cache`. The
  new worker precaches its build, calls `skipWaiting()` and `clients.claim()`, and deletes the
  previous build's cache. Pages load network first, so the next load is always the new build, and
  the app also checks for a new worker when it comes back into view. An open page that asks for a
  lazy chunk the new deploy no longer has reloads into the new build (`vite:preloadError`).
- `src/lib/pwa.ts` registers the worker in production builds only, imported after the page's load
  event so it stays out of the entry chunk; development unregisters any worker a production build
  left on the same origin.

### Optional Authentication

Auth is off by default and configured only through environment variables, read and validated once
at startup (`server/auth/config.ts`); an invalid setup stops the server before it touches the data
directory. Settings can't change it, so nobody can switch it off from the dashboard. There are
three modes: `none`, `password` (one shared password, argon2id through `Bun.password`), and
`proxy` (a trusted reverse proxy names the user in a header). `ORBITDASH_GUEST=view` adds a
read-only view for anyone without a session.

- `server/auth/http.ts` holds the `/api/*` middleware, which runs after the same-origin guard. It
  lets health and the auth routes through, gives guests GET and HEAD (backups excepted), and
  answers everything else with 401 (or 403 for guests) and the auth state, so the browser knows
  whether to show sign-in or go read-only. The page and its scripts stay public.
- Trust decisions use the socket's address (Bun's `server.requestIP`, which `server/index.ts`
  passes to Hono as env), never `X-Forwarded-For`. Only when the peer is in
  `ORBITDASH_TRUSTED_PROXIES` do the proxy user header, `X-Forwarded-For` (for the client's address
  in rate limits and logs) and `X-Forwarded-Proto` (for the cookie's `Secure` flag) count.
  `server/auth/ip.ts` parses and matches IPv4 and IPv6 CIDRs; IPv4-mapped IPv6 addresses count as
  IPv4.
- Password sessions (`server/auth/sessions.ts`) are random 32-byte tokens in an `HttpOnly`,
  `SameSite=Lax` cookie. The `sessions` table stores a SHA-256 of each token, its expiry, and the
  credential id it was created under. `auth_state` holds the argon2 hash in force (a plain
  `ORBITDASH_PASSWORD` is hashed into it) and a random credential id, both reused while the
  configured password still matches, so sessions survive restarts. A new password gets a new id,
  which ends older sessions. Expiry slides with use, written at most once an hour. Neither table is
  part of backup exports. Logout deletes the session, and an open event
  stream checks its session on each keep-alive and closes once it is gone.
- Login is rate limited per client address in memory (`server/auth/rate-limit.ts`, 5 failures per
  15 minutes). Each attempt counts before the argon2 check runs, so parallel guesses can't slip
  past the limit, and an empty password costs the same check as a wrong one.
- In the browser, `AuthGate` (`src/components/auth/`) asks `GET /api/auth/session` first. The last
  answer is kept in localStorage so the dashboard renders at once and offline. The sign-in screen
  is a lazy chunk. The API client hands the auth state of any 401 or 403 to `useAuthSession`, and a
  dropped event stream triggers a fresh check, so an expired session leads back to sign-in from
  wherever it was noticed. Guests get the dashboard without add, edit, settings or the service
  dialogs. Signing out also clears the service worker's cached data.

### Shared Types And Schemas

Shared TypeScript types define API contracts used on both client and server. Shared runtime schemas
in `shared/schemas.ts` enforce those contracts at runtime for server request parsing and frontend
form validation.

## Current Boundaries

- `server/app.ts` assembles the Hono application. Files under `server/routes/` translate HTTP
  requests and responses but delegate service behavior to `server/services/`.
- `server/services/service-payloads.ts` parses service request bodies,
  `service-operations.ts` owns service CRUD behavior, `service-bulk.ts` the edit mode's bulk
  actions, and `icon-storage.ts` owns icon validation, download, and persistence.
- Categories are rows in their own table (`server/services/category-store.ts`) with a `position`;
  services reference them by `category_id` and carry their own `position` within a category. API
  responses still include the category name as `category` for display and older clients.
- `server/db.ts` and `server/migrations.ts` own SQLite access and schema evolution. Migrations can
  run SQL statements and an optional `up(db)` data step inside one transaction. Runtime startup,
  health, metrics collection, and observability stay in their dedicated `server/` modules.
- `server/status/` owns status checks: the checker, the scheduler, state rules, storage and the
  monitor that wires them to the database and the event bus. `server/routes/status.ts` only reads
  from the monitor.
- `server/docker/` owns the Docker client, the container monitor and discovery;
  `server/integrations/` the adapters, their encrypted settings and the poller;
  `server/importers/` file formats and imports; `server/widgets/` weather and calendar feeds.
- `server/notifications/` owns notifications and only listens to the event bus; the status monitor
  and alert evaluator don't know it exists. `server/routes/notifications.ts` translates HTTP and
  delegates to `notifications` in `service.ts`.
- `shared/` owns client/server contracts, runtime schemas, URL normalization, service form-data
  handling, category-order rules, the status check rules both sides use (`shared/status.ts`), and
  the notification rules (`shared/notifications.ts`: quiet-hour windows, URL checks, masks).
- Frontend hooks under `src/hooks/` own API-backed services (`useServices`, with optimistic moves),
  categories (`useCategories`, with optimistic renames, deletes and reorders), metrics, and
  dashboard settings.
- `ServicesSection` composes service-management UI. Its filtering, grouping and dialog-selection
  state lives in `services/useServicesSectionState.ts`. Services are grouped by category id
  (`src/lib/board-groups.ts`) and laid out by `board/BoardColumns.tsx`, as balanced columns or
  stacked rows. Outside edit mode the board is plain links (`services/CategorySectionList.tsx`),
  with a lazy links menu beside cards that have extra links; in edit mode the lazily loaded
  `board/EditableBoard.tsx` adds dnd-kit dragging of cards and categories, rename in place, add
  tiles, card menus, and selection with the bulk bar.
- `ServiceDialog` coordinates submission and validation. Form and icon-preview state lives in
  `services/useServiceDialogState.ts`, with category, tags, icon, links, status check, and action
  controls split into focused components.
