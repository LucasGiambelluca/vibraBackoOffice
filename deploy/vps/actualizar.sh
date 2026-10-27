#!/usr/bin/env bash
# Instala una versión nueva del back office. Uso (como root, en el VPS):
#   /opt/backoffice/actualizar.sh /tmp/backoffice-<version>.tar.gz
# El .tar.gz sale de `git archive` (ver docs/deploy-vps.md). Compila en una carpeta nueva,
# corre las migraciones y recién entonces cambia el enlace `current` y reinicia.
set -euo pipefail
PAQUETE="$1"
VERSION=$(basename "$PAQUETE" .tar.gz | sed 's/^backoffice-//')
RELEASE=/opt/backoffice/releases/$VERSION

rm -rf "$RELEASE"
mkdir -p "$RELEASE"
tar -xzf "$PAQUETE" -C "$RELEASE"
cd "$RELEASE"

set -a; . /opt/backoffice/.env; set +a
npm ci --no-audit --no-fund
NEXT_PUBLIC_BASE_PATH=/backoffice NODE_ENV=production npx next build
# El servidor standalone no trae los estáticos: van al lado.
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
# La caché de imágenes de Next es lo único del código que el servicio puede escribir.
mkdir -p .next/standalone/.next/cache
chown -R backoffice:backoffice .next/standalone/.next/cache

# Backup antes de migrar (por si hay que volver atrás).
mkdir -p /var/backups/backoffice
sudo -u postgres pg_dump -Fc backoffice > "/var/backups/backoffice/antes-de-$VERSION.dump"
npm run db:migrate

ln -sfn "$RELEASE" /opt/backoffice/current
systemctl restart backoffice
sleep 5
curl -fsS -o /dev/null http://127.0.0.1:3002/backoffice/api/salud && echo "OK: $VERSION corriendo"

# Quedan las últimas 3 versiones.
ls -1dt /opt/backoffice/releases/* | tail -n +4 | xargs -r rm -rf
