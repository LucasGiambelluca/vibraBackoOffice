# Vibra 2027 — Plan 4: Deploy en VPS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el back office listo para correr en un VPS Ubuntu con Docker: app, worker, Postgres 17, HTTPS con Caddy y backups diarios; pruebas E2E con Playwright, CI en GitHub y un runbook de deploy.

**Architecture:** Una imagen Docker multi-stage con dos targets: `app` (servidor `standalone` de Next, mínimo) y `herramientas` (código fuente + `node_modules` completos, con `tsx`) que corre las migraciones, el seed y el worker. `docker-compose.yml` orquesta `db`, `migrate` (one-shot, antes de la app), `app`, `worker`, `caddy` y `backup`. Las variables viven en un `.env` del VPS (no versionado). Las E2E levantan su propio `next dev` en el puerto 3100 con una PGlite aparte, así no tocan la base de desarrollo.

**Tech Stack:** Docker + Compose, Postgres 17, Caddy 2, Node 22, Next.js 16.4 (`output: "standalone"`), Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-23-vibra-backoffice-design.md` (secciones 5, 7, 8).

## Decisiones tomadas en este plan

- **Sin Docker en la máquina de desarrollo**: el Dockerfile y el compose se validan en el VPS (Task 7). En local se verifica que `next build` genere el `standalone` correcto y que no arrastre `.data/` ni el PDF.
- **Migraciones en un servicio `migrate` one-shot** (`depends_on: service_completed_successfully`), en vez de dentro del contenedor `app`: la imagen `app` es `standalone` y no tiene `tsx` ni las migraciones.
- **Dominio** en la variable `DOMINIO` del `.env` del VPS. Caddy saca el certificado de Let's Encrypt solo, con el registro DNS A apuntando al VPS.
- **SMTP opcional**: con `SMTP_HOST` vacío los emails quedan en el log del worker (`docker compose logs worker`).
- **Backups**: contenedor con `pg_dump` + `tar` de los adjuntos cada 24 h, conserva 14 días, en el volumen `backups`. Copiarlos fuera del VPS queda documentado en el runbook (manual).
- **E2E**: `WORKER_INTERVALO_MS=2000` para que el recordatorio llegue rápido; `NEXT_DIST_DIR=.next-e2e` para no chocar con un `npm run dev` abierto.
- **Repo en GitHub privado**: lo crea el controlador con `gh` **después de confirmarlo con el usuario** (publica el código en un servicio externo).
- **Rama**: `plan-4-deploy`, creada desde `plan-3-tareas`.

## Estructura de archivos (Plan 4)

| Archivo | Responsabilidad |
|---|---|
| `src/app/api/salud/route.ts` | Healthcheck (`SELECT 1`) para Docker |
| `next.config.ts` | `distDir` configurable, excluir `.data/`, docs y tests del trace |
| `src/worker/ciclo.ts` | Intervalo configurable (`WORKER_INTERVALO_MS`) |
| `.gitattributes` | `*.sh` y `Caddyfile` con LF (si no, bash falla en Linux) |
| `Dockerfile`, `.dockerignore` | Imagen multi-stage `app` / `herramientas` |
| `docker-compose.yml` | db, migrate, app, worker, caddy, backup |
| `deploy/Caddyfile`, `deploy/backup.sh`, `deploy/env.produccion.example` | Proxy HTTPS, backups, variables del VPS |
| `playwright.config.ts`, `scripts/e2e-servidor.mjs`, `e2e/*.ts` | Pruebas E2E |
| `.github/workflows/ci.yml` | Lint, tipos, tests y build en cada push |
| `docs/deploy.md`, `README.md` | Runbook del VPS |

---

### Task 1: Rama, healthcheck y ajustes para producción y E2E

**Files:**
- Create: `src/app/api/salud/route.ts`, `.gitattributes`
- Modify: `next.config.ts`, `src/worker/ciclo.ts`, `.gitignore`, `eslint.config.mjs`
- Test: `tests/worker/ciclo.test.ts` (sin cambios; debe seguir en verde)

- [ ] **Step 1: Rama**

```bash
git checkout plan-3-tareas
git checkout -b plan-4-deploy
```

- [ ] **Step 2: Healthcheck**

`src/app/api/salud/route.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Para el healthcheck de Docker: la app responde y llega a la base. Sin sesión, sin datos. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[salud] la base no responde", error);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
```

- [ ] **Step 3: `next.config.ts`**

Agregar dentro de `nextConfig` (al principio):

```ts
  // Las E2E usan otra carpeta para poder correr con `npm run dev` abierto.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // El trace del standalone no tiene que arrastrar datos locales, docs ni tests.
  outputFileTracingExcludes: {
    "*": [".data/**", "docs/**", "tests/**", "e2e/**", "*.pdf", ".next-e2e/**"],
  },
```

- [ ] **Step 4: Intervalo del worker configurable**

En `src/worker/ciclo.ts`, reemplazar la constante:

```ts
// Las E2E lo bajan a segundos para no esperar un minuto por cada recordatorio.
export const INTERVALO_MS = Number(process.env.WORKER_INTERVALO_MS) || 60_000;
```

- [ ] **Step 5: Fin de línea y archivos ignorados**

`.gitattributes`:

```
# Scripts y config que se ejecutan en Linux: siempre LF (con CRLF bash falla).
*.sh text eol=lf
Caddyfile text eol=lf
Dockerfile text eol=lf
docker-compose.yml text eol=lf
```

En `.gitignore`, agregar al final:

```
# E2E
.next-e2e/
playwright-report/
test-results/
```

En `eslint.config.mjs`, agregar `".next-e2e/**"`, `"playwright-report/**"` y `"test-results/**"` a `globalIgnores([...])`.

- [ ] **Step 6: Verificar build y standalone**

Con `npm run dev` apagado (comparte `.next`):

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: verde; el build lista `/api/salud`.

Run: `ls .next/standalone && ls .next/standalone/.data 2>/dev/null; du -sh .next/standalone`
Expected: existe `.next/standalone/server.js`; **no** existe `.next/standalone/.data`; tamaño razonable (decenas de MB, no cientos). Si `.data` o `docs` aparecen igual, reportarlo.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/salud next.config.ts src/worker/ciclo.ts .gitattributes .gitignore eslint.config.mjs
git commit -m "feat: healthcheck y ajustes de build para producción y E2E"
```

---

### Task 2: Imagen Docker

**Files:**
- Create: `Dockerfile`, `.dockerignore`

- [ ] **Step 1: `.dockerignore`**

```
.git
.next
.next-e2e
.data
node_modules
.env*
!.env.example
*.pdf
docs
playwright-report
test-results
*.tsbuildinfo
```

- [ ] **Step 2: `Dockerfile`**

```dockerfile
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
```

- [ ] **Step 3: Revisar contra lo que espera el código**

Comprobar leyendo el código (no hay Docker local):
- `npm run db:migrate`, `db:seed` y `worker` usan `node --env-file-if-exists=.env.local --import tsx …` → en `herramientas` existe `tsx` (devDependency, `npm ci` sin `NODE_ENV` las instala) y no hay `.env.local` (lo excluye `.dockerignore`): las variables llegan del compose.
- `src/lib/entorno.ts`: con `NODE_ENV=production`, la app y el worker exigen `DATABASE_URL` y `BETTER_AUTH_SECRET` → los pasa el compose (Task 3).
- `public/` existe en el repo (si no existiera, el `COPY` del target `app` fallaría: crear `public/.gitkeep`).

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat(deploy): imagen Docker con targets app y herramientas"
```

---

### Task 3: Compose, Caddy, backups y variables del VPS

**Files:**
- Create: `docker-compose.yml`, `deploy/Caddyfile`, `deploy/backup.sh`, `deploy/env.produccion.example`

- [ ] **Step 1: `deploy/env.produccion.example`**

```bash
# Copiar a .env en la raíz del repo en el VPS (no se versiona) y completar.

# Dominio público, con el registro DNS A apuntando a la IP del VPS. Sin https://.
DOMINIO=backoffice.ejemplo.com

# Generar cada uno con: openssl rand -base64 32
POSTGRES_PASSWORD=
BETTER_AUTH_SECRET=

# SMTP para los recordatorios. Vacío = los emails quedan en `docker compose logs worker`.
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

- [ ] **Step 2: `docker-compose.yml`**

```yaml
# Producción en el VPS. Uso: docker compose up -d --build (ver docs/deploy.md).

x-entorno: &entorno
  NODE_ENV: production
  DATABASE_URL: postgres://vibra:${POSTGRES_PASSWORD:?Falta POSTGRES_PASSWORD en .env}@db:5432/vibra
  BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?Falta BETTER_AUTH_SECRET en .env}
  BETTER_AUTH_URL: https://${DOMINIO:?Falta DOMINIO en .env}
  UPLOADS_DIR: /data/uploads
  SMTP_HOST: ${SMTP_HOST:-}
  SMTP_PORT: ${SMTP_PORT:-587}
  SMTP_SECURE: ${SMTP_SECURE:-false}
  SMTP_USER: ${SMTP_USER:-}
  SMTP_PASS: ${SMTP_PASS:-}
  SMTP_FROM: ${SMTP_FROM:-}

x-herramientas: &herramientas
  build: { context: ., target: herramientas }
  image: vibra-herramientas
  environment: *entorno

services:
  db:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_DB: vibra
      POSTGRES_USER: vibra
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vibra -d vibra"]
      interval: 5s
      timeout: 5s
      retries: 20

  # Aplica las migraciones y termina. La app y el worker arrancan después.
  migrate:
    <<: *herramientas
    command: ["npm", "run", "db:migrate"]
    restart: "no"
    depends_on:
      db: { condition: service_healthy }

  app:
    build: { context: ., target: app }
    image: vibra-app
    restart: unless-stopped
    environment: *entorno
    volumes:
      - uploads:/data/uploads
    depends_on:
      migrate: { condition: service_completed_successfully }
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/salud').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

  worker:
    <<: *herramientas
    command: ["npm", "run", "worker"]
    restart: unless-stopped
    depends_on:
      migrate: { condition: service_completed_successfully }

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    environment:
      DOMINIO: ${DOMINIO}
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app

  backup:
    image: postgres:17
    restart: unless-stopped
    environment:
      PGPASSWORD: ${POSTGRES_PASSWORD}
    entrypoint: ["bash", "/backup.sh"]
    volumes:
      - ./deploy/backup.sh:/backup.sh:ro
      - backups:/backups
      - uploads:/uploads:ro
    depends_on:
      db: { condition: service_healthy }

volumes:
  db:
  uploads:
  backups:
  caddy_data:
  caddy_config:
```

- [ ] **Step 3: `deploy/Caddyfile`**

```
# HTTPS automático (Let's Encrypt) para el dominio de DOMINIO.
{$DOMINIO} {
	encode zstd gzip
	reverse_proxy app:3000
}
```

- [ ] **Step 4: `deploy/backup.sh`**

```bash
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
```

- [ ] **Step 5: Verificar fin de línea y sintaxis**

Run: `git add deploy docker-compose.yml && git ls-files --eol deploy/backup.sh deploy/Caddyfile docker-compose.yml`
Expected: `i/lf` en los tres (lo garantiza `.gitattributes`).

Run: `bash -n deploy/backup.sh && node -e "require('node:fs').readFileSync('docker-compose.yml','utf8')" && echo OK`
Expected: `OK` (sin errores de sintaxis en el script).

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml deploy
git commit -m "feat(deploy): compose con Postgres, migraciones, worker, Caddy y backups"
```

---

### Task 4: Pruebas E2E con Playwright

**Files:**
- Modify: `package.json` (`@playwright/test`, script `e2e`)
- Create: `playwright.config.ts`, `scripts/e2e-servidor.mjs`, `e2e/ayudas.ts`, `e2e/presupuestos.spec.ts`, `e2e/tareas.spec.ts`

- [ ] **Step 1: Dependencia y navegador**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

En `package.json`, agregar a `scripts`: `"e2e": "playwright test"`.

- [ ] **Step 2: Servidor de E2E**

`scripts/e2e-servidor.mjs`:

```js
// Levanta la app para las E2E con su propia base (PGlite en .data/e2e), migrada y con un admin.
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const env = {
  ...process.env,
  // Vacío = PGlite. Las variables del proceso le ganan a .env.local.
  DATABASE_URL: "",
  PGLITE_DIR: ".data/e2e",
  UPLOADS_DIR: ".data/e2e-uploads",
  NEXT_DIST_DIR: ".next-e2e",
  BETTER_AUTH_URL: "http://localhost:3100",
  BETTER_AUTH_SECRET: "solo-para-e2e-no-usar-en-produccion",
  WORKER_EN_APP: "true",
  WORKER_INTERVALO_MS: "2000",
  SMTP_HOST: "",
};

rmSync(".data/e2e", { recursive: true, force: true });
rmSync(".data/e2e-uploads", { recursive: true, force: true });

function npm(args) {
  const resultado = spawnSync("npm", ["run", ...args], { env, stdio: "inherit", shell: true });
  if (resultado.status !== 0) process.exit(resultado.status ?? 1);
}

npm(["db:migrate"]);
npm(["db:seed", "--", "admin@e2e.test", '"Admin E2E"', "e2e-secreto-123"]);

const servidor = spawn("npx", ["next", "dev", "-p", "3100"], { env, stdio: "inherit", shell: true });
for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, () => servidor.kill(senal));
servidor.on("exit", (codigo) => process.exit(codigo ?? 0));
```

- [ ] **Step 3: Configuración**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // El test de recordatorios espera al worker (hasta ~1 minuto por la precisión de minutos).
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", locale: "es-BO" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/e2e-servidor.mjs",
    url: "http://localhost:3100/login",
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
```

- [ ] **Step 4: Ayudas**

`e2e/ayudas.ts`:

```ts
import { expect, type Page } from "@playwright/test";

// Credenciales de prueba: las crea scripts/e2e-servidor.mjs en una base descartable.
export const ADMIN = { email: "admin@e2e.test", password: "e2e-secreto-123", nombre: "Admin E2E" };

export async function ingresar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Contraseña").fill(ADMIN.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: /Hola/ })).toBeVisible();
}

/** "YYYY-MM-DDTHH:mm" en hora de La Paz dentro de `minutos` (valor de un datetime-local). */
export function horaLaPaz(minutos: number): string {
  const formato = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/La_Paz",
    dateStyle: "short",
    timeStyle: "short",
  });
  return formato.format(new Date(Date.now() + minutos * 60_000)).replace(" ", "T");
}
```

- [ ] **Step 5: E2E de presupuestos**

`e2e/presupuestos.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { ingresar } from "./ayudas";

