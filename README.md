<p align="center">
  <img src=".github/images/logo.svg" alt="orbitdash - yet another modern server dashboard" width="320">
</p>

<p align="center">
  <a href="https://github.com/chriscorbell/orbitdash/actions/workflows/docker-publish.yml?branch=main" target="_blank">
    <img title="GitHub Actions" src="https://github.com/chriscorbell/orbitdash/actions/workflows/docker-publish.yml/badge.svg?branch=main">
  </a>
</p>

<br/>

<p align="center">
  <b>orbitdash</b> is <i>yet another</i> modern server dashboard, <br>inspired by <a href="https://github.com/MauriceNino/dashdot" target="_blank">dashdot</a>, <a href="https://github.com/bastienwirtz/homer" target="_blank">homer</a> and <a href="https://github.com/ajnart/homarr" target="_blank">homarr</a>.
</p>

<p align="center">
  It is intended for use on home/private servers.
</p>

<p align="center">
  Built with TypeScript, React, TailwindCSS, shadcn/ui, Vite, Bun, Hono and SQLite.
</p>

<p align="center">
  <a href="https://github.com/chriscorbell/orbitdash/pkgs/container/orbitdash" target="_blank">Container Image (GHCR)</a>
</p>

Container tags follow three channels:

- `latest` and `main` are rolling tags updated from every validated push to `main`, except
  documentation-only changes.
- `sha-<commit>` identifies the build produced from one Git commit.
- `vX.Y.Z` identifies a stable release whose tag matches the version in `package.json`.

For an immutable deployment or rollback, pin the manifest digest as
`ghcr.io/chriscorbell/orbitdash@sha256:<digest>`; registry tags can be republished.

`package.json` is the single source for stable release versions. Its initial `0.0.0` value means
that no stable release has been cut yet; the first release PR replaces it with the chosen semantic
version before creating the matching tag.

## Preview

<img src=".github/images/preview.png" alt="Screenshot of the app" />

## Features

- Live CPU, memory and disk usage in a compact strip with sparklines
- A Stats page: per-core load, memory, network, disk activity, storage per mount and temperatures, live or over the last hour, day, week or month
- Simple service links with icons and categories; dark icons get a light plate automatically
- Upload your own PNG/SVG icons, or alternatively enter a direct URL to a PNG or SVG icon
- A command palette (⌘K, `/`, or just start typing): open services, run actions, or search the web with DuckDuckGo, Google, Bing, Brave or your own SearXNG
- UI-native service management (no config file needed)
- Categories as balanced columns or stacked rows, with compact, card or tile styles
- Edit mode: drag cards and categories, rename categories in place, add services to a category
- A wallpaper with blur and dim, your own dashboard name, an accent-colored favicon, and custom CSS
- Settings follow you across browsers, with optional per-device overrides (e.g. a wall tablet)
- Collapse category sections with saved per-browser state
- Export and import everything as one file, with automatic nightly and pre-upgrade snapshots
- Deleting a service can be undone for 30 minutes
- Installable as an app on phones and desktops, and opens with your last known services while the
  server is unreachable (needs https, see below)

## Platform Support

- x86_64
- aarch64

## Installation Options

#### Docker Run

```bash
docker run -d \
  --name orbitdash \
  --restart unless-stopped \
  -p 7770:3000 \
  -v ./orbitdash-data:/data \
  ghcr.io/chriscorbell/orbitdash:latest
```

#### Docker Compose

```yaml
services:
  orbitdash:
    container_name: orbitdash
    image: ghcr.io/chriscorbell/orbitdash:latest
    restart: unless-stopped
    ports:
      - "7770:3000"
    volumes:
      - ./orbitdash-data:/data
```

After deployment, the dashboard is accessible at `http://<IP-ADDRESS>:7770`.

Change `7770` in the docker run/compose examples above if you want to serve the dashboard on a different port.

## Install As An App

Browsers only allow installing a web app, and keeping it available offline, over https (or on
`localhost`). Put orbitdash behind a reverse proxy with a certificate, or use something like
`tailscale serve`, then:

- iPhone and iPad: open it in Safari, tap Share, then Add to Home Screen.
- Android: open it in Chrome and tap Install app (or Add to Home screen) in the menu.
- Desktop Chrome or Edge: use the install icon in the address bar.

The installed app opens full screen. When the server can't be reached, it still opens with the last
services, categories and settings it saw; live stats come back once the server does. Over plain
http everything else works the same, just not installed or offline.

## Data Persistence

All data is stored under `/data` inside the container:

- `orbitdash.db` (SQLite database)
- `icons/` (uploaded/downloaded service icons)
- `wallpapers/` (uploaded wallpapers; ones no setting uses are cleaned up after an hour)
- `backups/` (automatic snapshots, the newest 7 by default; see `ORBITDASH_BACKUP_KEEP`)

The docker run/compose examples above bind-mount `/data` to `./orbitdash-data` in the current working host directory. You can change this to a different location on the host, or alternatively map to a volume instead if desired.

The container runs as the unprivileged `bun` user (uid 1000). A bind-mounted data directory must be
writable by that uid — if Docker created it as root, fix it once with `chown -R 1000:1000 ./orbitdash-data`.
Named volumes inherit the correct ownership automatically.

Outside Docker, orbitdash stores data in `./data` by default. You can override the storage path in any environment with `ORBITDASH_DATA_DIR=/path/to/data`.

For backup and restore steps, including SQLite WAL files and icon assets, see
[docs/backup-restore.md](docs/backup-restore.md).

The backend listens on port `3001` by default outside the container. Override it with `PORT=<port>`.

The disk metric uses `/` by default. Override it with `ORBITDASH_DISK_PATH=/path/to/mount` when you
need to track a different mount. With `ORBITDASH_HOST_ROOT` set (see below), this is a path on the
host, and the default `/` is the host's root filesystem.

