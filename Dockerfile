# syntax=docker/dockerfile:1

# ── Base: Node 22 + OpenSSL (exigido pelo motor de migrações do Prisma) ──
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ── Builder: instala tudo, gera o Prisma Client e compila ────────────────
# Também é a imagem usada pelo serviço "migrate" do docker compose.
FROM base AS builder
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# ── Runtime: só as dependências de produção e o código compilado ─────────
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean
COPY --from=builder /app/dist ./dist
USER node
EXPOSE 7000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3333) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]
