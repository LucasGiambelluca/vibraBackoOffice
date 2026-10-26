# Auditoría de producción — Vibra 2027

**Veredicto: CASI** — 0 🔴 bloqueantes · 1 🟠 alto · 5 🟡 medios · 1 ⚪ bajo abiertos

Primera pasada: 5 🟠 · 7 🟡 · 1 ⚪. Resueltos: A1, A3, A5, M3, M4 (2026-10-25) y A2 (2026-10-26) (ver **Resueltos**).

Fecha: 2026-10-25 · Rama `plan-4-deploy` (529fd7a + cambios sin commitear en `next.config.ts` y `login-form.tsx`).
Verificado: lint ✅, `tsc --noEmit` ✅, `vitest` 196/196 ✅, `npm audit` (ver 1.8). E2E: última corrida 2026-10-24 ✅ (no se volvió a correr).

No hay nada que exponga datos ni pierda plata. Para llegar a **LISTO** falta A4 (se resuelve en el primer deploy).

Contexto: back office interno de pocos usuarios, sin pasarela de pagos ni webhooks. Los chequeos de cobros, idempotencia de pagos y firma HMAC no aplican (N/A). La "plata" acá son los montos de cotizaciones y el total del evento.

---

## Hallazgos abiertos

### 🟠 Altos

| # | Hallazgo | Dónde | Arreglo |
|---|---|---|---|
| A4 | **Los backups quedan en el mismo VPS y el restore nunca se probó.** Si se pierde el disco o el VPS, se pierden la base y los backups juntos. La copia afuera es manual y "recomendada". | `docker-compose.yml:84-95`, `deploy/backup.sh`, `docs/deploy.md` §6 | Copia automática fuera del VPS (rclone a un bucket o al Drive, o snapshots del proveedor) y un restore de prueba en el primer deploy, anotado en `docs/deploy.md`. |

### 🟡 Medios

| # | Hallazgo | Dónde | Arreglo |
|---|---|---|---|
| M1 | `npm audit`: 2 críticas (tinypool/vitest) y 5 moderadas (vitest, esbuild vía drizzle-kit). Todas son dependencias de desarrollo: no entran en la imagen `app` y nunca se ejecutan en producción. Sí quedan instaladas en la imagen `herramientas`. | `package.json` (devDependencies) | Actualizar vitest a 5.x; drizzle-kit cuando salga una versión sin `@esbuild-kit`. |
| M2 | Los tests y las E2E corren sobre PGlite, nunca contra Postgres real. Las migraciones y los `FOR UPDATE SKIP LOCKED` del worker se ejecutan por primera vez contra Postgres en producción. | `tests/helpers/db.ts:1-3`, `scripts/e2e-servidor.mjs:8-9`, `.github/workflows/ci.yml` | Agregar un service `postgres:17` en CI y correr al menos las migraciones y los tests del worker con `DATABASE_URL`. |
| M5 | Faltan índices en `session.user_id` y `account.user_id` (los que recomienda Better Auth). | `src/db/auth-schema.ts` | Migración con los dos índices. |
| M6 | Los logs son texto libre, sin niveles ni formato JSON. | todo `console.*` | Opcional a esta escala: está bien mientras A3 esté resuelto. |
| M7 | SPF/DKIM/DMARC: no aplica todavía porque no hay SMTP. Cuando se configure, sin estos registros los recordatorios van a caer en spam. | `docs/deploy.md` §7 | Al elegir proveedor, cargar los registros DNS que pida y anotarlos en el runbook. |

### ⚪ Bajos

| # | Hallazgo | Dónde |
|---|---|---|
| B1 | Las listas de cotizaciones y tareas no paginan. Con el volumen de un evento (cientos de filas) no es un problema. | `src/lib/cotizaciones.ts:135`, `src/lib/tareas.ts:123` |

## Resueltos