Logs are JSON lines on stdout/stderr. `LOG_LEVEL` sets the minimum level written: `debug`, `info`
(default), `warn` or `error`. Successful health checks, icon and asset requests, and the live
event streams are logged at `debug`; other successful requests at `info`; 4xx responses at `warn`;
5xx responses at `error`.

## Host Metrics

orbitdash reads metrics straight from the kernel's `/proc` and `/sys`; there is no agent to install.
It collects:

- **CPU**: total and per-core usage, load average, frequency, and the CPU temperature
- **Temperatures**: hwmon sensors (`coretemp`, `k10temp`, NVMe drives and others), or thermal zones
  where there are none
- **Memory**: used, available, cache and swap
- **Filesystems**: size and use of every local filesystem; virtual, network, snap and container
  filesystems are left out
- **Disk I/O**: read and write rates per physical disk
- **Network**: receive and send rates per interface; loopback, Docker, bridge and VM interfaces are
  left out

`GET /api/metrics/host` returns the latest reading, and `GET /api/events?topics=host` streams a new
one every second. `GET /api/system` returns the hostname, OS, kernel, CPU model and uptime.
Anything that can't be read on a platform (macOS, or a restricted container) is left out rather
than failing.

orbitdash also keeps history, even when nobody has the dashboard open. It stores CPU, memory,
disk, load, CPU temperature, network and disk I/O at 1-minute resolution for 48 hours and
15-minute resolution for 90 days, which comes to about 2 MB in the data directory.
`GET /api/metrics/history?range=1h|24h|7d|30d` returns the average and peak of each metric per
point: 1-minute points for `1h`, 5-minute points for `24h`, and 15-minute points for `7d` and `30d`.

### Seeing the host from Docker

Inside a container, orbitdash already sees the host's CPU, memory, temperatures and disk I/O. It
only sees its own network interfaces, its own mounts and its image's OS name. To show the host's,
mount the host's root filesystem read-only and point `ORBITDASH_HOST_ROOT` at it:

```yaml
services:
  orbitdash:
    container_name: orbitdash
    image: ghcr.io/chriscorbell/orbitdash:latest
    restart: unless-stopped
    ports:
      - "7770:3000"
    environment:
      - ORBITDASH_HOST_ROOT=/mnt/host
    volumes:
      - ./orbitdash-data:/data
      - /:/mnt/host:ro
```

With `docker run`, add `-e ORBITDASH_HOST_ROOT=/mnt/host -v /:/mnt/host:ro`.

orbitdash then reads the host's `/proc`, `/sys`, mount table, `/etc/hostname` and `/etc/os-release`
under `/mnt/host`. The mount is read-only and the container still runs as its unprivileged user:
it needs no `privileged: true` and no extra capabilities. Use `/:/mnt/host:ro,rslave` instead if
drives you mount after the container starts should show up too.

If you only need the host's network interfaces, `network_mode: host` works without the mount.
Docker then ignores `ports:`, and the dashboard listens on the host's port `3000` (change it with
`PORT`).

## Health Checks

- `GET /healthz` returns liveness for process-level checks.
- `GET /readyz` returns readiness for deployment and CI probes, including a SQLite connectivity check.
- `GET /api/health` returns the same readiness payload as `readyz` for API-oriented clients.

## Deployment Verification

After deploying or upgrading the container, verify the service with:

```bash
curl --fail http://127.0.0.1:7770/healthz
curl --fail http://127.0.0.1:7770/readyz
```

Also confirm that:

- the host directory or volume mapped to `/data` is intact
- the expected host port is mapped to container port `3000`
- persisted services and icons still load after the restart

To roll back, resolve the previous `vX.Y.Z` or `sha-<commit>` image to its manifest digest, pin
`ghcr.io/chriscorbell/orbitdash@sha256:<digest>`, restart the container, and repeat the health
checks. Image rollback does not reverse database changes; keep a data backup from before each
upgrade.

## Testing

Use the following commands for the initial automated test workflow:

```bash
npm run test:e2e:install
npm run format
npm run format:check
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm test -- --run
npm run test:coverage
```

Run `npm run test:e2e:install` once per machine before the first browser smoke test so Chromium is
available locally.

Formatting is enforced with Prettier. Use `npm run format` locally to normalize files and
`npm run format:check` to run the same check that CI uses.

The coverage gate reports shared, frontend, and server scopes separately. Shared runtime modules
remain at 100%; focused frontend application code and loaded server production modules use
baseline thresholds derived from their existing behavior tests. See [CONTRIBUTING.md](CONTRIBUTING.md#test-strategy)
for exact scope and thresholds.

## Validation Rules

Shared runtime validation now lives in `shared/schemas.ts` and is used by both the server routes
and the service dialog submit path. The current canonical rules are:

- service names are required after trimming
- service URLs must normalize to valid `http` or `https` URLs
- icon URLs, when provided, must normalize to valid `http` or `https` URLs
- remote icon downloads are limited to 2 MB, time out after 5 seconds, and verify the downloaded
  bytes match a supported image format
- category and description fields are trimmed and normalized to `null` when empty
- the `Uncategorized` section cannot be manually included in saved category ordering
- metrics `window` must be a positive integer and is bounded to 60 seconds (the sample retention period)
- metric history `range` must be `1h`, `24h`, `7d` or `30d` (default `1h`)

## Contributing

Issues and PRs are welcomed. Please include description, screenshots and any related logs.

For local workflows and project conventions, see [CONTRIBUTING.md](CONTRIBUTING.md),
[docs/architecture.md](docs/architecture.md), and [docs/release-checklist.md](docs/release-checklist.md).
