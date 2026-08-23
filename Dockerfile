# Install all dependencies needed to build the app.
FROM oven/bun:1.4.0 AS deps

WORKDIR /app

COPY package.json bun.lock* ./
COPY scripts/prepare-git-hooks.mjs ./scripts/prepare-git-hooks.mjs
RUN bun install --frozen-lockfile

# Install only production dependencies for the runtime image.
FROM oven/bun:1.4.0 AS prod-deps

WORKDIR /app

COPY package.json bun.lock* ./
COPY scripts/prepare-git-hooks.mjs ./scripts/prepare-git-hooks.mjs
RUN bun install --frozen-lockfile --production

# Build stage
FROM deps AS builder

WORKDIR /app

# Copy only the files needed for the production build to keep cache hits stable.
COPY package.json bun.lock* ./
COPY index.html ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.server.json ./
COPY vite.config.ts ./
COPY public/ ./public/
COPY server/ ./server/
COPY shared/ ./shared/
COPY src/ ./src/

RUN bun run build

# Production stage
FROM oven/bun:1.4.0-slim

WORKDIR /app

COPY package.json bun.lock* ./
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy server source, shared modules, and TS config for Bun path aliases
COPY server/ ./server/
COPY shared/ ./shared/
COPY tsconfig.json ./tsconfig.json

# Copy built frontend assets (Vite copies public/ into dist/ during the build)
COPY --from=builder /app/dist ./dist

# Create the data directory writable by the unprivileged bun user (uid 1000)
RUN mkdir -p /data && chown bun:bun /data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER bun

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["bun", "-e", "const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/healthz`); process.exit(res.ok ? 0 : 1)"]

CMD ["bun", "server/index.ts"]
