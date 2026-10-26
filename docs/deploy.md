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

Antes de cada actualización: anotar la versión actual y sacar un backup de la base, por si hay que volver atrás.

```bash
cd /opt/vibra
git rev-parse --short HEAD > ../vibra-version-anterior   # la versión que está corriendo
docker compose exec backup pg_dump -h db -U vibra -d vibra -Fc -f /backups/antes-de-actualizar.dump
git pull
docker compose up -d --build   # corre las migraciones nuevas antes de reiniciar app y worker
docker compose ps              # app: healthy
```

Probar el login y una pantalla de presupuestos. Si algo anda mal, ir a **Volver a la versión anterior**.

## 3. Volver a la versión anterior (rollback)

**Si la actualización no traía migraciones nuevas** (no cambió nada en `drizzle/`), alcanza con volver el código:

```bash
cd /opt/vibra
git checkout "$(cat ../vibra-version-anterior)"
docker compose up -d --build
```

**Si traía migraciones**, la base ya quedó con el esquema nuevo y el código viejo puede no entenderlo. Hay que volver el código y también la base al backup previo (se pierde lo que se cargó después de actualizar):

```bash
cd /opt/vibra
git checkout "$(cat ../vibra-version-anterior)"
docker compose stop app worker
# Se recrea la base entera: un restore encima dejaría las tablas nuevas y la próxima actualización fallaría.
docker compose exec backup sh -c 'dropdb -h db -U vibra --force vibra && createdb -h db -U vibra vibra \
  && pg_restore -h db -U vibra -d vibra /backups/antes-de-actualizar.dump'
docker compose up -d --build
```

Para saber si una actualización trae migraciones: `git diff --stat HEAD origin/master -- drizzle/` antes del `git pull`.

Para volver a la última versión después de corregir el problema: `git checkout master && git pull`.

## 4. Monitoreo

La app no avisa sola si se cae. Crear dos monitores HTTP en un servicio gratuito (UptimeRobot o Better Stack), con aviso por email o Telegram:

| URL | Qué controla |
|---|---|
| `https://DOMINIO/api/salud` | la app responde y llega a la base |
| `https://DOMINIO/api/salud/worker` | el worker de recordatorios completó un ciclo en los últimos 10 minutos |

Si falla el segundo: `docker compose logs --tail 100 worker`. Si un ciclo queda colgado más de 30 minutos, el worker se reinicia solo.

Los emails de recordatorio que no se pudieron mandar después de 5 intentos les llegan como aviso a los admins en la campanita, con el email del destinatario. Casi siempre es un problema del SMTP.

## 5. Logs

```bash
docker compose logs -f app
docker compose logs -f worker   # recordatorios y, sin SMTP, el texto de los emails
docker compose logs backup
```

## 6. Backups

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
# Base recreada desde cero: un restore encima deja las tablas que no están en el dump (ver Rollback).
docker compose exec db sh -c 'dropdb -U vibra --force vibra && createdb -U vibra vibra \
  && pg_restore -U vibra -d vibra /tmp/restaurar.dump'
docker run --rm -v vibra_uploads:/data -v "$PWD":/respaldo alpine \
  sh -c 'tar -xzf /respaldo/adjuntos_<fecha>.tar.gz -C /data && chown -R 999:999 /data'
docker compose start app worker
```

(El nombre real del volumen de adjuntos aparece en `docker volume ls`; por defecto `<carpeta>_uploads`, o sea `vibra_uploads` si el repo está en `/opt/vibra`. El `chown` usa el uid del usuario `app` de la imagen: verificarlo con `docker compose exec app id -u`.)

## 7. SMTP

Completar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` en `.env` y `docker compose up -d worker`. Con puerto 465 poner `SMTP_SECURE=true`.
