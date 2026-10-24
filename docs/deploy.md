# Deploy en el VPS

VPS Ubuntu 22.04/24.04 con Docker. Todo corre con `docker compose`: Postgres, migraciones, app, worker de recordatorios, Caddy (HTTPS) y backups.

## 1. Primera vez

1. **DNS:** registro A de `DOMINIO` → IP del VPS. Esperar a que resuelva (`dig +short DOMINIO`).
2. **Docker y firewall** (como root o con sudo):

   ```bash
   apt update && apt upgrade -y
   curl -fsSL https://get.docker.com | sh
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
   ```

3. **Código:** clonar el repo privado (con una deploy key de solo lectura o `gh auth login`):

   ```bash
   git clone git@github.com:<usuario>/<repo>.git /opt/vibra
   cd /opt/vibra
   ```

4. **Variables:**

   ```bash
   cp deploy/env.produccion.example .env
   openssl rand -base64 32   # → POSTGRES_PASSWORD
   openssl rand -base64 32   # → BETTER_AUTH_SECRET
   nano .env                 # DOMINIO y los dos secretos (SMTP opcional)
   chmod 600 .env
   ```

5. **Levantar:**

   ```bash
   docker compose up -d --build
   docker compose ps          # migrate: Exited (0); app: healthy; worker, caddy, db, backup: running
   ```

6. **Primer admin:**

   ```bash
   docker compose run --rm migrate npm run db:seed -- tu@email.com "Tu Nombre" 'una-contraseña-larga'
   ```

7. Entrar a `https://DOMINIO` y cambiar la contraseña desde Mi cuenta si hace falta.

## 2. Actualizar

```bash
cd /opt/vibra
git pull
docker compose up -d --build   # corre las migraciones nuevas antes de reiniciar app y worker
```

## 3. Logs

```bash
docker compose logs -f app
docker compose logs -f worker   # recordatorios y, sin SMTP, el texto de los emails
docker compose logs backup
```

## 4. Backups

Cada 24 h en el volumen `backups`: `vibra_<fecha>.dump` (base) y `adjuntos_<fecha>.tar.gz` (PDF). Se conservan 14 días.

**Copiarlos fuera del VPS** (recomendado, al menos semanal) desde tu máquina:

```bash
ssh root@VPS 'cd /opt/vibra && docker compose cp backup:/backups ./backups-export'
scp -r root@VPS:/opt/vibra/backups-export ./backups-vibra
```

**Restaurar** (pisa la base actual):

```bash
docker compose stop app worker
docker compose cp ./vibra_<fecha>.dump db:/tmp/restaurar.dump
docker compose exec db pg_restore -U vibra -d vibra --clean --if-exists /tmp/restaurar.dump
docker run --rm -v vibra_uploads:/data -v "$PWD":/respaldo alpine \
  sh -c 'tar -xzf /respaldo/adjuntos_<fecha>.tar.gz -C /data && chown -R 999:999 /data'
docker compose start app worker
```

(El nombre real del volumen de adjuntos aparece en `docker volume ls`; por defecto `<carpeta>_uploads`, o sea `vibra_uploads` si el repo está en `/opt/vibra`. El `chown` usa el uid del usuario `app` de la imagen: verificarlo con `docker compose exec app id -u`.)

## 5. SMTP

Completar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` en `.env` y `docker compose up -d worker`. Con puerto 465 poner `SMTP_SECURE=true`.