| # | Qué se hizo |
|---|---|
| A2 | Solo el admin aprueba. Se guarda quién y cuándo (`aprobada_por`, `aprobada_at`, migración `0006`). Si un editor edita una aprobada, vuelve a pendiente en el mismo UPDATE; si la edita el admin, sigue aprobada (`src/lib/cotizaciones.ts`, `src/app/(app)/presupuestos/operaciones.ts`). La UI muestra quién aprobó y avisa al editor antes de guardar. |
| A1 | Headers en `deploy/Caddyfile`: HSTS, `X-Frame-Options DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`; se quitan `Server` y `X-Powered-By`. |
| A3 | Latido del worker en la tabla `latido` (`src/lib/latido.ts`, migración `0005`); `/api/salud/worker` da 503 sin ciclo en 10 min; los emails que quedan `fallido` avisan a los admins en la campanita (`src/lib/envio-recordatorios.ts`); monitores externos documentados en `docs/deploy.md` §4. |
| A5 | `docs/deploy.md` §2–3: guardar la versión y hacer un `pg_dump` antes de actualizar; rollback con y sin migraciones (recrea la base para no dejar tablas nuevas colgadas). El restore de §6 corregido igual. |
| M3 | Rotación de logs (`10m × 5`) en todos los servicios de `docker-compose.yml`. |
| M4 | Watchdog: si un ciclo queda colgado más de 30 min, el worker sale y Docker lo reinicia (`src/worker/index.ts`, `src/worker/ciclo.ts`). |

---

## Rúbrica

### 1. Seguridad
- ✅ Secrets fuera del código: todo por env; `.env*` en `.gitignore` y `.dockerignore`; `.env.example` y `deploy/env.produccion.example` sin valores reales. La app no arranca sin `BETTER_AUTH_SECRET` (`src/lib/auth.ts:9-11`) ni `DATABASE_URL` (`src/db/index.ts:10`).
- ✅ Queries parametrizadas: todo pasa por Drizzle; los `sql\`\`` solo tienen literales o columnas (`src/lib/envio-recordatorios.ts:139`, `src/lib/tareas.ts:132`).
- ✅ Autorización: cada server action pasa por `exigir(actor, …)` en `operaciones.ts`; cada página llama a `usuarioActual()` (no depende solo del layout); las páginas de configuración hacen `notFound()` sin rol admin. Las notificaciones filtran por `usuarioId` (`src/lib/notificaciones.ts:33`); los recordatorios manuales verifican creador o admin (`src/lib/recordatorios.ts:61-63`). Los datos son del equipo, no por usuario: no hay recursos ajenos que proteger entre editores.
- ✅ Auth: Better Auth con sesión en DB; hash de contraseñas con `hashPassword` de Better Auth; alta pública deshabilitada (`src/lib/auth.ts:20`); mínimo 8 caracteres.
- ✅ Validación de input: zod en todas las operaciones (`src/lib/acciones.ts:22-26`); los PDF se validan por tamaño y magic bytes, y se guardan con nombre UUID (`src/lib/adjuntos.ts:18-27`), sin path traversal (`src/lib/adjuntos.ts:7`).
- ✅ Rate limiting: el de Better Auth está activo por defecto en producción (`node_modules/better-auth/dist/context/create-context.mjs:172`). Caddy 2 reemplaza `X-Forwarded-For` con la IP real, así que la IP se resuelve bien. Después del deploy, conviene confirmar que el log no muestre el aviso "could not determine a client IP".
- ❌ Headers de seguridad → **A1**. CORS: N/A (no hay API pública; las server actions de Next verifican el origen).
- 🟡 `npm audit` → **M1** (solo dependencias de desarrollo).
- ✅ HTTPS: Caddy saca el certificado y redirige HTTP→HTTPS automáticamente (`deploy/Caddyfile:104`).

### 2. Integridad de datos y plata
- ✅ Aritmética monetaria en enteros: BigInt en centavos, puntos básicos y millonésimas (`src/lib/money.ts:21-40`); en la DB, `numeric(14,2)` y `numeric(14,6)`.
- ✅ Transacciones: la aprobación descarta las demás y aprueba en una sola transacción (`src/lib/cotizaciones.ts:88-109`); alta de usuario (`src/lib/users.ts:36-45`); tareas y recordatorios (`src/lib/tareas.ts:49-92`).
- ✅ Bloqueo de filas: `FOR UPDATE` sobre el rubro al aprobar (`src/lib/cotizaciones.ts:95`), sobre la tarea al editarla (`src/lib/tareas.ts:66`), y `SKIP LOCKED` en el worker (`src/lib/envio-recordatorios.ts:42,129`). Tiene tests de concurrencia (`tests/lib/cotizaciones.test.ts:123-143`).
- N/A Idempotencia de cobros y firma HMAC de webhooks: no hay pagos.
- ✅ Migraciones versionadas con drizzle-kit (`drizzle/0000…0004`), aplicadas por el servicio `migrate` antes de levantar la app.
- ✅ Constraints: CHECK de moneda, estado, precio y descuento; índice único parcial "una aprobada por rubro" (`src/db/presupuestos-schema.ts:63-68`); FKs con `restrict` / `cascade` / `set null` explícitos.
- ✅ Trazabilidad de montos aprobados: quién y cuándo aprobó; si un editor cambia una aprobada, vuelve a pendiente (A2).