test("cargar y aprobar una cotización suma al total del evento", async ({ page }) => {
  await ingresar(page);

  await page.getByRole("link", { name: "Proveedores" }).click();
  await page.getByLabel("Nombre").fill("Sonido E2E");
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(page.getByText("Proveedor creado")).toBeVisible();

  await page.getByRole("link", { name: "Presupuestos" }).click();
  await page.getByRole("link", { name: "Sonido", exact: true }).click();
  await page.getByLabel("Proveedor").selectOption({ label: "Sonido E2E" });
  await page.getByLabel("Qué incluye").fill("PA completo");
  await page.getByLabel("Precio por día").fill("1000");
  await page.getByLabel("% de descuento por contratar 2 días").fill("10");
  await page.getByRole("button", { name: "Agregar cotización" }).click();
  await expect(page.getByText("Cotización agregada")).toBeVisible();

  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText("Aprobada", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Tablero" }).click();
  await expect(page.getByText("BOB 1.800,00")).toBeVisible();
});
```

- [ ] **Step 6: E2E de recordatorios**

`e2e/tareas.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { ADMIN, horaLaPaz, ingresar } from "./ayudas";

test("un recordatorio manual llega a la campanita", async ({ page }) => {
  await ingresar(page);

  await page.getByRole("link", { name: "Tareas" }).click();
  await page.getByLabel("Tarea", { exact: true }).fill("Pedir permisos E2E");
  // Hay selects de Área y Responsable también en los filtros: se usan los ids del alta.
  await page.locator("#areaId").selectOption({ label: "Seguridad y Prevención" });
  await page.locator("#responsableId").selectOption({ label: ADMIN.nombre });
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await expect(page.getByText("Tarea creada")).toBeVisible();

  await page.getByRole("link", { name: "Pedir permisos E2E" }).click();
  await page.getByLabel("Recordatorio manual (hora de La Paz)").fill(horaLaPaz(1));
  await page.getByRole("button", { name: "Agregar recordatorio" }).click();
  await expect(page.getByText("Recordatorio agregado")).toBeVisible();

  // El worker de E2E corre cada 2 s; la campanita consulta al cargar la página.
  const campanitaConUna = page.getByRole("button", { name: "Notificaciones (1 sin leer)" });
  await expect(async () => {
    await page.reload();
    await expect(campanitaConUna).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 150_000, intervals: [5_000] });

  await campanitaConUna.click();
  await page.getByRole("button", { name: /Recordatorio: "Pedir permisos E2E"/ }).click();
  await expect(page).toHaveURL(/\/tareas\//);
  await expect(page.getByRole("button", { name: "Notificaciones", exact: true })).toBeVisible();
});
```

- [ ] **Step 7: Correr**

Con `npm run dev` abierto o cerrado (usa otra base y otra carpeta de build):

Run: `npm run e2e`
Expected: `2 passed`. Si un selector no matchea por cómo está armada la página, ajustar el selector (no la app) y reportarlo.

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: verde (Vitest no levanta los `.spec.ts`: solo incluye `tests/**/*.test.ts`).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json playwright.config.ts scripts e2e
git commit -m "test: E2E de aprobación de cotización y recordatorio en la campanita"
```

---

### Task 5: CI en GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  verificar:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run build

  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: verificar
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report
          retention-days: 7
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node -e "require('node:fs').readFileSync('.github/workflows/ci.yml','utf8')" && echo OK`
Expected: `OK`. (La corrida real se ve en GitHub cuando exista el repo, Task 6.)

Nota: `tsc --noEmit` necesita los tipos de rutas de Next (`PageProps`). Si en CI falla por eso, agregar `- run: npx next typegen` antes del paso de `tsc`.

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "ci: lint, tipos, tests, build y E2E en GitHub Actions"
```

---

### Task 6: Runbook de deploy y repo en GitHub

**Files:**
- Create: `docs/deploy.md`
- Modify: `README.md`

- [ ] **Step 1: Runbook**

`docs/deploy.md`:

````markdown
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
````

- [ ] **Step 2: README**

En `README.md`, agregar al final:

```markdown
## Deploy

Producción en un VPS con Docker: ver [docs/deploy.md](docs/deploy.md).

## Pruebas E2E

`npm run e2e` (la primera vez: `npx playwright install chromium`). Levanta su propia app en el puerto 3100 con una base descartable en `.data/e2e`; puede correr con `npm run dev` abierto.
```

- [ ] **Step 3: Commit**

```bash
git add docs/deploy.md README.md
git commit -m "docs: runbook de deploy en el VPS"
```

- [ ] **Step 4: Repo privado en GitHub (controlador, con confirmación del usuario)**

**No lo hace un subagente.** El controlador pregunta al usuario el nombre del repo y confirma antes de publicar. Requiere `gh auth login` (lo corre el usuario con `! gh auth login`).

```bash
gh repo create <usuario>/<repo> --private --source . --remote origin
git push -u origin master plan-1-base plan-2-presupuestos plan-3-tareas plan-4-deploy
```

Expected: el workflow de CI corre en GitHub; revisar que pase (`gh run list`, `gh run watch`).

---

### Task 7: Primer deploy en el VPS (usuario, guiado)

No es código: el usuario sigue `docs/deploy.md` en el VPS; el controlador acompaña con los comandos y revisa los logs que el usuario pegue.

- [ ] DNS resolviendo al VPS.
- [ ] `docker compose up -d --build` sin errores; `migrate` terminó con 0; `app` healthy.
- [ ] `https://DOMINIO` con certificado válido.
- [ ] Admin creado con `db:seed`; login OK.
- [ ] Subir un PDF a una cotización y descargarlo (volumen `uploads` con permisos correctos).
- [ ] Crear una tarea con recordatorio manual a 2 minutos: aparece en la campanita y en `docker compose logs worker`.
- [ ] Al día siguiente: `docker compose logs backup` muestra `[backup] ok`.

---

## Cobertura del spec (Plan 4)

| Spec | Task |
|---|---|
| VPS Linux con Docker y dominio propio, HTTPS automático (Caddy) | 2, 3, 6, 7 |
| Postgres 17 en contenedor con volumen persistente | 3 |
| Contenedores `caddy`, `app`, `worker`, `db`, `backup` | 3 |
| Migraciones al iniciar | 3 (servicio `migrate`) |
| Variables en `.env` del VPS, `.env.example` en el repo | 3 |
| Adjuntos en volumen, incluidos en el backup | 3 |
| Backups diarios de 14 días | 3 |
| Repo en GitHub; `git pull && docker compose up -d --build` | 6 |
| E2E (Playwright): cotización → aprobar → total; tarea con recordatorio → campanita | 4 |
