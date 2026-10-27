# Deploy en el VPS de RS Group (rsgroupenter.com/backoffice)

El back office corre en el mismo VPS que vibratickets y vibrabolivia (`ssh vibra`), sin Docker:

| Pieza | Dónde |
|---|---|
| App (Next standalone, worker de recordatorios adentro) | systemd `backoffice`, `127.0.0.1:3002`, usuario `backoffice` |
| Base | PostgreSQL 17 local, base y rol `backoffice` (solo escucha en localhost) |
| HTTPS | nginx del sitio `rsgroupenter`, `location ^~ /backoffice` → `snippets/backoffice.conf` |
| Variables | `/opt/backoffice/.env` (root:backoffice, 640) |
| Archivos subidos | `/opt/backoffice/uploads` |
| Versiones | `/opt/backoffice/releases/<versión>`, `/opt/backoffice/current` apunta a la activa |
| Backups | `/var/backups/backoffice` (cron diario, 14 días) |

Los archivos de esta carpeta están en `deploy/vps/`. `deploy/docker-compose.yml` y el `Caddyfile` son
para un VPS propio con Docker; acá no se usan.

## Actualizar a una versión nueva

Desde la compu, en el repo:

```bash
V=$(git rev-parse --short HEAD)
git archive --format=tar.gz -o /tmp/backoffice-$V.tar.gz HEAD
scp /tmp/backoffice-$V.tar.gz vibra:/tmp/
ssh vibra /opt/backoffice/actualizar.sh /tmp/backoffice-$V.tar.gz
```

`actualizar.sh` compila en una carpeta nueva, saca un backup de la base, corre las migraciones,
cambia `current` y reinicia. Si la compilación falla, la versión que estaba sigue andando.

Probar el login en https://rsgroupenter.com/backoffice y una pantalla de presupuestos.

## Volver a la versión anterior

```bash
ssh vibra
ls -1dt /opt/backoffice/releases/*          # la segunda es la anterior
ln -sfn /opt/backoffice/releases/<anterior> /opt/backoffice/current
systemctl restart backoffice
```

Si la versión nueva traía migraciones (`drizzle/` cambió), además hay que restaurar la base del
backup que `actualizar.sh` sacó antes de migrar (se pierde lo cargado después):

```bash
systemctl stop backoffice
sudo -u postgres dropdb backoffice && sudo -u postgres createdb -O backoffice backoffice
sudo -u postgres pg_restore -d backoffice /var/backups/backoffice/antes-de-<versión-nueva>.dump
systemctl start backoffice
```

## Usuarios

```bash
ssh vibra
cd /opt/backoffice/current && set -a && . /opt/backoffice/.env && set +a
npm run db:seed -- email@dominio.com "Nombre" 'contraseña-larga'    # crea un admin
```

El resto se maneja desde Configuración › Usuarios (alta, rol, contraseña nueva, baja).

## Logs y estado

```bash
systemctl status backoffice
journalctl -u backoffice -n 100 --no-pager
tail /var/log/backoffice-backup.log
```

## Restaurar un backup

```bash
systemctl stop backoffice
sudo -u postgres dropdb backoffice && sudo -u postgres createdb -O backoffice backoffice
sudo -u postgres pg_restore -d backoffice /var/backups/backoffice/base-<fecha>.dump
tar -xzf /var/backups/backoffice/archivos-<fecha>.tar.gz -C /opt/backoffice
chown -R backoffice:backoffice /opt/backoffice/uploads
systemctl start backoffice
```

Los backups quedan en el mismo VPS: para tener una copia afuera, bajarlos de vez en cuando
(`scp vibra:/var/backups/backoffice/base-<fecha>.dump .`).
