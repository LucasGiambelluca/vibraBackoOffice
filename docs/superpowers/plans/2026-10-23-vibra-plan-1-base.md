# Vibra 2027 — Plan 1: Base (proyecto, DB, login, usuarios) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Next.js con login (email + contraseña), roles admin/editor, alta de usuarios por el admin y pantalla "Mi cuenta", sobre Postgres vía Drizzle.

**Architecture:** Next.js App Router en la raíz del repo. Drizzle ORM con dos drivers: `postgres-js` cuando hay `DATABASE_URL` (VPS) y PGlite (Postgres embebido en archivo) cuando no hay (desarrollo local y tests, sin Docker). Better Auth embebido con registro público deshabilitado; los usuarios se crean insertando `user` + `account` con contraseña hasheada por `better-auth/crypto`. Permisos centralizados en `can(rol, accion)`.

**Tech Stack:** Next.js (App Router, TS), Tailwind + shadcn/ui, Drizzle ORM 0.44 + drizzle-kit 0.31, PGlite 0.3, postgres-js 3, Better Auth 1.3, Zod 4, Vitest 3, tsx.

**Spec:** `docs/superpowers/specs/2026-10-23-vibra-backoffice-design.md`

## Hoja de ruta (planes siguientes, se escriben al terminar el anterior)

- **Plan 2 — Presupuestos:** áreas, rubros, proveedores, cotizaciones, aprobación en transacción, tipos de cambio, `money.ts`, adjuntos PDF, tablero de totales.
- **Plan 3 — Tareas y recordatorios:** tareas, `reminders.ts`, recordatorios automáticos/manuales, worker `node-cron`, SMTP, campanita, tablero de tareas.
- **Plan 4 — Deploy VPS:** Dockerfiles, `docker-compose.yml` (caddy, app, worker, db, backup), Caddyfile, backups, E2E Playwright.

## Estructura de archivos (Plan 1)

| Archivo | Responsabilidad |
|---|---|
| `next.config.ts` | `output: standalone`, PGlite fuera del bundle |
| `drizzle.config.ts` | Config de drizzle-kit (generar migraciones) |
| `vitest.config.ts` | Tests en `tests/`, alias `@` |
| `.env.example` | Variables documentadas |
| `src/db/auth-schema.ts` | Tablas de Better Auth (`user`, `session`, `account`, `verification`) |
| `src/db/schema.ts` | Re-exporta todas las tablas (punto único para Drizzle) |
| `src/db/client.ts` | `crearDb(url?)` y tipo `Db` |
| `src/db/index.ts` | Instancia única `db` para la app |
| `src/db/migrate.ts` | Aplica migraciones (`npm run db:migrate`) |
| `src/db/seed.ts` | Crea el primer admin (`npm run db:seed`) |
| `src/lib/permissions.ts` | Roles, acciones y `can()` |
| `src/lib/users.ts` | Alta, listado, cambio de rol y baja de usuarios |
| `src/lib/auth.ts` | Instancia de Better Auth (servidor) |
| `src/lib/auth-client.ts` | Cliente de Better Auth (navegador) |
| `src/lib/session.ts` | `usuarioActual()` y `exigirPermiso()` para server components/actions |
| `src/app/api/auth/[...all]/route.ts` | Endpoints de Better Auth |
| `src/app/login/page.tsx`, `login-form.tsx` | Pantalla de login |
| `src/app/(app)/layout.tsx`, `nav.tsx` | Shell autenticado + navegación |
| `src/app/(app)/page.tsx` | Tablero (por ahora saludo) |
| `src/app/(app)/cuenta/page.tsx`, `password-form.tsx` | Cambio de contraseña |
| `src/app/(app)/configuracion/usuarios/page.tsx`, `actions.ts`, `nuevo-usuario-form.tsx` | ABM de usuarios (admin) |
| `tests/helpers/db.ts` | DB PGlite en memoria con migraciones aplicadas |
| `tests/lib/permissions.test.ts`, `tests/lib/users.test.ts` | Tests |

