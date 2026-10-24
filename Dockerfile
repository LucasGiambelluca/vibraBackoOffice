# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

# App: servidor standalone de Next (solo lo que traza el build, sin node_modules completos).
FROM base AS app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 UPLOADS_DIR=/data/uploads
RUN groupadd --system app && useradd --system --gid app app \
  && mkdir -p /data/uploads && chown app:app /data/uploads
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]

# Herramientas: migraciones, seed y worker (necesitan tsx, el código y las migraciones).
FROM deps AS herramientas
ENV NODE_ENV=production
COPY . .
# Con home: npm escribe logs y caché en ~/.npm.
RUN groupadd --system app && useradd --system --create-home --gid app app
USER app
CMD ["npm", "run", "worker"]
