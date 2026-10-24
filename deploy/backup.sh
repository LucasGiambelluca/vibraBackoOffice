#!/usr/bin/env bash
# Backup diario: dump de Postgres + adjuntos. Conserva 14 días en el volumen `backups`.
set -uo pipefail

DIAS=14

while true; do
  fecha=$(date +%Y-%m-%d_%H%M)
  if pg_dump -h db -U vibra -d vibra -Fc -f "/backups/vibra_${fecha}.dump" \
    && tar -czf "/backups/adjuntos_${fecha}.tar.gz" -C /uploads .; then
    echo "[backup] ok ${fecha}"
  else
    echo "[backup] FALLÓ ${fecha}" >&2
  fi
  find /backups -type f -mtime "+$((DIAS - 1))" -delete
  sleep 86400
done