Todos los comandos se corren desde la raíz del repo: `C:\Users\Lucas\Desktop\sistema-gestion-bibra` (Git Bash).

---

### Task 1: Scaffold Next.js y dependencias

**Files:**
- Create: proyecto Next.js en la raíz (vía `create-next-app`)
- Create: `.env.example`, `.env.local`
- Modify: `next.config.ts`, `.gitignore`, `package.json` (scripts)
- Delete: `src/app/page.tsx` (lo reemplaza `src/app/(app)/page.tsx` en Task 7)

- [ ] **Step 1: Crear el proyecto en una carpeta temporal y moverlo a la raíz**

La raíz ya tiene `docs/` y el PDF, por eso se genera aparte y se mueve.

```bash
npx create-next-app@latest _scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --skip-install --disable-git --yes
cp -r _scaffold/. .
rm -rf _scaffold
npm install
```

Expected: `package.json`, `src/app/`, `next.config.ts`, `tsconfig.json` en la raíz; `npm install` sin errores.

- [ ] **Step 2: Instalar dependencias**

```bash
npm install drizzle-orm@^0.44 postgres@^3.4 @electric-sql/pglite@^0.3 better-auth@^1.3 zod@^4 server-only
npm install -D drizzle-kit@^0.31 vitest@^3 tsx
```

Expected: sin errores de peer dependencies.

- [ ] **Step 3: Configurar `next.config.ts`**

Reemplazar el contenido completo:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PGlite carga WASM en runtime; no debe pasar por el bundler.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
```

- [ ] **Step 4: Variables de entorno**

Crear `.env.example`:

```bash
# Vacío = Postgres embebido (PGlite) en .data/pglite (desarrollo local).
# En el VPS: postgres://usuario:clave@db:5432/vibra
DATABASE_URL=

# Generar con: openssl rand -base64 32
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
```

Crear `.env.local` con el mismo contenido y un secreto real:

```bash
cp .env.example .env.local
sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|" .env.local
```

- [ ] **Step 5: `.gitignore`**

Agregar al final de `.gitignore` (create-next-app ya ignora `.env*`):

```
# Postgres embebido de desarrollo
.data/
!.env.example
```

- [ ] **Step 6: Scripts en `package.json`**

Agregar dentro de `"scripts"` (conservar `dev`, `build`, `start`, `lint`):

```json
"test": "vitest run",
"db:generate": "drizzle-kit generate",
"db:migrate": "node --env-file-if-exists=.env.local --import tsx src/db/migrate.ts",
"db:seed": "node --env-file-if-exists=.env.local --import tsx src/db/seed.ts"
```

- [ ] **Step 7: Borrar la home de ejemplo**

```bash
rm src/app/page.tsx
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js con dependencias base"
```

---

### Task 2: Vitest + permisos (TDD)

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/permissions.ts`
- Test: `tests/lib/permissions.test.ts`

- [ ] **Step 1: Configurar Vitest**

Crear `vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
```

- [ ] **Step 2: Escribir el test que falla**

Crear `tests/lib/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { can, esRol, type Accion } from "@/lib/permissions";

const TODAS: Accion[] = ["ver", "editar", "aprobar", "borrar", "configurar"];

describe("can", () => {
  it("admin puede todo", () => {
    for (const accion of TODAS) expect(can("admin", accion)).toBe(true);
  });

  it("editor solo ve y edita", () => {
    expect(can("editor", "ver")).toBe(true);
    expect(can("editor", "editar")).toBe(true);
    expect(can("editor", "aprobar")).toBe(false);
    expect(can("editor", "borrar")).toBe(false);
    expect(can("editor", "configurar")).toBe(false);
  });

  it("rol desconocido no puede nada", () => {
    for (const accion of TODAS) expect(can("invitado", accion)).toBe(false);
  });
});

describe("esRol", () => {
  it("reconoce solo admin y editor", () => {
    expect(esRol("admin")).toBe(true);
    expect(esRol("editor")).toBe(true);
    expect(esRol("Admin")).toBe(false);
    expect(esRol("")).toBe(false);
  });
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npx vitest run tests/lib/permissions.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/permissions"`.