### 3. Confiabilidad
- ✅ Sin errores tragados: `intentar` solo convierte `ErrorNegocio` y relanza el resto (`src/lib/acciones.ts:11-19`). Los únicos `catch` que no relanzan registran el error (`src/lib/adjuntos.ts:43-45`, `src/app/api/salud/route.ts:9-11`, `src/worker/ciclo.ts:28-29`).
- ✅ Promesas: el worker atrapa cada ciclo; si un proceso se cae, Docker lo reinicia (`restart: unless-stopped`).
- ✅ Timeouts y reintentos de email: timeouts SMTP (`src/lib/email.ts:22-24`), hasta 5 intentos con ventana de 10 min (`src/lib/envio-recordatorios.ts:10,99`); el envío corre fuera de la transacción.
- ✅ Resiliencia: los recordatorios atrasados por caída del worker se reprocesan o se cancelan según su tipo (`src/lib/envio-recordatorios.ts:13-23`).
- ✅ Graceful shutdown: el worker cierra la DB con SIGTERM (`src/worker/index.ts:17-23`); el `server.js` standalone de Next maneja SIGTERM.

### 4. Observabilidad
- 🟡 Logging estructurado → **M6**. No se loguean secretos ni contraseñas.
- N/A Correlation IDs: un solo servicio web.
- ❌ Error tracking y alertas → **A3**.
- ✅ Health: `/api/salud` prueba la DB y lo usa el healthcheck de Docker (`docker-compose.yml:54-59`). El del worker falta → **M4**.
- 🟡 Registro de eventos de plata: se guarda quién y cuándo aprobó (A2); no hay historial de cada cambio de monto.

### 5. Testing
- ✅ Flujos críticos: aprobación, reversión, totales en varias monedas, redondeo, permisos y worker; 196 tests.
- ✅ Concurrencia: dos aprobaciones simultáneas en el mismo rubro y dos altas con el mismo email.
- ✅ CI: lint, tipos, tests, build y E2E en cada push y PR (`.github/workflows/ci.yml`). Todavía no corre porque el repo no está en GitHub.
- ✅ Smoke E2E: aprobación de cotización y recordatorio en la campanita (`e2e/`).
- 🟡 Sin Postgres real en CI → **M2**.

### 6. Performance
- ✅ Índices en las FKs consultadas e índices parciales para el worker (`src/db/tareas-schema.ts:56-58,85-86`). Faltan dos en tablas de auth → **M5**.
- ✅ Sin N+1: las listas usan joins; el worker trae los usuarios una sola vez por lote (`src/lib/envio-recordatorios.ts:45`).
- ✅ Pool de conexiones: el default de postgres-js (10 conexiones) alcanza para esta carga.
- ⚪ Paginación → **B1**.
- ✅ Sin operaciones sincrónicas bloqueantes en los endpoints (I/O de archivos con `fs/promises`).

### 7. Deploy y operaciones
- ✅ Configuración por entorno: compose falla si faltan `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` o `DOMINIO`.
- ✅ Build reproducible: `package-lock.json` versionado, `npm ci` en el Dockerfile, la imagen `app` es standalone y corre con usuario sin privilegios.
- ✅ Migraciones en el deploy: servicio `migrate`; la app y el worker dependen de que termine bien.
- ❌ Rollback → **A5**.
- ❌ Backups fuera del VPS y restore probado → **A4** (los backups diarios existen).
- 🟡 Deliverabilidad de mail → **M7** (pendiente hasta que haya SMTP).
- 🟡 Rotación de logs → **M3**.

### 8. Documentación
- ✅ README con el setup local, PGlite, adjuntos, recordatorios y E2E.
- ✅ `.env.example` y `deploy/env.produccion.example` completos.
- ✅ Runbook: `docs/deploy.md` (primera vez, actualizar, logs, backups y restore, SMTP). Le falta el rollback (A5).
- ✅ Arquitectura: `docs/superpowers/specs/2026-10-23-vibra-backoffice-design.md`.

---

## Camino a LISTO

1. **A4**: copia automática fuera del VPS y restore de prueba, en el primer deploy (1 h).

Medios baratos que conviene sumar: **M5** (índices de auth) y **M1** (actualizar vitest).
