# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build

WORKDIR /app

# pnpm 10 is declared by the workspace packageManager field.
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY apps apps
COPY packages packages
COPY examples examples
COPY README.md ./

# The server serves apps/web/dist in production.
RUN pnpm build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    MOCK_HOST=0.0.0.0 \
    MOCK_PORT=3000 \
    MOCK_DB_PATH=/app/data/mock.db \
    MOCK_WEB_DIST=/app/apps/web/dist

WORKDIR /app

RUN corepack enable && mkdir -p /app/data

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages

VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["pnpm", "start"]
