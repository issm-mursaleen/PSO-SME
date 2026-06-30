# ── deps ──────────────────────────────────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` is intentionally avoided: optionalDependencies for native-binding
# packages (lightningcss/@tailwindcss/oxide's per-platform + WASM fallback
# variants) aren't fully recorded in a lockfile generated on Windows, which
# trips npm ci's strict lockfile-completeness check even though the install
# itself resolves correctly. `npm install` still respects package-lock.json's
# pinned versions, it just doesn't hard-fail on that platform-optional gap.
RUN npm install

# ── build ─────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so this
# must be a host-reachable URL (the browser calls it directly) — not the
# in-network service name. Override with --build-arg if the backend isn't on
# localhost:8001.
ARG NEXT_PUBLIC_API_URL=http://localhost:8001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ── runtime ───────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
# .next/standalone already contains a minimal server.js + only the
# node_modules it actually needs (requires next.config.ts: output:'standalone').
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