- [ ] **Step 4: Implementar**

Crear `src/lib/permissions.ts`:

```ts
export const ROLES = ["admin", "editor"] as const;
export type Rol = (typeof ROLES)[number];

export type Accion = "ver" | "editar" | "aprobar" | "borrar" | "configurar";

const PERMISOS: Record<Rol, ReadonlySet<Accion>> = {
  admin: new Set(["ver", "editar", "aprobar", "borrar", "configurar"]),
  editor: new Set(["ver", "editar"]),
};

export function esRol(valor: string): valor is Rol {
  return (ROLES as readonly string[]).includes(valor);
}

export function can(rol: string, accion: Accion): boolean {
  return esRol(rol) && PERMISOS[rol].has(accion);
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run tests/lib/permissions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/lib/permissions.ts tests/lib/permissions.test.ts
git commit -m "feat: matriz de permisos admin/editor"
```

---

### Task 3: Capa de base de datos

**Files:**
- Create: `src/db/auth-schema.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/db/index.ts`, `src/db/migrate.ts`
- Create: `drizzle.config.ts`
- Create: `drizzle/` (migración generada)
- Create: `tests/helpers/db.ts`

- [ ] **Step 1: Esquema de Better Auth**

Crear `src/db/auth-schema.ts`. Son las tablas estándar de Better Auth para Drizzle/Postgres, más los campos propios `role` y `recibirEmails` en `user`:

```ts
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  role: text("role").notNull().default("editor"),
  recibirEmails: boolean("recibir_emails").notNull().default(true),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

- [ ] **Step 2: Punto único de esquema**

Crear `src/db/schema.ts`:

```ts
export * from "./auth-schema";
```

- [ ] **Step 3: Cliente con dos drivers**

Crear `src/db/client.ts`:

```ts
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

export const PGLITE_DIR = process.env.PGLITE_DIR ?? "./.data/pglite";

export function crearDb(databaseUrl?: string): Db {
  if (databaseUrl) return drizzlePostgres({ client: postgres(databaseUrl), schema });

  // Desarrollo local sin Docker: Postgres embebido. La API de Drizzle es la misma,
  // por eso se tipa como un único `Db`.
  mkdirSync(PGLITE_DIR, { recursive: true });
  return drizzlePglite({ client: new PGlite(PGLITE_DIR), schema }) as unknown as Db;
}
```

- [ ] **Step 4: Instancia única para la app**

Crear `src/db/index.ts`:

```ts
import { crearDb, type Db } from "./client";

// En dev, Next recarga módulos: se reutiliza la conexión (PGlite admite un solo proceso).
const globalDb = globalThis as unknown as { __vibraDb?: Db };

export const db = globalDb.__vibraDb ?? crearDb(process.env.DATABASE_URL || undefined);

if (process.env.NODE_ENV !== "production") globalDb.__vibraDb = db;
```

- [ ] **Step 5: Config de drizzle-kit**

Crear `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
```

- [ ] **Step 6: Script de migración**

Crear `src/db/migrate.ts`:

```ts
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { crearDb } from "./client";

const MIGRACIONES = { migrationsFolder: "drizzle" };

