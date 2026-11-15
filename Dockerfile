FROM node:24-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

# Build the frontend with every dependency.
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY index.html vite.config.ts tsconfig.json ./
COPY public/ ./public/
COPY shared/ ./shared/
COPY src/ ./src/
RUN pnpm build

# The server needs only its own two dependencies.
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server/ ./server/
COPY shared/ ./shared/
RUN rm -f server/*.test.ts && mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server/index.ts"]
