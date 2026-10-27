#!/usr/bin/env bash
# Backup diario del back office: base (pg_dump) + archivos subidos. Guarda 14 días.
# Cron de root: 30 7 * * * /opt/backoffice/backup.sh >> /var/log/backoffice-backup.log 2>&1
set -euo pipefail
DESTINO=/var/backups/backoffice
FECHA=$(date -u +%Y-%m-%dT%H%M)
mkdir -p "$DESTINO"
chmod 700 "$DESTINO"
sudo -u postgres pg_dump -Fc backoffice > "$DESTINO/base-$FECHA.dump"
tar -czf "$DESTINO/archivos-$FECHA.tar.gz" -C /opt/backoffice uploads
find "$DESTINO" -type f -mtime +14 -delete
echo "$FECHA ok: $(du -sh "$DESTINO" | cut -f1)"