async function main() {
  const url = process.env.DATABASE_URL || undefined;
  const db = crearDb(url);
  if (url) await migratePostgres(db, MIGRACIONES);
  else await migratePglite(db as never, MIGRACIONES);
  console.log("Migraciones aplicadas");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 7: Generar y aplicar la migración inicial**

```bash
npm run db:generate
npm run db:migrate
```

Expected: se crea `drizzle/0000_*.sql` con `CREATE TABLE "user"`, `"session"`, `"account"`, `"verification"`; luego imprime `Migraciones aplicadas` y aparece `.data/pglite/`.

- [ ] **Step 8: Helper de DB para tests**

Crear `tests/helpers/db.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";

/** Postgres en memoria, con todas las migraciones aplicadas. Uno nuevo por test. */
export async function crearDbPrueba(): Promise<Db> {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as Db;
}
```

- [ ] **Step 9: Commit**

```bash
git add src/db drizzle drizzle.config.ts tests/helpers
git commit -m "feat: capa de DB con Drizzle (Postgres en VPS, PGlite en local)"
```

---

### Task 4: Gestión de usuarios (TDD)

**Files:**
- Create: `src/lib/users.ts`
- Test: `tests/lib/users.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/lib/users.test.ts`:

```ts
import { verifyPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { account, user } from "@/db/schema";
import {
  borrarUsuario,
  cambiarRol,
  crearUsuario,
  ErrorUsuario,
  listarUsuarios,
  nuevoUsuarioSchema,
} from "@/lib/users";
import { crearDbPrueba } from "../helpers/db";

const BASE = { nombre: "Ana Pérez", email: "Ana@Vibra.bo", password: "secreto123", rol: "editor" };
const datos = (extra: Partial<typeof BASE> = {}) => nuevoUsuarioSchema.parse({ ...BASE, ...extra });

let db: Db;
beforeEach(async () => {
  db = await crearDbPrueba();
});

describe("nuevoUsuarioSchema", () => {
  it("normaliza el email a minúsculas", () => {
    expect(datos().email).toBe("ana@vibra.bo");
  });

  it("rechaza contraseña de menos de 8 caracteres", () => {
    expect(nuevoUsuarioSchema.safeParse({ ...BASE, password: "1234567" }).success).toBe(false);
  });

  it("rechaza rol inexistente", () => {
    expect(nuevoUsuarioSchema.safeParse({ ...BASE, rol: "jefe" }).success).toBe(false);
  });
});

describe("crearUsuario", () => {
  it("crea user y cuenta credential con contraseña hasheada", async () => {
    const id = await crearUsuario(db, datos());

    const [u] = await db.select().from(user).where(eq(user.id, id));
    expect(u).toMatchObject({ name: "Ana Pérez", email: "ana@vibra.bo", role: "editor" });

    const [cuenta] = await db.select().from(account).where(eq(account.userId, id));
    expect(cuenta.providerId).toBe("credential");
    expect(cuenta.accountId).toBe(id);
    expect(cuenta.password).not.toBe("secreto123");
    expect(await verifyPassword({ hash: cuenta.password!, password: "secreto123" })).toBe(true);
  });

  it("rechaza email repetido sin importar mayúsculas", async () => {
    await crearUsuario(db, datos());
    await expect(crearUsuario(db, datos({ email: "ANA@vibra.bo" }))).rejects.toBeInstanceOf(ErrorUsuario);
  });
});

describe("listarUsuarios", () => {
  it("devuelve los usuarios ordenados por nombre", async () => {
    await crearUsuario(db, datos({ nombre: "Zoe", email: "zoe@vibra.bo" }));
    await crearUsuario(db, datos({ nombre: "Ana", email: "ana@vibra.bo" }));
    const lista = await listarUsuarios(db);
    expect(lista.map((u) => u.name)).toEqual(["Ana", "Zoe"]);
  });
});

describe("cambiarRol", () => {
  it("cambia el rol de otro usuario", async () => {
    const admin = await crearUsuario(db, datos({ email: "admin@vibra.bo", rol: "admin" }));
    const editor = await crearUsuario(db, datos());
    await cambiarRol(db, admin, editor, "admin");
    const [u] = await db.select().from(user).where(eq(user.id, editor));
    expect(u.role).toBe("admin");
  });

  it("no permite cambiarse el rol a uno mismo", async () => {
    const admin = await crearUsuario(db, datos({ rol: "admin" }));
    await expect(cambiarRol(db, admin, admin, "editor")).rejects.toBeInstanceOf(ErrorUsuario);
  });
});

describe("borrarUsuario", () => {
  it("borra al usuario y su cuenta", async () => {
    const admin = await crearUsuario(db, datos({ email: "admin@vibra.bo", rol: "admin" }));
    const editor = await crearUsuario(db, datos());
    await borrarUsuario(db, admin, editor);
    expect(await db.select().from(user).where(eq(user.id, editor))).toHaveLength(0);
    expect(await db.select().from(account).where(eq(account.userId, editor))).toHaveLength(0);
  });

  it("no permite borrarse a uno mismo", async () => {
    const admin = await crearUsuario(db, datos({ rol: "admin" }));
    await expect(borrarUsuario(db, admin, admin)).rejects.toBeInstanceOf(ErrorUsuario);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/lib/users.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/users"`.

- [ ] **Step 3: Implementar**

Crear `src/lib/users.ts`:

```ts
import { hashPassword } from "better-auth/crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { account, user } from "@/db/schema";
import { ROLES, type Rol } from "@/lib/permissions";

export const nuevoUsuarioSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es muy corto"),
  email: z.string().trim().toLowerCase().pipe(z.email("Email inválido")),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  rol: z.enum(ROLES, "Rol inválido"),
});

export type NuevoUsuario = z.infer<typeof nuevoUsuarioSchema>;

/** Error de regla de negocio: su mensaje se puede mostrar al usuario. */
export class ErrorUsuario extends Error {}

export async function crearUsuario(db: Db, datos: NuevoUsuario): Promise<string> {
  const existente = await db.select({ id: user.id }).from(user).where(eq(user.email, datos.email)).limit(1);
  if (existente.length > 0) throw new ErrorUsuario("Ya existe un usuario con ese email");

  const id = crypto.randomUUID();
  const hash = await hashPassword(datos.password);

  // Mismo formato que crea Better Auth en un registro con email y contraseña.
  await db.transaction(async (tx) => {
    await tx.insert(user).values({ id, name: datos.nombre, email: datos.email, emailVerified: true, role: datos.rol });
    await tx.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hash,
    });
  });

  return id;
}

export async function listarUsuarios(db: Db) {
  return db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .orderBy(asc(user.name));
}

export async function cambiarRol(db: Db, actorId: string, userId: string, rol: Rol): Promise<void> {
  if (actorId === userId) throw new ErrorUsuario("No podés cambiar tu propio rol");
  await db.update(user).set({ role: rol }).where(eq(user.id, userId));
}

export async function borrarUsuario(db: Db, actorId: string, userId: string): Promise<void> {
  if (actorId === userId) throw new ErrorUsuario("No podés borrar tu propio usuario");
  // session y account se borran en cascada.
  await db.delete(user).where(eq(user.id, userId));
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/lib/users.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS (14 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/users.ts tests/lib/users.test.ts
git commit -m "feat: alta, listado, cambio de rol y baja de usuarios"
```

---

### Task 5: Better Auth y helpers de sesión

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/session.ts`
- Create: `src/app/api/auth/[...all]/route.ts`

- [ ] **Step 1: Instancia de servidor**

Crear `src/lib/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    // Solo el admin da de alta usuarios (src/lib/users.ts).
    disableSignUp: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "editor", input: false },
      recibirEmails: { type: "boolean", required: false, defaultValue: true, input: false },
    },
  },
  plugins: [nextCookies()],
});
```

- [ ] **Step 2: Cliente de navegador**

Crear `src/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

