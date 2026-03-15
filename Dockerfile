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
