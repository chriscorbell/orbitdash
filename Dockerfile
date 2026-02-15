# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build frontend
RUN bun run build

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Install production dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy server source and shared types
COPY server/ ./server/
COPY src/shared/ ./src/shared/

# Copy built frontend assets
COPY --from=builder /app/dist ./dist

# Copy public assets (logo etc.)
COPY public/ ./dist/

# Create data directory
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3000
ENV ORBITDASH_DATA_DIR=/data

EXPOSE 3000

CMD ["bun", "server/index.ts"]
