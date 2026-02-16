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

## Preview

<img src=".github/images/preview.png" alt="Screenshot of the app" /> 

## Features

- Live CPU/RAM/Disk metrics with charts
- Simple service links with icons and categories
- Upload your own PNG/SVG icons, or alternatively enter a URL that points to a PNG/SVG on [dashboardicons.com](https://dashboardicons.com)
- Inline search and filtering
- UI-native service management (no config file needed)
- Toggle between 3-column and 4-column grid for service links

## Platform Support

- x86_64 (AMD64)
- arm64 (including Apple Silicon via Docker Desktop)

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

## Data Persistence

All data is stored under `/data` inside the container:

- `orbitdash.db` (SQLite database)
- `icons/` (uploaded/downloaded service icons)

The docker run/compose examples above bind-mount `/data` to `./orbitdash-data` in the current working host directory. You can change this to a different location on the host, or alternatively map to a volume instead if desired.

## Contributing

Issues and PRs are welcomed. Please include description, screenshots and any related logs.