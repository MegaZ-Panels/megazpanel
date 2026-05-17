# MegaZPanel backend — Bun + Prisma
# Produces a small image suitable for the prod compose file.

FROM oven/bun:1.1.34-debian AS deps
WORKDIR /app
COPY backend/package.json backend/bun.lockb* backend/bunfig.toml ./
RUN bun install --frozen-lockfile --production || bun install --production

FROM oven/bun:1.1.34-debian AS prisma
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY backend/prisma ./prisma
RUN bun x prisma generate

FROM oven/bun:1.1.34-debian
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

# Postgres client for pg_dump (used by database backups)
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system bun && useradd --system --gid bun --create-home bun \
    && mkdir -p /app && chown -R bun:bun /app

COPY --chown=bun:bun --from=prisma /app/node_modules /app/node_modules
COPY --chown=bun:bun backend ./

USER bun
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["bun", "src/main.ts"]
