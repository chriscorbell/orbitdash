# Install all dependencies needed to build the app.
FROM oven/bun:1 AS deps

WORKDIR /app

COPY package.json bun.lock* ./
COPY scripts/prepare-git-hooks.mjs ./scripts/prepare-git-hooks.mjs
RUN bun install --frozen-lockfile

# Install only production dependencies for the runtime image.
FROM oven/bun:1 AS prod-deps

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
FROM oven/bun:1-slim

WORKDIR /app

COPY package.json bun.lock* ./
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy server source, shared modules, and TS config for Bun path aliases
COPY server/ ./server/
COPY shared/ ./shared/
COPY tsconfig.json ./tsconfig.json

# Copy built frontend assets
COPY --from=builder /app/dist ./dist

# Copy public assets (logo etc.)
COPY public/ ./dist/

# Create data directory
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "server/index.ts"]