- [ ] **Step 3: Helpers de sesión**

Crear `src/lib/session.ts`:

```ts
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, type Accion } from "@/lib/permissions";

/** Usuario logueado; si no hay sesión redirige a /login. */
export async function usuarioActual() {
  const sesion = await auth.api.getSession({ headers: await headers() });
  if (!sesion) redirect("/login");
  return sesion.user;
}

/** Para server actions: corta con error si el rol no tiene permiso. */
export async function exigirPermiso(accion: Accion) {
  const usuario = await usuarioActual();
  if (!can(usuario.role, accion)) throw new Error("No autorizado");
  return usuario;
}
```

- [ ] **Step 4: Ruta de la API**

Crear `src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores. (Si `sesion.user.role` da error de tipo, revisar que `additionalFields` en `src/lib/auth.ts` coincida con el Step 1.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/lib/auth-client.ts src/lib/session.ts src/app/api
git commit -m "feat: Better Auth con registro cerrado y helpers de sesión"
```

---

### Task 6: shadcn/ui y pantalla de login

**Files:**
- Create: `components.json`, `src/components/ui/*`, `src/lib/utils.ts` (vía shadcn)
- Create: `src/app/login/page.tsx`, `src/app/login/login-form.tsx`
- Modify: `src/app/layout.tsx` (idioma y título)

- [ ] **Step 1: Inicializar shadcn y agregar componentes**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button input label card table badge -y
```

Expected: `components.json`, `src/lib/utils.ts` y `src/components/ui/{button,input,label,card,table,badge}.tsx`.

- [ ] **Step 2: Idioma y título del layout raíz**

En `src/app/layout.tsx`, reemplazar el objeto `metadata` por:

```ts
export const metadata: Metadata = {
  title: "Vibra 2027 — Back office",
  description: "Presupuestos y tareas de producción de Vibra Bolivia 2027",
};
```

y cambiar `<html lang="en">` por `<html lang="es">`.

- [ ] **Step 3: Formulario de login**

Crear `src/app/login/login-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setCargando(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(datos.get("email")),
      password: String(datos.get("password")),
    });
    setCargando(false);
    if (error) {
      setError("Email o contraseña incorrectos");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={cargando}>
        {cargando ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Página de login**

Crear `src/app/login/page.tsx`:

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const sesion = await auth.api.getSession({ headers: await headers() });
  if (sesion) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Vibra 2027</CardTitle>
          <CardDescription>Back office de producción</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pantalla de login con shadcn/ui"
```

---

### Task 7: Shell autenticado, navegación y tablero

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/nav.tsx`, `src/app/(app)/page.tsx`

- [ ] **Step 1: Navegación**

Crear `src/app/(app)/nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Tablero" },
  { href: "/cuenta", label: "Mi cuenta" },
];

const LINKS_ADMIN = [{ href: "/configuracion/usuarios", label: "Usuarios" }];

function activo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav({ nombre, esAdmin }: { nombre: string; esAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = esAdmin ? [...LINKS, ...LINKS_ADMIN] : LINKS;

  async function salir() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="border-b bg-muted/40 p-4 md:w-56 md:shrink-0 md:border-b-0 md:border-r">
      <p className="mb-4 font-semibold">Vibra 2027</p>
      <nav className="flex flex-wrap gap-1 md:flex-col">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm hover:bg-muted",
              activo(pathname, link.href) && "bg-muted font-medium",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="mt-6 text-sm text-muted-foreground">{nombre}</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={salir}>
        Salir
      </Button>
    </aside>
  );
}
```

- [ ] **Step 2: Layout autenticado**

Crear `src/app/(app)/layout.tsx`:

```tsx
import { can } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";
import { Nav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();

  return (
    <div className="min-h-screen md:flex">
      <Nav nombre={usuario.name} esAdmin={can(usuario.role, "configurar")} />
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Tablero inicial**

Crear `src/app/(app)/page.tsx`:

```tsx
import { usuarioActual } from "@/lib/session";

export default async function TableroPage() {
  const usuario = await usuarioActual();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Hola, {usuario.name}</h1>
      <p className="text-muted-foreground">Vibra Bolivia 2027 — back office de producción.</p>
    </div>
  );
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)"
git commit -m "feat: layout autenticado con navegación y tablero"
```

---

### Task 8: Mi cuenta (cambio de contraseña)

**Files:**
- Create: `src/app/(app)/cuenta/page.tsx`, `src/app/(app)/cuenta/password-form.tsx`

- [ ] **Step 1: Formulario**

Crear `src/app/(app)/cuenta/password-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function PasswordForm() {
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  async function onSubmit(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const datos = new FormData(form);
    const nueva = String(datos.get("nueva"));

    if (nueva.length < 8) {
      setMensaje({ ok: false, texto: "La contraseña nueva debe tener al menos 8 caracteres" });
      return;
    }
    if (nueva !== String(datos.get("repetir"))) {
      setMensaje({ ok: false, texto: "Las contraseñas no coinciden" });
      return;
    }

    const { error } = await authClient.changePassword({
      currentPassword: String(datos.get("actual")),
      newPassword: nueva,
      revokeOtherSessions: true,
    });
    if (error) {
      setMensaje({ ok: false, texto: "La contraseña actual es incorrecta" });
      return;
    }
    form.reset();
    setMensaje({ ok: true, texto: "Contraseña actualizada" });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="actual">Contraseña actual</Label>
        <Input id="actual" name="actual" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nueva">Contraseña nueva</Label>
        <Input id="nueva" name="nueva" type="password" autoComplete="new-password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="repetir">Repetir contraseña nueva</Label>
        <Input id="repetir" name="repetir" type="password" autoComplete="new-password" required />
      </div>
      {mensaje && (
        <p className={cn("text-sm", mensaje.ok ? "text-green-600" : "text-destructive")}>{mensaje.texto}</p>
      )}
      <Button type="submit">Cambiar contraseña</Button>
    </form>
  );
}
```

- [ ] **Step 2: Página**

Crear `src/app/(app)/cuenta/page.tsx`:

```tsx
import { usuarioActual } from "@/lib/session";
import { PasswordForm } from "./password-form";

export default async function CuentaPage() {
  const usuario = await usuarioActual();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mi cuenta</h1>
        <p className="text-muted-foreground">
          {usuario.name} · {usuario.email} · {usuario.role}
        </p>
      </div>
      <PasswordForm />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/cuenta"
git commit -m "feat: cambio de contraseña en Mi cuenta"
```

---

### Task 9: Configuración de usuarios (admin)

**Files:**
- Create: `src/app/(app)/configuracion/usuarios/actions.ts`
- Create: `src/app/(app)/configuracion/usuarios/nuevo-usuario-form.tsx`
- Create: `src/app/(app)/configuracion/usuarios/page.tsx`

- [ ] **Step 1: Server actions**

Crear `src/app/(app)/configuracion/usuarios/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { esRol } from "@/lib/permissions";
import { exigirPermiso } from "@/lib/session";
import { borrarUsuario, cambiarRol, crearUsuario, ErrorUsuario, nuevoUsuarioSchema } from "@/lib/users";

const RUTA = "/configuracion/usuarios";

export type Resultado = { ok: true } | { ok: false; error: string };

export async function crearUsuarioAction(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("configurar");

  const parsed = nuevoUsuarioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await crearUsuario(db, parsed.data);
  } catch (error) {
    if (error instanceof ErrorUsuario) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath(RUTA);
  return { ok: true };
}

export async function cambiarRolAction(userId: string, formData: FormData): Promise<void> {
  const actor = await exigirPermiso("configurar");
  const rol = String(formData.get("rol"));
  if (!esRol(rol)) throw new Error("Rol inválido");
  await cambiarRol(db, actor.id, userId, rol);
  revalidatePath(RUTA);
}

export async function borrarUsuarioAction(userId: string): Promise<void> {
  const actor = await exigirPermiso("configurar");
  await borrarUsuario(db, actor.id, userId);
  revalidatePath(RUTA);
}
```

- [ ] **Step 2: Formulario de alta**

Crear `src/app/(app)/configuracion/usuarios/nuevo-usuario-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { crearUsuarioAction } from "./actions";

export function NuevoUsuarioForm() {
  const [estado, accion, pendiente] = useActionState(crearUsuarioAction, null);

  return (
    <form action={accion} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña inicial</Label>
        <Input id="password" name="password" type="text" minLength={8} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rol">Rol</Label>
        <select
          id="rol"
          name="rol"
          defaultValue="editor"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Creando…" : "Crear usuario"}
        </Button>
        {estado?.ok === false && <p className="text-sm text-destructive">{estado.error}</p>}
        {estado?.ok && <p className="text-sm text-green-600">Usuario creado. Pasale el email y la contraseña inicial.</p>}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Página**

Crear `src/app/(app)/configuracion/usuarios/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { can } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";
import { listarUsuarios } from "@/lib/users";
import { borrarUsuarioAction, cambiarRolAction } from "./actions";
import { NuevoUsuarioForm } from "./nuevo-usuario-form";

export default async function UsuariosPage() {
  const yo = await usuarioActual();
  if (!can(yo.role, "configurar")) notFound();

  const usuarios = await listarUsuarios(db);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Usuarios</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevoUsuarioForm />
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                {u.id === yo.id ? (
                  <Badge variant="secondary">{u.role} (vos)</Badge>
                ) : (
                  <form action={cambiarRolAction.bind(null, u.id)} className="flex items-center gap-2">
                    <select
                      name="rol"
                      defaultValue={u.role}
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button type="submit" variant="outline" size="sm">
                      Guardar
                    </Button>
                  </form>
                )}
              </TableCell>
              <TableCell className="text-right">
                {u.id !== yo.id && (
                  <form action={borrarUsuarioAction.bind(null, u.id)}>
                    <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                      Borrar
                    </Button>
                  </form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/configuracion"
git commit -m "feat: ABM de usuarios para admin"
```

---

### Task 10: Seed del primer admin y verificación de punta a punta

**Files:**
- Create: `src/db/seed.ts`

- [ ] **Step 1: Script de seed**

Crear `src/db/seed.ts`:

```ts
import { crearUsuario, nuevoUsuarioSchema } from "@/lib/users";
import { crearDb } from "./client";

async function main() {
  const [email, nombre, password] = process.argv.slice(2);
  if (!email || !nombre || !password) {
    console.error('Uso: npm run db:seed -- <email> "<nombre>" <contraseña>');
    process.exit(1);
  }

  const db = crearDb(process.env.DATABASE_URL || undefined);
  const datos = nuevoUsuarioSchema.parse({ email, nombre, password, rol: "admin" });
  await crearUsuario(db, datos);
  console.log(`Admin creado: ${datos.email}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Crear el admin local**

Con `npm run dev` **apagado** (PGlite admite un solo proceso):

```bash
npm run db:seed -- admin@vibra.bo "Admin Vibra" admin12345
```

Expected: `Admin creado: admin@vibra.bo`.

- [ ] **Step 3: Build de producción**

Run: `npm run build`
Expected: build OK, sin errores de tipos.

- [ ] **Step 4: Verificación manual**

Run: `npm run dev` y abrir `http://localhost:3000`.

Checklist (todo debe cumplirse):
1. `/` redirige a `/login`.
2. Login con contraseña incorrecta → "Email o contraseña incorrectos".
3. Login `admin@vibra.bo` / `admin12345` → tablero "Hola, Admin Vibra"; menú muestra "Usuarios".
4. En Usuarios: crear `editor@vibra.bo`, rol Editor → aparece en la tabla. Crear el mismo email otra vez → "Ya existe un usuario con ese email".
5. Salir; entrar como `editor@vibra.bo` → el menú **no** muestra "Usuarios"; ir a `/configuracion/usuarios` a mano → 404.
6. Mi cuenta (editor): cambiar contraseña → "Contraseña actualizada"; salir y entrar con la nueva.
7. Volver como admin: cambiar el rol del editor a Admin → se guarda; borrar al usuario → desaparece.

- [ ] **Step 5: Suite completa**

Run: `npm test`
Expected: PASS (14 tests).

- [ ] **Step 6: Commit**

```bash
git add src/db/seed.ts
git commit -m "feat: seed del primer admin"
```
