# Vibra 2027 — Plan 3: Tareas y recordatorios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** To-do list del evento por área, con responsable, fecha límite y estado; recordatorios automáticos (3 días antes, día del vencimiento, diario si está vencida) y manuales; notificaciones en la app (campanita) y por email.

**Architecture:** Mismo patrón que los Planes 1 y 2: lógica en `src/lib/*.ts` testeada con PGlite en memoria, `operaciones.ts` (permiso + Zod + `intentar`) y `actions.ts` fino por sección, formularios con `FormAccion`/`BotonAccion`. Las fechas de recordatorios se calculan con funciones puras (`src/lib/reminders.ts`), La Paz es UTC−4 fijo. Un **worker** corre cada minuto: toma los recordatorios vencidos con `FOR UPDATE SKIP LOCKED`, crea las notificaciones en la misma transacción y después manda los emails pendientes (reintentos, máx. 5). En el VPS el worker es un proceso aparte; en desarrollo corre dentro de Next (`instrumentation.ts`) porque PGlite admite un solo proceso.

**Tech Stack:** Next.js 16.4 (App Router, `instrumentation.ts`), Drizzle ORM 0.44, PGlite / postgres-js, Zod 4, Nodemailer, Vitest 3, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-23-vibra-backoffice-design.md` (secciones 2 "Tarea", 3 "Tareas" y "Tablero", 4 "Recordatorios", 5, 7).

## Decisiones tomadas en este plan

- **Zona horaria**: La Paz es UTC−4 todo el año (Bolivia no tiene horario de verano), así que 09:00 La Paz = 13:00 UTC. Se calcula con aritmética simple, sin librerías de fechas.
- **Recordatorios automáticos que ya pasaron no se crean**. Si la fecha límite ya pasó (o vence hoy después de las 09:00), se crea directamente el primer "vencida diario" para el próximo 09:00.
- **El seguimiento del email va en la notificación** (una por destinatario), no en el recordatorio: un recordatorio sin responsable notifica a todos los admins y cada email se reintenta por separado. Campos: `email_estado` (pendiente / enviado / omitido / fallido) e `intentos_email`.
- **Scheduler con `setInterval` de 60 s** en vez de `node-cron`: hace lo mismo sin otra dependencia. Un flag evita que dos ciclos se solapen en el mismo proceso; `SKIP LOCKED` evita duplicados entre procesos.
- **Worker en desarrollo**: con `WORKER_EN_APP=true` arranca dentro del servidor de Next (`src/instrumentation.ts`). En el VPS (Plan 4) corre `npm run worker` en su contenedor.
- **Sin SMTP configurado** (`SMTP_HOST` vacío) los emails se escriben en la consola. Así se puede probar en local.
- **Campanita**: se actualiza consultando `GET /api/notificaciones` al montar y cada 60 s. El layout no se re-renderiza al navegar, así que no puede pasar el conteo como prop.
- **Permisos**: el editor crea, edita y cambia el estado de tareas; solo el admin borra. Los recordatorios manuales los agrega o cancela el creador de la tarea o un admin. Las notificaciones son de cada usuario.
- **Rama**: `plan-3-tareas`, creada desde `plan-2-presupuestos`.

## Estructura de archivos (Plan 3)

| Archivo | Responsabilidad |
|---|---|
| `src/db/tareas-schema.ts` | Tablas `tarea`, `recordatorio`, `notificacion` |
| `drizzle/0003_*.sql` | Migración generada |
| `src/lib/reminders.ts` | Funciones puras: fechas en La Paz, recordatorios automáticos, mensajes, formato |
| `src/lib/recordatorios.ts` | Regenerar automáticos, recordatorios manuales, listado |
| `src/lib/tareas.ts` | ABM de tareas, cambio de estado, listado con filtros, resumen para el tablero |
| `src/lib/envio-recordatorios.ts` | Lógica del worker: procesar recordatorios vencidos y enviar emails |
| `src/lib/email.ts` | Enviador SMTP (Nodemailer) o consola |
| `src/lib/notificaciones.ts` | Listar, contar no leídas, marcar leídas |
| `src/lib/users.ts` | + `cambiarRecibirEmails` |
| `src/worker/ciclo.ts`, `src/worker/index.ts`, `src/worker/en-app.ts`, `src/instrumentation.ts` | Worker: ciclo, proceso aparte, arranque dentro de Next |
| `src/app/(app)/tareas/*` | Lista con filtros, alta, cambio de estado, detalle con recordatorios |
| `src/app/api/notificaciones/route.ts` | JSON de notificaciones del usuario (para la campanita) |
| `src/app/(app)/notificaciones/*` | Server actions de marcar leídas |
| `src/components/campanita.tsx` | Campanita en la navegación |
| `src/app/(app)/cuenta/*` | + preferencia de emails |
| `src/app/(app)/page.tsx`, `nav.tsx` | Tablero con tareas y navegación |

Todos los comandos se corren desde la raíz del repo en Git Bash. **Antes de `npm run db:migrate` pará `npm run dev`** (PGlite admite un solo proceso).

---

### Task 1: Rama, dependencias y esquema de tareas

**Files:**
- Modify: `package.json` (nodemailer, script `worker`)
- Create: `src/db/tareas-schema.ts`
- Modify: `src/db/schema.ts`
- Create: `drizzle/0003_*.sql` (generada)
- Test: `tests/db/tareas-schema.test.ts`

- [ ] **Step 1: Rama y dependencias**

```bash
git checkout plan-2-presupuestos
git checkout -b plan-3-tareas
npm install nodemailer
npm install -D @types/nodemailer
```

Expected: `nodemailer` en `dependencies` y `@types/nodemailer` en `devDependencies`. (Si `nodemailer` ya trae sus tipos y `@types/nodemailer` choca, desinstalar `@types/nodemailer`.)

- [ ] **Step 2: Escribir el test que falla**

`tests/db/tareas-schema.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { notificacion, recordatorio, tarea, user } from "@/db/schema";
import { crearDbPrueba } from "../helpers/db";

describe("tablas de tareas", () => {
  it("borrar una tarea borra sus recordatorios y notificaciones", async () => {
    const db = await crearDbPrueba();
    await db.insert(user).values({ id: "u1", name: "Ana", email: "ana@vibra.bo", emailVerified: true });
    const [t] = await db.insert(tarea).values({ titulo: "Contratar vallas", areaId: 4 }).returning();
    expect(t).toMatchObject({ estado: "pendiente", fechaLimite: null, responsableId: null });

    await db.insert(recordatorio).values({ tareaId: t.id, fechaHora: new Date(), origen: "manual" });
    await db.insert(notificacion).values({ usuarioId: "u1", tareaId: t.id, mensaje: "hola" });

    await db.delete(tarea).where(eq(tarea.id, t.id));
    expect(await db.select().from(recordatorio)).toHaveLength(0);
    expect(await db.select().from(notificacion)).toHaveLength(0);
  });

  it("fecha límite se guarda y se lee como YYYY-MM-DD", async () => {
    const db = await crearDbPrueba();
    const [t] = await db.insert(tarea).values({ titulo: "Pedir permisos", areaId: 5, fechaLimite: "2027-03-10" }).returning();
    expect(t.fechaLimite).toBe("2027-03-10");
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run tests/db/tareas-schema.test.ts`
Expected: FAIL — `tarea` no se exporta de `@/db/schema`.

- [ ] **Step 4: Definir las tablas**

`src/db/tareas-schema.ts`:

```ts
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { area } from "./presupuestos-schema";

// En los CHECK y los índices parciales se usan nombres de columna crudos (ver presupuestos-schema.ts).

export const tarea = pgTable(
  "tarea",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    titulo: text("titulo").notNull(),
    areaId: integer("area_id")
      .notNull()
      .references(() => area.id),
    responsableId: text("responsable_id").references(() => user.id, { onDelete: "set null" }),
    /** Día de vencimiento en La Paz, "YYYY-MM-DD". */
    fechaLimite: date("fecha_limite", { mode: "string" }),
    estado: text("estado", { enum: ["pendiente", "en_curso", "hecha"] }).notNull().default("pendiente"),
    notas: text("notas"),
    creadoPor: text("creado_por").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("tarea_estado_check", sql`estado in ('pendiente', 'en_curso', 'hecha')`),
    index("tarea_area_idx").on(t.areaId),
    index("tarea_responsable_idx").on(t.responsableId),
  ],
);

export const recordatorio = pgTable(
  "recordatorio",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tareaId: text("tarea_id")
      .notNull()
      .references(() => tarea.id, { onDelete: "cascade" }),
    fechaHora: timestamp("fecha_hora", { withTimezone: true }).notNull(),
    origen: text("origen", { enum: ["automatico", "manual"] }).notNull(),
    tipoAutomatico: text("tipo_automatico", { enum: ["3_dias_antes", "dia_vencimiento", "vencida_diario"] }),
    creadoPor: text("creado_por").references(() => user.id, { onDelete: "set null" }),
    enviadoAt: timestamp("enviado_at", { withTimezone: true }),
    canceladoAt: timestamp("cancelado_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("recordatorio_origen_check", sql`origen in ('automatico', 'manual')`),
    check(
      "recordatorio_tipo_check",
      sql`(origen = 'manual' and tipo_automatico is null) or (origen = 'automatico' and tipo_automatico in ('3_dias_antes', 'dia_vencimiento', 'vencida_diario'))`,
    ),
    index("recordatorio_tarea_idx").on(t.tareaId),
    // Lo que consulta el worker cada minuto.
    index("recordatorio_pendiente_idx").on(t.fechaHora).where(sql`enviado_at is null and cancelado_at is null`),
  ],
);

export const notificacion = pgTable(
  "notificacion",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    usuarioId: text("usuario_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tareaId: text("tarea_id")
      .notNull()
      .references(() => tarea.id, { onDelete: "cascade" }),
    mensaje: text("mensaje").notNull(),
    leida: boolean("leida").notNull().default(false),
    /** omitido = el usuario no quiere emails; fallido = se agotaron los reintentos. */
    emailEstado: text("email_estado", { enum: ["pendiente", "enviado", "omitido", "fallido"] })
      .notNull()
      .default("pendiente"),
    intentosEmail: integer("intentos_email").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("notificacion_email_estado_check", sql`email_estado in ('pendiente', 'enviado', 'omitido', 'fallido')`),
    index("notificacion_usuario_idx").on(t.usuarioId, t.leida),
    index("notificacion_email_pendiente_idx").on(t.createdAt).where(sql`email_estado = 'pendiente'`),
  ],
);
```

`src/db/schema.ts`:

```ts
export * from "./auth-schema";
export * from "./presupuestos-schema";
export * from "./tareas-schema";
```

- [ ] **Step 5: Generar la migración**

Run: `npm run db:generate`
Expected: crea `drizzle/0003_<nombre>.sql` con `CREATE TABLE "tarea"`, `"recordatorio"`, `"notificacion"`, las FK con `ON DELETE cascade` / `set null` y los índices parciales con `WHERE` sin calificar.

- [ ] **Step 6: Script del worker**

En `package.json`, agregar a `scripts` (después de `db:seed`):

```json
"worker": "node --env-file-if-exists=.env.local --import tsx src/worker/index.ts"
```

(El archivo se crea en Task 6.)

- [ ] **Step 7: Correr el test y la suite; aplicar en la DB local**

Con `npm run dev` apagado:

Run: `npx vitest run tests/db/tareas-schema.test.ts && npm test && npm run db:migrate`
Expected: PASS; `Migraciones aplicadas`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/db/tareas-schema.ts src/db/schema.ts drizzle tests/db/tareas-schema.test.ts
git commit -m "feat(db): tablas de tareas, recordatorios y notificaciones"
```

---

### Task 2: `reminders.ts` — fechas y mensajes (TDD, puro)

**Files:**
- Create: `src/lib/reminders.ts`
- Test: `tests/lib/reminders.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/lib/reminders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  desdeHoraLaPaz,
  formatearFecha,
  hoyEnLaPaz,
  mensajeRecordatorio,
  nueveDeLaPaz,
  recordatoriosAutomaticos,
  siguienteNueve,
  sumarDias,
} from "@/lib/reminders";

// 1/3/2027 08:00 en La Paz.
const AHORA = new Date("2027-03-01T12:00:00Z");
const iso = (d: Date) => d.toISOString();

describe("fechas en La Paz", () => {
  it("09:00 de La Paz es 13:00 UTC", () => {
    expect(iso(nueveDeLaPaz("2027-03-10"))).toBe("2027-03-10T13:00:00.000Z");
  });

  it("hoy en La Paz puede ser ayer en UTC", () => {
    expect(hoyEnLaPaz(new Date("2027-03-11T02:00:00Z"))).toBe("2027-03-10");
    expect(hoyEnLaPaz(AHORA)).toBe("2027-03-01");
  });

  it("sumarDias cruza meses y años", () => {
    expect(sumarDias("2027-03-01", -3)).toBe("2027-02-26");
    expect(sumarDias("2027-12-31", 1)).toBe("2028-01-01");
  });

  it("siguienteNueve: hoy si todavía no son las 9, si no mañana", () => {
    expect(iso(siguienteNueve(AHORA))).toBe("2027-03-01T13:00:00.000Z");
    expect(iso(siguienteNueve(new Date("2027-03-01T13:00:00Z")))).toBe("2027-03-02T13:00:00.000Z");
  });

  it("desdeHoraLaPaz interpreta un datetime-local como hora de La Paz", () => {
    expect(iso(desdeHoraLaPaz("2027-03-10T15:30"))).toBe("2027-03-10T19:30:00.000Z");
  });

  it("formatearFecha", () => {
    expect(formatearFecha("2027-03-10")).toBe("10/03/2027");
  });
});

describe("recordatoriosAutomaticos", () => {
  const resumen = (fecha: string, ahora = AHORA) =>
    recordatoriosAutomaticos(fecha, ahora).map((r) => [r.tipo, iso(r.fechaHora)]);

  it("fecha lejana: 3 días antes y el día del vencimiento, a las 9", () => {
    expect(resumen("2027-03-10")).toEqual([
      ["3_dias_antes", "2027-03-07T13:00:00.000Z"],
      ["dia_vencimiento", "2027-03-10T13:00:00.000Z"],
    ]);
  });

  it("no crea los que ya pasaron", () => {
    expect(resumen("2027-03-03")).toEqual([["dia_vencimiento", "2027-03-03T13:00:00.000Z"]]);
  });

  it("vence hoy antes de las 9: solo el del día", () => {
    expect(resumen("2027-03-01")).toEqual([["dia_vencimiento", "2027-03-01T13:00:00.000Z"]]);
  });

  it("vence hoy después de las 9: vencida desde mañana", () => {
    expect(resumen("2027-03-01", new Date("2027-03-01T14:00:00Z"))).toEqual([
      ["vencida_diario", "2027-03-02T13:00:00.000Z"],
    ]);
  });

  it("ya vencida: el próximo 09:00", () => {
    expect(resumen("2027-02-20")).toEqual([["vencida_diario", "2027-03-01T13:00:00.000Z"]]);
  });
});

describe("mensajeRecordatorio", () => {
  it("un texto por tipo", () => {
    expect(mensajeRecordatorio("3_dias_antes", "Vallas", "2027-03-10")).toBe('"Vallas" vence en 3 días (10/03/2027)');
    expect(mensajeRecordatorio("dia_vencimiento", "Vallas", "2027-03-10")).toBe('"Vallas" vence hoy');
    expect(mensajeRecordatorio("vencida_diario", "Vallas", "2027-03-10")).toBe(
      '"Vallas" está vencida desde el 10/03/2027',
    );
    expect(mensajeRecordatorio("manual", "Vallas", null)).toBe('Recordatorio: "Vallas"');
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/lib/reminders.test.ts`
Expected: FAIL — no existe `@/lib/reminders`.

- [ ] **Step 3: Implementar**

`src/lib/reminders.ts`:

```ts
// Funciones puras de fechas de recordatorios. Sin DB ni Next.

export const ZONA_EVENTO = "America/La_Paz";
// La Paz es UTC−4 todo el año (Bolivia no tiene horario de verano).
const DESFASE_HORAS = 4;
const HORA_RECORDATORIO = 9;
const HORA_MS = 3_600_000;

export const TIPOS_AUTOMATICOS = ["3_dias_antes", "dia_vencimiento", "vencida_diario"] as const;
export type TipoAutomatico = (typeof TIPOS_AUTOMATICOS)[number];

export type RecordatorioPlanificado = { tipo: TipoAutomatico; fechaHora: Date };

/** 09:00 en La Paz del día `fecha` ("YYYY-MM-DD"), como instante. */
export function nueveDeLaPaz(fecha: string): Date {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia, HORA_RECORDATORIO + DESFASE_HORAS));
}

/** Día calendario en La Paz ("YYYY-MM-DD") del instante `ahora`. */
export function hoyEnLaPaz(ahora: Date): string {
  return new Date(ahora.getTime() - DESFASE_HORAS * HORA_MS).toISOString().slice(0, 10);
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** El próximo 09:00 de La Paz estrictamente posterior a `ahora`. */
export function siguienteNueve(ahora: Date): Date {
  const hoy = hoyEnLaPaz(ahora);
  const nueveHoy = nueveDeLaPaz(hoy);
  return nueveHoy > ahora ? nueveHoy : nueveDeLaPaz(sumarDias(hoy, 1));
}

/** Valor de un `<input type="datetime-local">` ("YYYY-MM-DDTHH:mm") interpretado como hora de La Paz. */
export function desdeHoraLaPaz(valor: string): Date {
  return new Date(`${valor}:00-0${DESFASE_HORAS}:00`);
}

/**
 * Recordatorios automáticos de una fecha límite: 3 días antes y el día del vencimiento,
 * a las 09:00 de La Paz, salvo los que ya pasaron. Si pasaron los dos, la tarea está
 * (o va a estar) vencida: se planifica el primer recordatorio diario de vencida.
 */
export function recordatoriosAutomaticos(fechaLimite: string, ahora: Date): RecordatorioPlanificado[] {
  const candidatos: RecordatorioPlanificado[] = [
    { tipo: "3_dias_antes", fechaHora: nueveDeLaPaz(sumarDias(fechaLimite, -3)) },
    { tipo: "dia_vencimiento", fechaHora: nueveDeLaPaz(fechaLimite) },
  ];
  const futuros = candidatos.filter((r) => r.fechaHora > ahora);
  if (futuros.length > 0) return futuros;
  return [{ tipo: "vencida_diario", fechaHora: siguienteNueve(ahora) }];
}

export function formatearFecha(fecha: string): string {
  return fecha.split("-").reverse().join("/");
}

const FECHA_HORA = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: ZONA_EVENTO,
});

export function formatearFechaHora(instante: Date): string {
  return FECHA_HORA.format(instante);
}

export function mensajeRecordatorio(
  tipo: TipoAutomatico | "manual",
  titulo: string,
  fechaLimite: string | null,
): string {
  const fecha = fechaLimite ? formatearFecha(fechaLimite) : "";
  switch (tipo) {
    case "3_dias_antes":
      return `"${titulo}" vence en 3 días (${fecha})`;
    case "dia_vencimiento":
      return `"${titulo}" vence hoy`;
    case "vencida_diario":
      return `"${titulo}" está vencida desde el ${fecha}`;
    case "manual":
      return `Recordatorio: "${titulo}"`;
  }
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run tests/lib/reminders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reminders.ts tests/lib/reminders.test.ts
git commit -m "feat: cálculo de recordatorios automáticos en hora de La Paz"
```

---

### Task 3: Tareas — ABM, estados y recordatorios automáticos (TDD)

**Files:**
- Create: `src/lib/recordatorios.ts` (solo `pendiente` y `regenerarAutomaticos` en esta task)
- Create: `src/lib/tareas.ts`
- Create: `tests/helpers/tareas.ts`
- Test: `tests/lib/tareas.test.ts`

- [ ] **Step 1: Helper de tests**

`tests/helpers/tareas.ts`:

```ts
import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { recordatorio } from "@/db/schema";
import { crearTarea, tareaSchema } from "@/lib/tareas";

/** 1/3/2027 08:00 en La Paz. */
export const AHORA = new Date("2027-03-01T12:00:00Z");

export const TAREA = { titulo: "Contratar vallas", areaId: "4", responsableId: "", fechaLimite: "", notas: "" };

export function nuevaTarea(
  db: Db,
  extra: Partial<typeof TAREA> = {},
  creadoPor: string | null = null,
  ahora = AHORA,
): Promise<string> {
  return crearTarea(db, tareaSchema.parse({ ...TAREA, ...extra }), creadoPor, ahora);
}

/** Recordatorios de la tarea ordenados por fecha, en forma comparable. */
export async function recordatoriosDe(db: Db, tareaId: string) {
  const filas = await db
    .select()
    .from(recordatorio)
    .where(eq(recordatorio.tareaId, tareaId))
    .orderBy(asc(recordatorio.fechaHora));
  return filas.map((r) => ({
    tipo: r.tipoAutomatico ?? r.origen,
    fechaHora: r.fechaHora.toISOString(),
    estado: r.canceladoAt ? "cancelado" : r.enviadoAt ? "enviado" : "pendiente",
  }));
}
```

- [ ] **Step 2: Escribir el test que falla**

`tests/lib/tareas.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import {
  borrarTarea,
  cambiarEstadoTarea,
  editarTarea,
  listarTareas,
  obtenerTarea,
  resumenTareas,
  tareaSchema,
} from "@/lib/tareas";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { AHORA, nuevaTarea, recordatoriosDe, TAREA } from "../helpers/tareas";

describe("tareaSchema", () => {
  it("campos opcionales vacíos quedan en null", () => {
    expect(tareaSchema.parse(TAREA)).toEqual({
      titulo: "Contratar vallas",
      areaId: 4,
      responsableId: null,
      fechaLimite: null,
      notas: null,
    });
  });

  it("rechaza fechas inválidas", () => {
    for (const fechaLimite of ["10/03/2027", "2027-02-30", "mañana"]) {
      expect(tareaSchema.safeParse({ ...TAREA, fechaLimite }).error?.issues[0].message).toBe("Fecha inválida");
    }
  });

  it("título obligatorio", () => {
    expect(tareaSchema.safeParse({ ...TAREA, titulo: " " }).error?.issues[0].message).toBe("El título es muy corto");
  });
});

describe("con DB", () => {
  let db: Db;
  beforeEach(async () => {
    db = await crearDbPrueba();
  });

  it("crear sin fecha límite no crea recordatorios", async () => {
    const id = await nuevaTarea(db);
    expect(await obtenerTarea(db, id)).toMatchObject({ titulo: "Contratar vallas", area: "Infraestructura y Predio" });
    expect(await recordatoriosDe(db, id)).toEqual([]);
  });

  it("crear con fecha límite crea los automáticos", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10" });
    expect(await recordatoriosDe(db, id)).toEqual([
      { tipo: "3_dias_antes", fechaHora: "2027-03-07T13:00:00.000Z", estado: "pendiente" },
      { tipo: "dia_vencimiento", fechaHora: "2027-03-10T13:00:00.000Z", estado: "pendiente" },
    ]);
  });

  it("cambiar la fecha límite cancela los automáticos viejos y crea nuevos", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10" });
    await editarTarea(db, id, tareaSchema.parse({ ...TAREA, fechaLimite: "2027-03-20" }), AHORA);
    const pendientes = (await recordatoriosDe(db, id)).filter((r) => r.estado === "pendiente");
    expect(pendientes.map((r) => r.fechaHora)).toEqual(["2027-03-17T13:00:00.000Z", "2027-03-20T13:00:00.000Z"]);
    expect((await recordatoriosDe(db, id)).filter((r) => r.estado === "cancelado")).toHaveLength(2);
  });

  it("editar sin cambiar la fecha no toca los recordatorios", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10" });
    await editarTarea(db, id, tareaSchema.parse({ ...TAREA, titulo: "Otro título", fechaLimite: "2027-03-10" }), AHORA);
    expect((await recordatoriosDe(db, id)).every((r) => r.estado === "pendiente")).toBe(true);
    expect((await obtenerTarea(db, id))?.titulo).toBe("Otro título");
  });

  it("marcar hecha cancela todos los pendientes; reabrir regenera los automáticos", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10" });
    await cambiarEstadoTarea(db, id, "hecha", AHORA);
    expect((await recordatoriosDe(db, id)).every((r) => r.estado === "cancelado")).toBe(true);

    await cambiarEstadoTarea(db, id, "en_curso", AHORA);
    expect((await recordatoriosDe(db, id)).filter((r) => r.estado === "pendiente")).toHaveLength(2);
    expect((await obtenerTarea(db, id))?.estado).toBe("en_curso");
  });

  it("pasar de pendiente a en curso no toca los recordatorios", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10" });
    await cambiarEstadoTarea(db, id, "en_curso", AHORA);
    expect(await recordatoriosDe(db, id)).toHaveLength(2);
  });

  it("responsable o área inexistente vuelve como ErrorNegocio", async () => {
    await expect(nuevaTarea(db, { responsableId: "no-existe" })).rejects.toThrow("Área o responsable inválido");
    await expect(nuevaTarea(db, { areaId: "99" })).rejects.toThrow("Área o responsable inválido");
  });

  it("editar, cambiar estado o borrar una tarea inexistente vuelve como ErrorNegocio", async () => {
    await expect(editarTarea(db, "x", tareaSchema.parse(TAREA))).rejects.toThrow("La tarea no existe");
    await expect(cambiarEstadoTarea(db, "x", "hecha")).rejects.toThrow("La tarea no existe");
    await expect(borrarTarea(db, "x")).rejects.toThrow("La tarea no existe");
  });

  it("borra", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10" });
    await borrarTarea(db, id);
    expect(await obtenerTarea(db, id)).toBeUndefined();
  });

  describe("listarTareas", () => {
    it("ordena por fecha límite (sin fecha al final) y filtra", async () => {
      const { editor } = await crearActores(db);
      await nuevaTarea(db, { titulo: "Sin fecha" });
      await nuevaTarea(db, { titulo: "Tarde", fechaLimite: "2027-04-01", responsableId: editor.id });
      await nuevaTarea(db, { titulo: "Temprano", fechaLimite: "2027-03-05", areaId: "1" });

      expect((await listarTareas(db)).map((t) => t.titulo)).toEqual(["Temprano", "Tarde", "Sin fecha"]);
      expect((await listarTareas(db, { areaId: 1 })).map((t) => t.titulo)).toEqual(["Temprano"]);
      expect((await listarTareas(db, { responsableId: editor.id }))[0]).toMatchObject({
        titulo: "Tarde",
        responsable: "editor@vibra.bo",
      });
      expect(await listarTareas(db, { estado: "hecha" })).toHaveLength(0);
    });
  });

  describe("resumenTareas", () => {
    it("hechas por área, vencidas y próximas 7 días (sin contar hechas)", async () => {
      await nuevaTarea(db, { titulo: "Vencida", fechaLimite: "2027-02-25" });
      await nuevaTarea(db, { titulo: "Hoy", fechaLimite: "2027-03-01" });
      await nuevaTarea(db, { titulo: "En una semana", fechaLimite: "2027-03-08" });
      await nuevaTarea(db, { titulo: "Lejos", fechaLimite: "2027-04-01" });
      const hecha = await nuevaTarea(db, { titulo: "Hecha vencida", fechaLimite: "2027-02-20" });
      await cambiarEstadoTarea(db, hecha, "hecha", AHORA);

      const resumen = await resumenTareas(db, AHORA);
      expect(resumen.vencidas.map((t) => t.titulo)).toEqual(["Vencida"]);
      expect(resumen.proximas.map((t) => t.titulo)).toEqual(["Hoy", "En una semana"]);
      expect(resumen.porArea.get(4)).toEqual({ hechas: 1, total: 5 });
      expect(resumen.porArea.get(1)).toBeUndefined();
    });
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run tests/lib/tareas.test.ts`
Expected: FAIL — no existe `@/lib/tareas`.

- [ ] **Step 4: Implementar**

`src/lib/recordatorios.ts` (Task 4 le agrega los manuales):

```ts
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { recordatorio } from "@/db/schema";
import { recordatoriosAutomaticos } from "@/lib/reminders";

/** Transacción de drizzle (mismo API que `Db`). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Recordatorio que todavía puede dispararse. */
export const pendiente = and(isNull(recordatorio.enviadoAt), isNull(recordatorio.canceladoAt));

/** Cancela los recordatorios pendientes de la tarea (todos, o solo los automáticos). */
export async function cancelarPendientes(tx: Tx, tareaId: string, ahora: Date, soloAutomaticos = false) {
  await tx
    .update(recordatorio)
    .set({ canceladoAt: ahora })
    .where(
      and(
        eq(recordatorio.tareaId, tareaId),
        pendiente,
        soloAutomaticos ? eq(recordatorio.origen, "automatico") : undefined,
      ),
    );
}

/** Reemplaza los automáticos pendientes por los que corresponden a la fecha límite actual. */
export async function regenerarAutomaticos(
  tx: Tx,
  tareaId: string,
  fechaLimite: string | null,
  hecha: boolean,
  ahora: Date,
) {
  await cancelarPendientes(tx, tareaId, ahora, true);
  if (!fechaLimite || hecha) return;
  await tx.insert(recordatorio).values(
    recordatoriosAutomaticos(fechaLimite, ahora).map((r) => ({
      tareaId,
      origen: "automatico" as const,
      tipoAutomatico: r.tipo,
      fechaHora: r.fechaHora,
    })),
  );
}
```

`src/lib/tareas.ts`:

```ts
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { area, tarea, user } from "@/db/schema";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";
import { cancelarPendientes, regenerarAutomaticos } from "@/lib/recordatorios";
import { hoyEnLaPaz, sumarDias } from "@/lib/reminders";
import { textoOpcional } from "@/lib/validacion";

export const ESTADOS_TAREA = ["pendiente", "en_curso", "hecha"] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  // Rechaza fechas que no existen (2027-02-30): son inválidas o al normalizarlas cambian.
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
  }, "Fecha inválida");

export const tareaSchema = z.object({
  titulo: z.string("Falta el título").trim().min(2, "El título es muy corto").max(200, "El título es muy largo"),
  areaId: z.coerce.number("Área inválida").int("Área inválida").positive("Área inválida"),
  responsableId: z
    .string()
    .optional()
    .transform((v) => v || null),
  fechaLimite: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(fechaSchema.nullable()),
  notas: textoOpcional(2000),
});

export type DatosTarea = z.infer<typeof tareaSchema>;

const MENSAJES = { fk: "Área o responsable inválido" };

export async function crearTarea(
  db: Db,
  datos: DatosTarea,
  creadoPor: string | null,
  ahora = new Date(),
): Promise<string> {
  return conRestricciones(
    () =>
      db.transaction(async (tx) => {
        const [fila] = await tx.insert(tarea).values({ ...datos, creadoPor }).returning({ id: tarea.id });
        await regenerarAutomaticos(tx, fila.id, datos.fechaLimite, false, ahora);
        return fila.id;
      }),
    MENSAJES,
  );
}

export async function editarTarea(db: Db, id: string, datos: DatosTarea, ahora = new Date()): Promise<void> {
  await conRestricciones(
    () =>
      db.transaction(async (tx) => {
        const [actual] = await tx
          .select({ fechaLimite: tarea.fechaLimite, estado: tarea.estado })
          .from(tarea)
          .where(eq(tarea.id, id))
          .for("update");
        if (!actual) throw new ErrorNegocio("La tarea no existe");

        await tx.update(tarea).set(datos).where(eq(tarea.id, id));
        if (actual.fechaLimite !== datos.fechaLimite) {
          await regenerarAutomaticos(tx, id, datos.fechaLimite, actual.estado === "hecha", ahora);
        }
      }),
    MENSAJES,
  );
}

/** Hecha cancela todos los recordatorios pendientes; reabrir regenera los automáticos. */
export async function cambiarEstadoTarea(db: Db, id: string, estado: EstadoTarea, ahora = new Date()) {
  await db.transaction(async (tx) => {
    const [actual] = await tx
      .select({ fechaLimite: tarea.fechaLimite, estado: tarea.estado })
      .from(tarea)
      .where(eq(tarea.id, id))
      .for("update");
    if (!actual) throw new ErrorNegocio("La tarea no existe");
    if (actual.estado === estado) return;

    await tx.update(tarea).set({ estado }).where(eq(tarea.id, id));
    if (estado === "hecha") await cancelarPendientes(tx, id, ahora);
    else if (actual.estado === "hecha") await regenerarAutomaticos(tx, id, actual.fechaLimite, false, ahora);
  });
}

/** Sus recordatorios y notificaciones se borran en cascada. */
export async function borrarTarea(db: Db, id: string): Promise<void> {
  const filas = await db.delete(tarea).where(eq(tarea.id, id)).returning({ id: tarea.id });
  if (filas.length === 0) throw new ErrorNegocio("La tarea no existe");
}

function consultaTareas(db: Db) {
  return db
    .select({
      id: tarea.id,
      titulo: tarea.titulo,
      areaId: tarea.areaId,
      area: area.nombre,
      responsableId: tarea.responsableId,
      responsable: user.name,
      fechaLimite: tarea.fechaLimite,
      estado: tarea.estado,
      notas: tarea.notas,
      creadoPor: tarea.creadoPor,
    })
    .from(tarea)
    .innerJoin(area, eq(tarea.areaId, area.id))
    .leftJoin(user, eq(tarea.responsableId, user.id));
}

export type FiltroTareas = { areaId?: number; responsableId?: string; estado?: EstadoTarea };

/** Ordenadas por fecha límite (las sin fecha al final). */
export function listarTareas(db: Db, filtro: FiltroTareas = {}) {
  return consultaTareas(db)
    .where(
      and(
        filtro.areaId ? eq(tarea.areaId, filtro.areaId) : undefined,
        filtro.responsableId ? eq(tarea.responsableId, filtro.responsableId) : undefined,
        filtro.estado ? eq(tarea.estado, filtro.estado) : undefined,
      ),
    )
    .orderBy(sql`${tarea.fechaLimite} asc nulls last`, asc(tarea.createdAt));
}

export type TareaListada = Awaited<ReturnType<typeof listarTareas>>[number];

export async function obtenerTarea(db: Db, id: string) {
  const [fila] = await consultaTareas(db).where(eq(tarea.id, id));
  return fila;
}

/** Para el tablero: avance por área, vencidas y las que vencen en los próximos 7 días. */
export async function resumenTareas(db: Db, ahora = new Date()) {
  const tareas = await listarTareas(db);
  const hoy = hoyEnLaPaz(ahora);
  const enUnaSemana = sumarDias(hoy, 7);

  const porArea = new Map<number, { hechas: number; total: number }>();
  for (const t of tareas) {
    const actual = porArea.get(t.areaId) ?? { hechas: 0, total: 0 };
    porArea.set(t.areaId, { hechas: actual.hechas + (t.estado === "hecha" ? 1 : 0), total: actual.total + 1 });
  }

  // Las fechas "YYYY-MM-DD" se comparan bien como texto.
  const abiertas = tareas.filter((t): t is TareaListada & { fechaLimite: string } => t.estado !== "hecha" && !!t.fechaLimite);
  return {
    porArea,
    vencidas: abiertas.filter((t) => t.fechaLimite < hoy),
    proximas: abiertas.filter((t) => t.fechaLimite >= hoy && t.fechaLimite <= enUnaSemana),
  };
}
```

- [ ] **Step 5: Correr el test y la suite**

Run: `npx vitest run tests/lib/tareas.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/recordatorios.ts src/lib/tareas.ts tests/helpers/tareas.ts tests/lib/tareas.test.ts
git commit -m "feat: tareas con estados y recordatorios automáticos"
```

---

### Task 4: Recordatorios manuales (TDD)

**Files:**
- Modify: `src/lib/recordatorios.ts`
- Test: `tests/lib/recordatorios.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/lib/recordatorios.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import type { Actor } from "@/lib/permissions";
import {
  cancelarRecordatorio,
  crearRecordatorioManual,
  listarRecordatorios,
  puedeGestionarRecordatorios,
  recordatorioManualSchema,
} from "@/lib/recordatorios";
import { cambiarEstadoTarea } from "@/lib/tareas";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { AHORA, nuevaTarea, recordatoriosDe } from "../helpers/tareas";

const EN_UNA_HORA = "2027-03-01T09:00"; // hora de La Paz

describe("recordatorioManualSchema", () => {
  it("interpreta la hora como La Paz", () => {
    expect(recordatorioManualSchema.parse({ tareaId: "t", fechaHora: EN_UNA_HORA }).fechaHora.toISOString()).toBe(
      "2027-03-01T13:00:00.000Z",
    );
  });

  it("rechaza formatos raros", () => {
    expect(recordatorioManualSchema.safeParse({ tareaId: "t", fechaHora: "mañana" }).error?.issues[0].message).toBe(
      "Fecha y hora inválidas",
    );
  });
});

describe("puedeGestionarRecordatorios", () => {
  it("el creador o un admin", () => {
    expect(puedeGestionarRecordatorios({ id: "a", role: "editor" }, "a")).toBe(true);
    expect(puedeGestionarRecordatorios({ id: "b", role: "editor" }, "a")).toBe(false);
    expect(puedeGestionarRecordatorios({ id: "b", role: "admin" }, "a")).toBe(true);
  });
});

describe("con DB", () => {
  let db: Db;
  let admin: Actor;
  let editor: Actor;
  let otroEditor: Actor;
  let tareaId: string;
  const datos = (fechaHora = EN_UNA_HORA) => recordatorioManualSchema.parse({ tareaId, fechaHora });

  beforeEach(async () => {
    db = await crearDbPrueba();
    ({ admin, editor } = await crearActores(db));
    otroEditor = { id: admin.id, role: "editor" }; // existe en DB pero no es el creador ni admin
    tareaId = await nuevaTarea(db, {}, editor.id);
  });

  it("el creador agrega un manual futuro", async () => {
    await crearRecordatorioManual(db, editor, datos(), AHORA);
    expect(await recordatoriosDe(db, tareaId)).toEqual([
      { tipo: "manual", fechaHora: "2027-03-01T13:00:00.000Z", estado: "pendiente" },
    ]);
  });

  it("rechaza fechas pasadas, tareas hechas y a quien no es creador ni admin", async () => {
    await expect(crearRecordatorioManual(db, editor, datos("2027-03-01T07:00"), AHORA)).rejects.toThrow(
      "La fecha tiene que ser futura",
    );
    await expect(crearRecordatorioManual(db, otroEditor, datos(), AHORA)).rejects.toThrow(
      "No tenés permiso para hacer esto",
    );
    await cambiarEstadoTarea(db, tareaId, "hecha", AHORA);
    await expect(crearRecordatorioManual(db, admin, datos(), AHORA)).rejects.toThrow("La tarea ya está hecha");
  });

  it("cancela un manual pendiente; no cancela automáticos", async () => {
    await crearRecordatorioManual(db, editor, datos(), AHORA);
    const [manual] = await listarRecordatorios(db, tareaId);
    await expect(cancelarRecordatorio(db, otroEditor, manual.id, AHORA)).rejects.toThrow(
      "No tenés permiso para hacer esto",
    );
    await cancelarRecordatorio(db, admin, manual.id, AHORA);
    expect((await recordatoriosDe(db, tareaId))[0].estado).toBe("cancelado");
    await expect(cancelarRecordatorio(db, admin, manual.id, AHORA)).rejects.toThrow(
      "El recordatorio no existe o ya no está pendiente",
    );

    const conFecha = await nuevaTarea(db, { fechaLimite: "2027-03-10" }, editor.id);
    const [automatico] = await listarRecordatorios(db, conFecha);
    await expect(cancelarRecordatorio(db, admin, automatico.id, AHORA)).rejects.toThrow(
      "Los recordatorios automáticos no se cancelan a mano",
    );
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/lib/recordatorios.test.ts`
Expected: FAIL — `crearRecordatorioManual` no está exportado.

- [ ] **Step 3: Implementar**

En `src/lib/recordatorios.ts`, cambiar los imports por:

```ts
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { recordatorio, tarea } from "@/db/schema";
import { ErrorNegocio } from "@/lib/acciones";
import { can, ErrorPermiso, type Actor } from "@/lib/permissions";
import { desdeHoraLaPaz, recordatoriosAutomaticos } from "@/lib/reminders";
```

y agregar al final:

```ts
export const recordatorioManualSchema = z.object({
  tareaId: z.string("Tarea inválida").min(1, "Tarea inválida"),
  fechaHora: z
    .string("Falta la fecha y hora")
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha y hora inválidas")
    .transform(desdeHoraLaPaz)
    .refine((d) => !Number.isNaN(d.getTime()), "Fecha y hora inválidas"),
});

export type DatosRecordatorioManual = z.infer<typeof recordatorioManualSchema>;

/** Los manuales los agrega o cancela quien creó la tarea, o un admin. */
export function puedeGestionarRecordatorios(actor: Actor, creadorTarea: string | null): boolean {
  return creadorTarea === actor.id || can(actor.role, "configurar");
}

export async function crearRecordatorioManual(
  db: Db,
  actor: Actor,
  datos: DatosRecordatorioManual,
  ahora = new Date(),
): Promise<void> {
  if (datos.fechaHora <= ahora) throw new ErrorNegocio("La fecha tiene que ser futura");
  const [t] = await db
    .select({ creadoPor: tarea.creadoPor, estado: tarea.estado })
    .from(tarea)
    .where(eq(tarea.id, datos.tareaId));
  if (!t) throw new ErrorNegocio("La tarea no existe");
  if (!puedeGestionarRecordatorios(actor, t.creadoPor)) throw new ErrorPermiso();
  if (t.estado === "hecha") throw new ErrorNegocio("La tarea ya está hecha");

  await db.insert(recordatorio).values({ ...datos, origen: "manual", creadoPor: actor.id });
}

export async function cancelarRecordatorio(db: Db, actor: Actor, id: string, ahora = new Date()): Promise<void> {
  const [r] = await db
    .select({ origen: recordatorio.origen, creadorTarea: tarea.creadoPor })
    .from(recordatorio)
    .innerJoin(tarea, eq(recordatorio.tareaId, tarea.id))
    .where(and(eq(recordatorio.id, id), pendiente));
  if (!r) throw new ErrorNegocio("El recordatorio no existe o ya no está pendiente");
  if (r.origen !== "manual") throw new ErrorNegocio("Los recordatorios automáticos no se cancelan a mano");
  if (!puedeGestionarRecordatorios(actor, r.creadorTarea)) throw new ErrorPermiso();

  await db.update(recordatorio).set({ canceladoAt: ahora }).where(eq(recordatorio.id, id));
}

export function listarRecordatorios(db: Db, tareaId: string) {
  return db
    .select({
      id: recordatorio.id,
      fechaHora: recordatorio.fechaHora,
      origen: recordatorio.origen,
      tipoAutomatico: recordatorio.tipoAutomatico,
      enviadoAt: recordatorio.enviadoAt,
      canceladoAt: recordatorio.canceladoAt,
    })
    .from(recordatorio)
    .where(eq(recordatorio.tareaId, tareaId))
    .orderBy(asc(recordatorio.fechaHora));
}
```

- [ ] **Step 4: Correr el test y la suite**

Run: `npx vitest run tests/lib/recordatorios.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recordatorios.ts tests/lib/recordatorios.test.ts
git commit -m "feat: recordatorios manuales"
```

---

### Task 5: Envío de recordatorios y emails (TDD)

**Files:**
- Create: `src/lib/email.ts`, `src/lib/envio-recordatorios.ts`
- Modify: `.env.example`
- Test: `tests/lib/envio-recordatorios.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/lib/envio-recordatorios.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { notificacion, user } from "@/db/schema";
import type { Email } from "@/lib/email";
import { enviarEmailsPendientes, MAX_INTENTOS_EMAIL, procesarRecordatorios } from "@/lib/envio-recordatorios";
import type { Actor } from "@/lib/permissions";
import { cambiarEstadoTarea } from "@/lib/tareas";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { AHORA, nuevaTarea, recordatoriosDe } from "../helpers/tareas";

const DIA_10_NUEVE = new Date("2027-03-10T13:00:00Z");
// Una tarea que vence el 3/3 creada el 1/3 solo tiene el recordatorio del día (el de 3 días antes ya pasó).
const DIA_3_NUEVE = new Date("2027-03-03T13:00:00Z");
const notificaciones = (db: Db) => db.select().from(notificacion);

let db: Db;
let admin: Actor;
let editor: Actor;
beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
});

describe("procesarRecordatorios", () => {
  it("notifica al responsable una sola vez, aunque se corra dos veces", async () => {
    const id = await nuevaTarea(db, { titulo: "Vallas", fechaLimite: "2027-03-10", responsableId: editor.id });
    const tresDiasAntes = new Date("2027-03-07T13:00:00Z");

    expect(await procesarRecordatorios(db, tresDiasAntes)).toBe(1);
    expect(await procesarRecordatorios(db, tresDiasAntes)).toBe(0);

    expect(await notificaciones(db)).toMatchObject([
      { usuarioId: editor.id, tareaId: id, mensaje: '"Vallas" vence en 3 días (10/03/2027)', leida: false },
    ]);
  });

  it("no manda los futuros ni los cancelados", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10", responsableId: editor.id });
    expect(await procesarRecordatorios(db, AHORA)).toBe(0);
    await cambiarEstadoTarea(db, id, "hecha", AHORA);
    expect(await procesarRecordatorios(db, DIA_10_NUEVE)).toBe(0);
  });

  it("sin responsable notifica a todos los admins", async () => {
    await nuevaTarea(db, { fechaLimite: "2027-03-03" });
    await procesarRecordatorios(db, DIA_3_NUEVE);
    expect((await notificaciones(db)).map((n) => n.usuarioId)).toEqual([admin.id]);
  });

  it("el día del vencimiento, si no está hecha, planifica el diario de vencida", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10", responsableId: editor.id });
    await procesarRecordatorios(db, DIA_10_NUEVE);
    expect((await recordatoriosDe(db, id)).at(-1)).toEqual({
      tipo: "vencida_diario",
      fechaHora: "2027-03-11T13:00:00.000Z",
      estado: "pendiente",
    });

    // Y el diario se sigue encadenando.
    await procesarRecordatorios(db, new Date("2027-03-11T13:00:30Z"));
    expect((await recordatoriosDe(db, id)).at(-1)?.fechaHora).toBe("2027-03-12T13:00:00.000Z");
  });

  it("quien no quiere emails recibe la notificación con email omitido", async () => {
    await db.update(user).set({ recibirEmails: false }).where(eq(user.id, editor.id));
    await nuevaTarea(db, { fechaLimite: "2027-03-03", responsableId: editor.id });
    await procesarRecordatorios(db, DIA_3_NUEVE);
    expect((await notificaciones(db)).map((n) => n.emailEstado)).toEqual(["omitido"]);
  });

  it("si borraron al responsable, les llega a los admins", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-03", responsableId: editor.id });
    await db.delete(user).where(eq(user.id, editor.id));
    await procesarRecordatorios(db, DIA_3_NUEVE);
    const filas = await db.select().from(notificacion).where(eq(notificacion.tareaId, id));
    expect(filas.map((n) => n.usuarioId)).toEqual([admin.id]);
  });
});

describe("enviarEmailsPendientes", () => {
  beforeEach(async () => {
    await nuevaTarea(db, { titulo: "Vallas", fechaLimite: "2027-03-03", responsableId: editor.id });
    await procesarRecordatorios(db, DIA_3_NUEVE);
  });

  it("manda el email con link a la tarea y lo marca enviado", async () => {
    const enviados: Email[] = [];
    await enviarEmailsPendientes(db, async (email) => void enviados.push(email), "https://vibra.test");
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ para: "editor@vibra.bo", asunto: 'Vibra 2027 — "Vallas" vence hoy' });
    expect(enviados[0].texto).toMatch(/https:\/\/vibra\.test\/tareas\/[0-9a-f-]{36}/);
    expect((await notificaciones(db))[0]).toMatchObject({ emailEstado: "enviado", intentosEmail: 1 });

    await enviarEmailsPendientes(db, async (email) => void enviados.push(email), "https://vibra.test");
    expect(enviados).toHaveLength(1);
  });

  it("si falla reintenta en la próxima corrida, hasta el máximo", async () => {
    const fallar = async () => {
      throw new Error("SMTP caído");
    };
    for (let i = 1; i < MAX_INTENTOS_EMAIL; i++) {
      await enviarEmailsPendientes(db, fallar, "https://vibra.test");
      expect((await notificaciones(db))[0]).toMatchObject({ emailEstado: "pendiente", intentosEmail: i });
    }
    await enviarEmailsPendientes(db, fallar, "https://vibra.test");
    expect((await notificaciones(db))[0]).toMatchObject({ emailEstado: "fallido", intentosEmail: MAX_INTENTOS_EMAIL });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/lib/envio-recordatorios.test.ts`
Expected: FAIL — no existen los módulos.

- [ ] **Step 3: Implementar**

`src/lib/email.ts`:

```ts
import nodemailer from "nodemailer";

export type Email = { para: string; asunto: string; texto: string };
export type EnviarEmail = (email: Email) => Promise<void>;

/** SMTP según las variables de entorno; sin SMTP_HOST, escribe los emails en la consola. */
export function crearEnviador(): EnviarEmail {
  const host = process.env.SMTP_HOST;
  if (!host) {
    return async ({ para, asunto, texto }) => {
      console.log(`[email sin SMTP] Para: ${para}\nAsunto: ${asunto}\n${texto}`);
    };
  }

  const usuario = process.env.SMTP_USER;
  const transporte = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: usuario ? { user: usuario, pass: process.env.SMTP_PASS } : undefined,
  });
  const remitente = process.env.SMTP_FROM || usuario;

  return async ({ para, asunto, texto }) => {
    await transporte.sendMail({ from: remitente, to: para, subject: asunto, text: texto });
  };
}
```

`src/lib/envio-recordatorios.ts`:

```ts
import { and, asc, eq, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notificacion, recordatorio, tarea, user } from "@/db/schema";
import type { EnviarEmail } from "@/lib/email";
import { pendiente } from "@/lib/recordatorios";
import { mensajeRecordatorio, siguienteNueve } from "@/lib/reminders";

// Lógica del worker (src/worker/ciclo.ts). Testeable con una DB de prueba.

export const MAX_INTENTOS_EMAIL = 5;
const LOTE = 100;

/**
 * Toma los recordatorios vencidos y, en la misma transacción, crea las notificaciones y
 * los marca enviados. `SKIP LOCKED`: dos workers a la vez nunca toman el mismo.
 * Devuelve cuántos recordatorios procesó.
 */
export async function procesarRecordatorios(db: Db, ahora = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    const vencidos = await tx
      .select({
        id: recordatorio.id,
        tareaId: recordatorio.tareaId,
        tipoAutomatico: recordatorio.tipoAutomatico,
        titulo: tarea.titulo,
        fechaLimite: tarea.fechaLimite,
        estado: tarea.estado,
        responsableId: tarea.responsableId,
      })
      .from(recordatorio)
      .innerJoin(tarea, eq(recordatorio.tareaId, tarea.id))
      .where(and(lte(recordatorio.fechaHora, ahora), pendiente))
      .orderBy(asc(recordatorio.fechaHora))
      .limit(LOTE)
      .for("update", { of: recordatorio, skipLocked: true });
    if (vencidos.length === 0) return 0;

    const usuarios = await tx.select({ id: user.id, role: user.role, recibirEmails: user.recibirEmails }).from(user);
    const recibeEmails = new Map(usuarios.map((u) => [u.id, u.recibirEmails]));
    const admins = usuarios.filter((u) => u.role === "admin").map((u) => u.id);

    for (const r of vencidos) {
      // Sin responsable (o si lo borraron), les llega a todos los admins.
      const destinatarios = r.responsableId ? [r.responsableId] : admins;
      const mensaje = mensajeRecordatorio(r.tipoAutomatico ?? "manual", r.titulo, r.fechaLimite);
      if (destinatarios.length > 0) {
        await tx.insert(notificacion).values(
          destinatarios.map((usuarioId) => ({
            usuarioId,
            tareaId: r.tareaId,
            mensaje,
            emailEstado: recibeEmails.get(usuarioId) ? ("pendiente" as const) : ("omitido" as const),
          })),
        );
      }
      await tx.update(recordatorio).set({ enviadoAt: ahora }).where(eq(recordatorio.id, r.id));

      const vencida = r.tipoAutomatico === "dia_vencimiento" || r.tipoAutomatico === "vencida_diario";
      if (vencida && r.estado !== "hecha") {
        await tx.insert(recordatorio).values({
          tareaId: r.tareaId,
          origen: "automatico",
          tipoAutomatico: "vencida_diario",
          fechaHora: siguienteNueve(ahora),
        });
      }
    }
    return vencidos.length;
  });
}

/**
 * Manda los emails de las notificaciones pendientes. Si uno falla se reintenta en la
 * próxima corrida; después de MAX_INTENTOS_EMAIL queda como fallido.
 */
export async function enviarEmailsPendientes(db: Db, enviar: EnviarEmail, urlBase: string): Promise<void> {
  await db.transaction(async (tx) => {
    const pendientes = await tx
      .select({
        id: notificacion.id,
        tareaId: notificacion.tareaId,
        mensaje: notificacion.mensaje,
        intentos: notificacion.intentosEmail,
        email: user.email,
      })
      .from(notificacion)
      .innerJoin(user, eq(notificacion.usuarioId, user.id))
      .where(eq(notificacion.emailEstado, "pendiente"))
      .orderBy(asc(notificacion.createdAt))
      .limit(LOTE)
      .for("update", { of: notificacion, skipLocked: true });

    for (const n of pendientes) {
      const intentos = n.intentos + 1;
      try {
        await enviar({
          para: n.email,
          asunto: `Vibra 2027 — ${n.mensaje}`,
          texto: `${n.mensaje}\n\nVer la tarea: ${urlBase}/tareas/${n.tareaId}`,
        });
        await tx.update(notificacion).set({ emailEstado: "enviado", intentosEmail: intentos }).where(eq(notificacion.id, n.id));
      } catch (error) {
        console.error(`[worker] no se pudo enviar el email de la notificación ${n.id}`, error);
        await tx
          .update(notificacion)
          .set({ intentosEmail: intentos, emailEstado: intentos >= MAX_INTENTOS_EMAIL ? "fallido" : "pendiente" })
          .where(eq(notificacion.id, n.id));
      }
    }
  });
}
```

En `.env.example`, agregar al final:

```bash

# Worker de recordatorios. En desarrollo (PGlite) poné true para que corra dentro de `npm run dev`.
# En el VPS dejalo vacío: corre `npm run worker` en su propio contenedor.
WORKER_EN_APP=

# SMTP para los emails de recordatorios. Sin SMTP_HOST, los emails se escriben en la consola.
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

- [ ] **Step 4: Correr el test y la suite**

Run: `npx vitest run tests/lib/envio-recordatorios.test.ts && npm test && npx tsc --noEmit`
Expected: PASS. (Los tests de fallas imprimen `[worker] no se pudo enviar…` en la consola: es esperado.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/lib/envio-recordatorios.ts .env.example tests/lib/envio-recordatorios.test.ts
git commit -m "feat: envío de recordatorios con notificaciones y emails con reintentos"
```

---

### Task 6: Worker — ciclo, proceso aparte y arranque dentro de Next

**Files:**
- Create: `src/worker/ciclo.ts`, `src/worker/index.ts`, `src/worker/en-app.ts`, `src/instrumentation.ts`
- Modify: `next.config.ts` (nodemailer fuera del bundle)
- Test: `tests/worker/ciclo.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/worker/ciclo.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { notificacion } from "@/db/schema";
import { correrCiclo, iniciarWorker, INTERVALO_MS } from "@/worker/ciclo";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { nuevaTarea } from "../helpers/tareas";

afterEach(() => {
  vi.useRealTimers();
});

describe("correrCiclo", () => {
  it("procesa los recordatorios vencidos y manda sus emails", async () => {
    const db = await crearDbPrueba();
    const { editor } = await crearActores(db);
    // Creada el 1/3 con vencimiento el 3/3: solo tiene el recordatorio del día.
    await nuevaTarea(db, { fechaLimite: "2027-03-03", responsableId: editor.id });
    const enviar = vi.fn(async () => {});

    expect(await correrCiclo(db, enviar, "https://vibra.test", new Date("2027-03-03T13:00:00Z"))).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect((await db.select().from(notificacion))[0].emailEstado).toBe("enviado");
  });
});

describe("iniciarWorker", () => {
  it("corre al iniciar y después una vez por intervalo, hasta detenerlo", async () => {
    vi.useFakeTimers();
    const ciclo = vi.fn(async () => 0);
    const detener = iniciarWorker(ciclo);
    await vi.advanceTimersByTimeAsync(0);
    expect(ciclo).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVALO_MS);
    expect(ciclo).toHaveBeenCalledTimes(2);

    detener();
    await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3);
    expect(ciclo).toHaveBeenCalledTimes(2);
  });

  it("si un ciclo falla, sigue con el próximo", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ciclo = vi.fn().mockRejectedValueOnce(new Error("DB caída")).mockResolvedValue(0);
    const detener = iniciarWorker(ciclo);
    await vi.advanceTimersByTimeAsync(INTERVALO_MS);
    expect(ciclo).toHaveBeenCalledTimes(2);
    detener();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/worker/ciclo.test.ts`
Expected: FAIL — no existe `@/worker/ciclo`.

- [ ] **Step 3: Implementar**

`src/worker/ciclo.ts`:

```ts
import type { Db } from "@/db/client";
import type { EnviarEmail } from "@/lib/email";
import { enviarEmailsPendientes, procesarRecordatorios } from "@/lib/envio-recordatorios";

export const INTERVALO_MS = 60_000;

/** Una corrida: notifica los recordatorios vencidos y manda los emails pendientes. */
export async function correrCiclo(db: Db, enviar: EnviarEmail, urlBase: string, ahora = new Date()): Promise<number> {
  const procesados = await procesarRecordatorios(db, ahora);
  await enviarEmailsPendientes(db, enviar, urlBase);
  return procesados;
}

/**
 * Corre `ciclo` al iniciar y después cada minuto, sin solapar corridas en este proceso.
 * Devuelve una función para detenerlo.
 */
export function iniciarWorker(ciclo: () => Promise<number>): () => void {
  let corriendo = false;

  async function tick() {
    if (corriendo) return;
    corriendo = true;
    try {
      const procesados = await ciclo();
      if (procesados > 0) console.log(`[worker] ${procesados} recordatorio(s) procesado(s)`);
    } catch (error) {
      console.error("[worker] falló el ciclo", error);
    } finally {
      corriendo = false;
    }
  }

  void tick();
  const intervalo = setInterval(tick, INTERVALO_MS);
  return () => clearInterval(intervalo);
}

export function urlBase(): string {
  return process.env.BETTER_AUTH_URL || "http://localhost:3000";
}
```

`src/worker/index.ts` (proceso aparte, para el VPS):

```ts
import { cerrarDb, crearDb } from "@/db/client";
import { crearEnviador } from "@/lib/email";
import { correrCiclo, iniciarWorker, urlBase } from "./ciclo";

const url = process.env.DATABASE_URL;
if (!url) {
  // Con PGlite la base solo la puede abrir un proceso: en desarrollo usá WORKER_EN_APP=true.
  console.error("[worker] DATABASE_URL es obligatorio. En desarrollo usá WORKER_EN_APP=true con npm run dev.");
  process.exit(1);
}

const db = crearDb(url);
const enviar = crearEnviador();
const detener = iniciarWorker(() => correrCiclo(db, enviar, urlBase()));
console.log("[worker] iniciado");

for (const senal of ["SIGINT", "SIGTERM"] as const) {
  process.on(senal, async () => {
    detener();
    await cerrarDb(db);
    process.exit(0);
  });
}
```

`src/worker/en-app.ts`:

```ts
import { db } from "@/db";
import { crearEnviador } from "@/lib/email";
import { correrCiclo, iniciarWorker, urlBase } from "./ciclo";

// Next recarga módulos en dev: se guarda en globalThis para no arrancar dos workers.
const global = globalThis as unknown as { __vibraWorker?: () => void };

export function iniciarWorkerEnApp(): void {
  if (global.__vibraWorker) return;
  const enviar = crearEnviador();
  global.__vibraWorker = iniciarWorker(() => correrCiclo(db, enviar, urlBase()));
  console.log("[worker] corriendo dentro de Next (WORKER_EN_APP=true)");
}
```

`src/instrumentation.ts`:

```ts
export async function register() {
  // En el VPS el worker es un proceso aparte (npm run worker). En desarrollo PGlite admite
  // un solo proceso, así que con WORKER_EN_APP=true corre dentro del servidor de Next.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.WORKER_EN_APP === "true") {
    const { iniciarWorkerEnApp } = await import("./worker/en-app");
    iniciarWorkerEnApp();
  }
}
```

En `next.config.ts`, agregar `nodemailer` a `serverExternalPackages`:

```ts
  serverExternalPackages: ["@electric-sql/pglite", "nodemailer"],
```

(y ajustar el comentario de arriba: "PGlite carga WASM en runtime y nodemailer usa módulos de Node; no pasan por el bundler.")

- [ ] **Step 4: Correr el test y la suite**

Run: `npx vitest run tests/worker/ciclo.test.ts && npm test && npm run lint && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Probar el proceso aparte sin DATABASE_URL**

Run: `npm run worker`
Expected: termina con `[worker] DATABASE_URL es obligatorio…` y código 1 (en local no hay Postgres; es el comportamiento buscado).

- [ ] **Step 6: Commit**

```bash
git add src/worker src/instrumentation.ts next.config.ts tests/worker
git commit -m "feat: worker de recordatorios (proceso aparte o dentro de Next en desarrollo)"
```

---

### Task 7: Notificaciones y preferencia de emails (TDD)

**Files:**
- Create: `src/lib/notificaciones.ts`
- Modify: `src/lib/users.ts` (`cambiarRecibirEmails`)
- Test: `tests/lib/notificaciones.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/lib/notificaciones.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { notificacion, user } from "@/db/schema";
import {
  contarNoLeidas,
  listarNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
} from "@/lib/notificaciones";
import type { Actor } from "@/lib/permissions";
import { cambiarRecibirEmails } from "@/lib/users";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { nuevaTarea } from "../helpers/tareas";

let db: Db;
let admin: Actor;
let editor: Actor;
let tareaId: string;

async function notificar(usuarioId: string, mensaje: string, createdAt: Date) {
  const [n] = await db.insert(notificacion).values({ usuarioId, tareaId, mensaje, createdAt }).returning();
  return n.id;
}

beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
  tareaId = await nuevaTarea(db);
});

describe("notificaciones", () => {
  it("lista las del usuario, más nuevas primero, y cuenta las no leídas", async () => {
    await notificar(editor.id, "vieja", new Date("2027-03-01T10:00:00Z"));
    await notificar(editor.id, "nueva", new Date("2027-03-02T10:00:00Z"));
    await notificar(admin.id, "de otro", new Date("2027-03-03T10:00:00Z"));

    expect((await listarNotificaciones(db, editor.id)).map((n) => n.mensaje)).toEqual(["nueva", "vieja"]);
    expect(await contarNoLeidas(db, editor.id)).toBe(2);
  });

  it("marca una o todas como leídas, solo las propias", async () => {
    const a = await notificar(editor.id, "a", new Date());
    await notificar(editor.id, "b", new Date());
    const ajena = await notificar(admin.id, "c", new Date());

    await marcarLeida(db, editor.id, a);
    expect(await contarNoLeidas(db, editor.id)).toBe(1);
    await expect(marcarLeida(db, editor.id, ajena)).rejects.toThrow("La notificación no existe");

    await marcarTodasLeidas(db, editor.id);
    expect(await contarNoLeidas(db, editor.id)).toBe(0);
    expect(await contarNoLeidas(db, admin.id)).toBe(1);
  });
});

describe("cambiarRecibirEmails", () => {
  it("guarda la preferencia", async () => {
    await cambiarRecibirEmails(db, editor.id, false);
    const [u] = await db.select().from(user).where(eq(user.id, editor.id));
    expect(u.recibirEmails).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/lib/notificaciones.test.ts`
Expected: FAIL — no existe `@/lib/notificaciones`.

- [ ] **Step 3: Implementar**

`src/lib/notificaciones.ts`:

```ts
import { and, count, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notificacion } from "@/db/schema";
import { ErrorNegocio } from "@/lib/acciones";

export function listarNotificaciones(db: Db, usuarioId: string, limite = 15) {
  return db
    .select({
      id: notificacion.id,
      mensaje: notificacion.mensaje,
      tareaId: notificacion.tareaId,
      leida: notificacion.leida,
      createdAt: notificacion.createdAt,
    })
    .from(notificacion)
    .where(eq(notificacion.usuarioId, usuarioId))
    .orderBy(desc(notificacion.createdAt))
    .limit(limite);
}

export async function contarNoLeidas(db: Db, usuarioId: string): Promise<number> {
  const [fila] = await db
    .select({ cantidad: count() })
    .from(notificacion)
    .where(and(eq(notificacion.usuarioId, usuarioId), eq(notificacion.leida, false)));
  return fila.cantidad;
}

export async function marcarLeida(db: Db, usuarioId: string, id: string): Promise<void> {
  const filas = await db
    .update(notificacion)
    .set({ leida: true })
    .where(and(eq(notificacion.id, id), eq(notificacion.usuarioId, usuarioId)))
    .returning({ id: notificacion.id });
  if (filas.length === 0) throw new ErrorNegocio("La notificación no existe");
}

export async function marcarTodasLeidas(db: Db, usuarioId: string): Promise<void> {
  await db
    .update(notificacion)
    .set({ leida: true })
    .where(and(eq(notificacion.usuarioId, usuarioId), eq(notificacion.leida, false)));
}
```

En `src/lib/users.ts`, agregar al final:

```ts
export async function cambiarRecibirEmails(db: Db, userId: string, recibir: boolean): Promise<void> {
  await db.update(user).set({ recibirEmails: recibir }).where(eq(user.id, userId));
}
```

- [ ] **Step 4: Correr el test y la suite**

Run: `npx vitest run tests/lib/notificaciones.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notificaciones.ts src/lib/users.ts tests/lib/notificaciones.test.ts
git commit -m "feat: notificaciones en la app y preferencia de emails"
```

---

### Task 8: Pantallas de tareas

**Files:**
- Create: `src/app/(app)/tareas/{operaciones.ts,actions.ts,tarea-campos.tsx,acciones-estado.tsx,page.tsx}`
- Create: `src/app/(app)/tareas/[tareaId]/page.tsx`
- Create: `src/components/estado-tarea.tsx`
- Test: `tests/tareas/operaciones.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/tareas/operaciones.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  altaRecordatorio,
  altaTarea,
  bajaRecordatorio,
  bajaTarea,
  cambioEstadoTarea,
  edicionTarea,
} from "@/app/(app)/tareas/operaciones";
import type { Db } from "@/db/client";
import type { Actor } from "@/lib/permissions";
import { listarRecordatorios } from "@/lib/recordatorios";
import { listarTareas, obtenerTarea } from "@/lib/tareas";
import { crearActores, SIN_PERMISO } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { nuevaTarea, TAREA } from "../helpers/tareas";

let db: Db;
let admin: Actor;
let editor: Actor;
beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
});

describe("tareas", () => {
  it("el editor crea, edita y cambia el estado; queda como creador", async () => {
    expect(await altaTarea(db, editor, TAREA)).toEqual({ ok: true });
    const [t] = await listarTareas(db);
    expect(t.creadoPor).toBe(editor.id);
    expect(await edicionTarea(db, editor, { ...TAREA, tareaId: t.id, titulo: "Vallas freestanding" })).toEqual({
      ok: true,
    });
    expect(await cambioEstadoTarea(db, editor, { tareaId: t.id, estado: "hecha" })).toEqual({ ok: true });
    expect(await obtenerTarea(db, t.id)).toMatchObject({ titulo: "Vallas freestanding", estado: "hecha" });
  });

  it("solo el admin borra", async () => {
    const id = await nuevaTarea(db);
    expect(await bajaTarea(db, editor, { tareaId: id })).toEqual(SIN_PERMISO);
    expect(await bajaTarea(db, admin, { tareaId: id })).toEqual({ ok: true });
    expect(await obtenerTarea(db, id)).toBeUndefined();
  });

  it("errores de validación vuelven como Resultado", async () => {
    expect(await altaTarea(db, editor, { ...TAREA, fechaLimite: "ayer" })).toEqual({
      ok: false,
      error: "Fecha inválida",
    });
    expect(await cambioEstadoTarea(db, editor, { tareaId: "x", estado: "lista" })).toEqual({
      ok: false,
      error: "Estado inválido",
    });
  });
});

describe("recordatorios manuales", () => {
  it("el creador agrega y cancela; otro editor no", async () => {
    const id = await nuevaTarea(db, {}, admin.id);
    const futuro = "2099-01-01T09:00";
    expect(await altaRecordatorio(db, editor, { tareaId: id, fechaHora: futuro })).toEqual(SIN_PERMISO);
    expect(await altaRecordatorio(db, admin, { tareaId: id, fechaHora: futuro })).toEqual({ ok: true });

    const [r] = await listarRecordatorios(db, id);
    expect(await bajaRecordatorio(db, editor, { recordatorioId: r.id })).toEqual(SIN_PERMISO);
    expect(await bajaRecordatorio(db, admin, { recordatorioId: r.id })).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/tareas/operaciones.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Operaciones y acciones**

`src/app/(app)/tareas/operaciones.ts`:

```ts
import { z } from "zod";
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { exigir, type Actor } from "@/lib/permissions";
import { cancelarRecordatorio, crearRecordatorioManual, recordatorioManualSchema } from "@/lib/recordatorios";
import { borrarTarea, cambiarEstadoTarea, crearTarea, editarTarea, ESTADOS_TAREA, tareaSchema } from "@/lib/tareas";

const tareaId = z.string("Tarea inválida").min(1, "Tarea inválida");

export function altaTarea(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    await crearTarea(db, validar(tareaSchema, datos), actor.id);
  });
}

export function edicionTarea(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    const { tareaId: id, ...valores } = validar(tareaSchema.extend({ tareaId }), datos);
    await editarTarea(db, id, valores);
  });
}

export function cambioEstadoTarea(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    const { tareaId: id, estado } = validar(
      z.object({ tareaId, estado: z.enum(ESTADOS_TAREA, "Estado inválido") }),
      datos,
    );
    await cambiarEstadoTarea(db, id, estado);
  });
}

export function bajaTarea(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "borrar");
    await borrarTarea(db, validar(z.object({ tareaId }), datos).tareaId);
  });
}

// Recordatorios manuales: el permiso (creador de la tarea o admin) lo chequea src/lib/recordatorios.ts.

export function altaRecordatorio(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "ver");
    await crearRecordatorioManual(db, actor, validar(recordatorioManualSchema, datos));
  });
}

export function bajaRecordatorio(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "ver");
    const { recordatorioId } = validar(
      z.object({ recordatorioId: z.string("Recordatorio inválido").min(1, "Recordatorio inválido") }),
      datos,
    );
    await cancelarRecordatorio(db, actor, recordatorioId);
  });
}
```

`src/app/(app)/tareas/actions.ts` — **mismo patrón que `src/app/(app)/proveedores/actions.ts` después de las correcciones del Plan 2**: borrar redirige del lado del servidor. Si ese archivo usa otro mecanismo (p. ej. `redirigir` en el cliente), copiar ese mismo mecanismo.

```ts
"use server";

import { redirect } from "next/navigation";
import { ejecutar } from "../ejecutar";
import {
  altaRecordatorio,
  altaTarea,
  bajaRecordatorio,
  bajaTarea,
  cambioEstadoTarea,
  edicionTarea,
} from "./operaciones";

export async function crearTareaAction(formData: FormData) {
  return ejecutar(altaTarea, formData);
}

export async function editarTareaAction(formData: FormData) {
  return ejecutar(edicionTarea, formData);
}

export async function cambiarEstadoTareaAction(formData: FormData) {
  return ejecutar(cambioEstadoTarea, formData);
}

export async function borrarTareaAction(formData: FormData) {
  const resultado = await ejecutar(bajaTarea, formData);
  // Redirige en el servidor: si no, la revalidación re-renderiza la tarea borrada (404).
  if (resultado.ok) redirect("/tareas");
  return resultado;
}

export async function crearRecordatorioAction(formData: FormData) {
  return ejecutar(altaRecordatorio, formData);
}

export async function cancelarRecordatorioAction(formData: FormData) {
  return ejecutar(bajaRecordatorio, formData);
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run tests/tareas/operaciones.test.ts`
Expected: PASS.

- [ ] **Step 5: Componentes**

`src/components/estado-tarea.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import type { EstadoTarea } from "@/lib/tareas";

const VARIANTE = { pendiente: "outline", en_curso: "secondary", hecha: "default" } as const;
export const TEXTO_ESTADO_TAREA: Record<EstadoTarea, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  hecha: "Hecha",
};

export function EstadoTareaBadge({ estado }: { estado: EstadoTarea }) {
  return <Badge variant={VARIANTE[estado]}>{TEXTO_ESTADO_TAREA[estado]}</Badge>;
}
```

`src/app/(app)/tareas/acciones-estado.tsx`:

```tsx
import { BotonAccion } from "@/components/form-accion";
import type { EstadoTarea } from "@/lib/tareas";
import { cambiarEstadoTareaAction } from "./actions";

// Cambio de estado en un clic: los pasos que tienen sentido desde cada estado.
const SIGUIENTES: Record<EstadoTarea, { estado: EstadoTarea; texto: string }[]> = {
  pendiente: [
    { estado: "en_curso", texto: "Empezar" },
    { estado: "hecha", texto: "Hecha" },
  ],
  en_curso: [{ estado: "hecha", texto: "Hecha" }],
  hecha: [{ estado: "pendiente", texto: "Reabrir" }],
};

export function AccionesEstado({ tareaId, estado }: { tareaId: string; estado: EstadoTarea }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {SIGUIENTES[estado].map((s) => (
        <BotonAccion
          key={s.estado}
          accion={cambiarEstadoTareaAction}
          campos={{ tareaId, estado: s.estado }}
          texto={s.texto}
          enviando="…"
          variant={s.estado === "hecha" ? "default" : "outline"}
        />
      ))}
    </div>
  );
}
```

`src/app/(app)/tareas/tarea-campos.tsx`:

```tsx
import { Campo, Select, Textarea } from "@/components/campos";
import { Input } from "@/components/ui/input";

type Valores = {
  titulo: string;
  areaId: number;
  responsableId: string | null;
  fechaLimite: string | null;
  notas: string | null;
};

export function TareaCampos({
  areas,
  usuarios,
  valores,
}: {
  areas: { id: number; nombre: string }[];
  usuarios: { id: string; name: string }[];
  valores?: Valores;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo id="titulo" label="Tarea" className="sm:col-span-2">
        <Input id="titulo" name="titulo" defaultValue={valores?.titulo} required />
      </Campo>
      <Campo id="areaId" label="Área">
        <Select id="areaId" name="areaId" defaultValue={valores?.areaId ?? ""} required>
          <option value="" disabled>
            Elegí un área
          </option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo id="responsableId" label="Responsable">
        <Select id="responsableId" name="responsableId" defaultValue={valores?.responsableId ?? ""}>
          <option value="">Sin responsable (avisa a los admins)</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo id="fechaLimite" label="Fecha límite (opcional)">
        <Input id="fechaLimite" name="fechaLimite" type="date" defaultValue={valores?.fechaLimite ?? ""} />
      </Campo>
      <Campo id="notas" label="Notas" className="sm:col-span-2">
        <Textarea id="notas" name="notas" defaultValue={valores?.notas ?? ""} />
      </Campo>
    </div>
  );
}
```

- [ ] **Step 6: Lista con filtros y alta**

`src/app/(app)/tareas/page.tsx`:

```tsx
import Form from "next/form";
import Link from "next/link";
import { Campo, Select } from "@/components/campos";
import { EstadoTareaBadge, TEXTO_ESTADO_TAREA } from "@/components/estado-tarea";
import { FormAccion } from "@/components/form-accion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { formatearFecha, hoyEnLaPaz } from "@/lib/reminders";
import { listarAreas } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import { ESTADOS_TAREA, listarTareas, type EstadoTarea } from "@/lib/tareas";
import { listarUsuarios } from "@/lib/users";
import { cn } from "@/lib/utils";
import { AccionesEstado } from "./acciones-estado";
import { crearTareaAction } from "./actions";
import { TareaCampos } from "./tarea-campos";

const texto = (valor: string | string[] | undefined) => (typeof valor === "string" ? valor : "");

export default async function TareasPage({ searchParams }: PageProps<"/tareas">) {
  await usuarioActual();
  const filtros = await searchParams;
  const area = texto(filtros.area);
  const responsable = texto(filtros.responsable);
  const estado = texto(filtros.estado);

  const [areas, usuarios, tareas] = await Promise.all([
    listarAreas(db),
    listarUsuarios(db),
    listarTareas(db, {
      areaId: Number(area) || undefined,
      responsableId: responsable || undefined,
      estado: (ESTADOS_TAREA as readonly string[]).includes(estado) ? (estado as EstadoTarea) : undefined,
    }),
  ]);
  const hoy = hoyEnLaPaz(new Date());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tareas</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nueva tarea</CardTitle>
        </CardHeader>
        <CardContent>
          <FormAccion
            accion={crearTareaAction}
            enviar="Crear tarea"
            enviando="Creando…"
            exito="Tarea creada"
            limpiar
            className="space-y-4"
          >
            <TareaCampos areas={areas} usuarios={usuarios} />
          </FormAccion>
        </CardContent>
      </Card>

      <Form action="/tareas" className="flex flex-wrap items-end gap-3">
        <Campo id="filtro-area" label="Área">
          <Select id="filtro-area" name="area" defaultValue={area}>
            <option value="">Todas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="filtro-responsable" label="Responsable">
          <Select id="filtro-responsable" name="responsable" defaultValue={responsable}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="filtro-estado" label="Estado">
          <Select id="filtro-estado" name="estado" defaultValue={estado}>
            <option value="">Todos</option>
            {ESTADOS_TAREA.map((e) => (
              <option key={e} value={e}>
                {TEXTO_ESTADO_TAREA[e]}
              </option>
            ))}
          </Select>
        </Campo>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </Form>

      {tareas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay tareas con esos filtros.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tarea</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Fecha límite</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tareas.map((t) => {
              const vencida = t.estado !== "hecha" && !!t.fechaLimite && t.fechaLimite < hoy;
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/tareas/${t.id}`} className="font-medium hover:underline">
                      {t.titulo}
                    </Link>
                  </TableCell>
                  <TableCell>{t.area}</TableCell>
                  <TableCell>{t.responsable ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className={cn(vencida && "font-medium text-destructive")}>
                    {t.fechaLimite ? formatearFecha(t.fechaLimite) : "—"}
                    {vencida && " (vencida)"}
                  </TableCell>
                  <TableCell>
                    <EstadoTareaBadge estado={t.estado} />
                  </TableCell>
                  <TableCell>
                    <AccionesEstado tareaId={t.id} estado={t.estado} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Detalle con recordatorios**

`src/app/(app)/tareas/[tareaId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Campo } from "@/components/campos";
import { EstadoTareaBadge } from "@/components/estado-tarea";
import { BotonAccion, FormAccion } from "@/components/form-accion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { can } from "@/lib/permissions";
import { listarRecordatorios, puedeGestionarRecordatorios } from "@/lib/recordatorios";
import { formatearFechaHora } from "@/lib/reminders";
import { listarAreas } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import { obtenerTarea } from "@/lib/tareas";
import { listarUsuarios } from "@/lib/users";
import { AccionesEstado } from "../acciones-estado";
import {
  borrarTareaAction,
  cancelarRecordatorioAction,
  crearRecordatorioAction,
  editarTareaAction,
} from "../actions";
import { TareaCampos } from "../tarea-campos";

const TIPO: Record<string, string> = {
  "3_dias_antes": "3 días antes",
  dia_vencimiento: "Día del vencimiento",
  vencida_diario: "Vencida (diario)",
  manual: "Manual",
};

export default async function TareaPage({ params }: PageProps<"/tareas/[tareaId]">) {
  const usuario = await usuarioActual();
  const { tareaId } = await params;
  const tarea = await obtenerTarea(db, tareaId);
  if (!tarea) notFound();

  const [areas, usuarios, recordatorios] = await Promise.all([
    listarAreas(db),
    listarUsuarios(db),
    listarRecordatorios(db, tareaId),
  ]);
  const gestiona = puedeGestionarRecordatorios(usuario, tarea.creadoPor);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/tareas" className="text-sm text-muted-foreground hover:underline">
            ← Tareas
          </Link>
          <h1 className="text-2xl font-semibold">{tarea.titulo}</h1>
          <div className="mt-1 flex items-center gap-2">
            <EstadoTareaBadge estado={tarea.estado} />
            <AccionesEstado tareaId={tareaId} estado={tarea.estado} />
          </div>
        </div>
        {can(usuario.role, "borrar") && (
          <BotonAccion
            accion={borrarTareaAction}
            campos={{ tareaId }}
            texto="Borrar tarea"
            enviando="Borrando…"
            variant="destructive"
            confirmar
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent>
          <FormAccion
            accion={editarTareaAction}
            enviar="Guardar cambios"
            enviando="Guardando…"
            exito="Guardado"
            className="space-y-4"
          >
            <input type="hidden" name="tareaId" value={tareaId} />
            <TareaCampos areas={areas} usuarios={usuarios} valores={tarea} />
          </FormAccion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recordatorios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {recordatorios.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin recordatorios. Los automáticos se crean al poner una fecha límite.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuándo (hora de La Paz)</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordatorios.map((r) => {
                  const estado = r.canceladoAt ? "Cancelado" : r.enviadoAt ? "Enviado" : "Pendiente";
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{formatearFechaHora(r.fechaHora)}</TableCell>
                      <TableCell>{TIPO[r.tipoAutomatico ?? r.origen]}</TableCell>
                      <TableCell>{estado}</TableCell>
                      <TableCell>
                        {gestiona && r.origen === "manual" && estado === "Pendiente" && (
                          <BotonAccion
                            accion={cancelarRecordatorioAction}
                            campos={{ recordatorioId: r.id }}
                            texto="Cancelar"
                            enviando="Cancelando…"
                            variant="ghost"
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {gestiona && tarea.estado !== "hecha" && (
            <FormAccion
              accion={crearRecordatorioAction}
              enviar="Agregar recordatorio"
              enviando="Agregando…"
              exito="Recordatorio agregado"
              limpiar
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="tareaId" value={tareaId} />
              <Campo id="fechaHora" label="Recordatorio manual (hora de La Paz)">
                <Input id="fechaHora" name="fechaHora" type="datetime-local" required />
              </Campo>
            </FormAccion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 8: Verificar**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: verde. (Si `tsc` no encuentra las rutas `/tareas` en `PageProps`, correr `npx next typegen`.)

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/tareas" src/components/estado-tarea.tsx tests/tareas
git commit -m "feat: pantallas de tareas con filtros, estados y recordatorios"
```

---

### Task 9: Campanita, preferencia de emails y navegación

**Files:**
- Create: `src/app/api/notificaciones/route.ts`
- Create: `src/app/(app)/notificaciones/{operaciones.ts,actions.ts}`
- Create: `src/components/campanita.tsx`
- Create: `src/app/(app)/cuenta/{operaciones.ts,actions.ts,emails-form.tsx}`
- Modify: `src/app/(app)/cuenta/page.tsx`, `src/app/(app)/nav.tsx`
- Test: `tests/notificaciones/operaciones.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/notificaciones/operaciones.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { preferenciaEmails } from "@/app/(app)/cuenta/operaciones";
import { lecturaNotificacion, lecturaTodas } from "@/app/(app)/notificaciones/operaciones";
import type { Db } from "@/db/client";
import { notificacion, user } from "@/db/schema";
import { contarNoLeidas } from "@/lib/notificaciones";
import type { Actor } from "@/lib/permissions";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { nuevaTarea } from "../helpers/tareas";

let db: Db;
let admin: Actor;
let editor: Actor;
beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
});

describe("notificaciones", () => {
  it("cada usuario marca solo las suyas", async () => {
    const tareaId = await nuevaTarea(db);
    const [mia] = await db.insert(notificacion).values({ usuarioId: editor.id, tareaId, mensaje: "a" }).returning();
    const [ajena] = await db.insert(notificacion).values({ usuarioId: admin.id, tareaId, mensaje: "b" }).returning();

    expect(await lecturaNotificacion(db, editor, { notificacionId: ajena.id })).toEqual({
      ok: false,
      error: "La notificación no existe",
    });
    expect(await lecturaNotificacion(db, editor, { notificacionId: mia.id })).toEqual({ ok: true });
    expect(await contarNoLeidas(db, editor.id)).toBe(0);

    expect(await lecturaTodas(db, admin)).toEqual({ ok: true });
    expect(await contarNoLeidas(db, admin.id)).toBe(0);
  });
});

describe("preferenciaEmails", () => {
  it("checkbox ausente = no recibir; 'on' = recibir", async () => {
    const recibe = async () => (await db.select().from(user).where(eq(user.id, editor.id)))[0].recibirEmails;
    expect(await preferenciaEmails(db, editor, {})).toEqual({ ok: true });
    expect(await recibe()).toBe(false);
    expect(await preferenciaEmails(db, editor, { recibirEmails: "on" })).toEqual({ ok: true });
    expect(await recibe()).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/notificaciones/operaciones.test.ts`
Expected: FAIL — no existen los módulos.

- [ ] **Step 3: Operaciones, acciones y ruta**

`src/app/(app)/notificaciones/operaciones.ts`:

```ts
import { z } from "zod";
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { marcarLeida, marcarTodasLeidas } from "@/lib/notificaciones";
import { exigir, type Actor } from "@/lib/permissions";

export function lecturaNotificacion(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "ver");
    const { notificacionId } = validar(
      z.object({ notificacionId: z.string("Notificación inválida").min(1, "Notificación inválida") }),
      datos,
    );
    await marcarLeida(db, actor.id, notificacionId);
  });
}

export function lecturaTodas(db: Db, actor: Actor): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "ver");
    await marcarTodasLeidas(db, actor.id);
  });
}
```

`src/app/(app)/notificaciones/actions.ts`:

```ts
"use server";

import { ejecutar } from "../ejecutar";
import { lecturaNotificacion, lecturaTodas } from "./operaciones";

export async function marcarLeidaAction(formData: FormData) {
  return ejecutar(lecturaNotificacion, formData);
}

export async function marcarTodasLeidasAction(formData: FormData) {
  return ejecutar(lecturaTodas, formData);
}
```

`src/app/api/notificaciones/route.ts`:

```ts
import { db } from "@/db";
import { auth } from "@/lib/auth";
import { contarNoLeidas, listarNotificaciones } from "@/lib/notificaciones";

/** Lo consulta la campanita al montar y cada minuto. */
export async function GET(request: Request) {
  const sesion = await auth.api.getSession({ headers: request.headers });
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const [noLeidas, items] = await Promise.all([
    contarNoLeidas(db, sesion.user.id),
    listarNotificaciones(db, sesion.user.id),
  ]);
  return Response.json({ noLeidas, items }, { headers: { "Cache-Control": "private, no-store" } });
}
```

`src/app/(app)/cuenta/operaciones.ts`:

```ts
import type { Db } from "@/db/client";
import { intentar, type Resultado } from "@/lib/acciones";
import { exigir, type Actor } from "@/lib/permissions";
import { cambiarRecibirEmails } from "@/lib/users";

/** Un checkbox sin marcar no viaja en el formulario: ausente = no recibir. */
export function preferenciaEmails(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "ver");
    const { recibirEmails } = (datos ?? {}) as { recibirEmails?: unknown };
    await cambiarRecibirEmails(db, actor.id, recibirEmails === "on");
  });
}
```

`src/app/(app)/cuenta/actions.ts`:

```ts
"use server";

import { ejecutar } from "../ejecutar";
import { preferenciaEmails } from "./operaciones";

export async function guardarPreferenciaEmailsAction(formData: FormData) {
  return ejecutar(preferenciaEmails, formData);
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run tests/notificaciones/operaciones.test.ts`
Expected: PASS.

- [ ] **Step 5: Campanita**

`src/components/campanita.tsx`:

```tsx
"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { marcarLeidaAction, marcarTodasLeidasAction } from "@/app/(app)/notificaciones/actions";
import { Button } from "@/components/ui/button";
import { formatearFechaHora } from "@/lib/reminders";
import { cn } from "@/lib/utils";

type Notificacion = { id: string; mensaje: string; tareaId: string; leida: boolean; createdAt: string };
type Datos = { noLeidas: number; items: Notificacion[] };

function formulario(campos: Record<string, string> = {}): FormData {
  const datos = new FormData();
  for (const [nombre, valor] of Object.entries(campos)) datos.set(nombre, valor);
  return datos;
}

export function Campanita() {
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [abierta, setAbierta] = useState(false);

  const cargar = useCallback(async () => {
    const respuesta = await fetch("/api/notificaciones", { cache: "no-store" });
    if (respuesta.ok) setDatos(await respuesta.json());
  }, []);

  useEffect(() => {
    void cargar();
    const intervalo = setInterval(() => void cargar(), 60_000);
    return () => clearInterval(intervalo);
  }, [cargar]);

  async function abrir(n: Notificacion) {
    setAbierta(false);
    if (!n.leida) await marcarLeidaAction(formulario({ notificacionId: n.id }));
    router.push(`/tareas/${n.tareaId}`);
    void cargar();
  }

  async function marcarTodas() {
    await marcarTodasLeidasAction(formulario());
    void cargar();
  }

  const noLeidas = datos?.noLeidas ?? 0;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAbierta(!abierta)}
        aria-label={`Notificaciones${noLeidas ? ` (${noLeidas} sin leer)` : ""}`}
        aria-expanded={abierta}
      >
        <Bell className="size-4" />
        {noLeidas > 0 && (
          <span className="rounded-full bg-destructive px-1.5 text-xs font-medium text-white">{noLeidas}</span>
        )}
      </Button>
      {abierta && (
        <div className="absolute left-0 z-20 mt-2 w-80 rounded-lg border bg-background p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-medium">Notificaciones</p>
            {noLeidas > 0 && (
              <Button variant="link" size="xs" onClick={marcarTodas}>
                Marcar todas como leídas
              </Button>
            )}
          </div>
          {!datos || datos.items.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No tenés notificaciones.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {datos.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => abrir(n)}
                    className={cn("w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted", !n.leida && "font-medium")}
                  >
                    {n.mensaje}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {formatearFechaHora(new Date(n.createdAt))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

(Si el lint de `react-hooks` marca el `setDatos` dentro del efecto, mover la carga inicial a un `setTimeout(cargar, 0)` dentro del efecto o seguir lo que pida la regla, sin desactivarla.)

- [ ] **Step 6: Navegación**

En `src/app/(app)/nav.tsx`:

1. Importar `import { Campanita } from "@/components/campanita";`.
2. En `LINKS`, agregar `{ href: "/tareas", label: "Tareas" }` después de Proveedores.
3. Reemplazar `<p className="mb-4 font-semibold">Vibra 2027</p>` por:

```tsx
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="font-semibold">Vibra 2027</p>
        <Campanita />
      </div>
```

- [ ] **Step 7: Preferencia de emails en Mi cuenta**

`src/app/(app)/cuenta/emails-form.tsx`:

```tsx
import { FormAccion } from "@/components/form-accion";
import { guardarPreferenciaEmailsAction } from "./actions";

export function EmailsForm({ recibirEmails }: { recibirEmails: boolean }) {
  return (
    <FormAccion
      accion={guardarPreferenciaEmailsAction}
      enviar="Guardar"
      enviando="Guardando…"
      exito="Guardado"
      className="max-w-sm space-y-4"
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="recibirEmails" defaultChecked={recibirEmails} />
        Recibir los recordatorios de tareas por email
      </label>
    </FormAccion>
  );
}
```

`src/app/(app)/cuenta/page.tsx` completo:

```tsx
import { usuarioActual } from "@/lib/session";
import { EmailsForm } from "./emails-form";
import { PasswordForm } from "./password-form";

export default async function CuentaPage() {
  const usuario = await usuarioActual();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Mi cuenta</h1>
        <p className="text-muted-foreground">
          {usuario.name} · {usuario.email} · {usuario.role}
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Emails</h2>
        <EmailsForm recibirEmails={usuario.recibirEmails ?? true} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Contraseña</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
```

- [ ] **Step 8: Verificar**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 9: Commit**

```bash
git add "src/app/api/notificaciones" "src/app/(app)/notificaciones" src/components/campanita.tsx "src/app/(app)/cuenta" "src/app/(app)/nav.tsx" tests/notificaciones
git commit -m "feat: campanita de notificaciones y preferencia de emails"
```

---

### Task 10: Tablero con tareas y verificación de punta a punta

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Modify: `README.md`

- [ ] **Step 1: Tablero**

En `src/app/(app)/page.tsx`:

1. Agregar imports:

```tsx
import { formatearFecha } from "@/lib/reminders";
import { resumenTareas, type TareaListada } from "@/lib/tareas";
import { cn } from "@/lib/utils";
```

2. Cargar el resumen de tareas junto con el de presupuesto:

```tsx
  const [{ areas, total, tipos }, tareas] = await Promise.all([resumenPresupuesto(db), resumenTareas(db)]);
```

3. En la tarjeta "Avance por área", reemplazar el `<span>` de cada área por:

```tsx
                  <span className="shrink-0 text-right text-muted-foreground">
                    {a.rubros.filter((r) => r.aprobada).length} / {a.rubros.length} rubros aprobados
                    <br />
                    {tareas.porArea.get(a.id)?.hechas ?? 0} / {tareas.porArea.get(a.id)?.total ?? 0} tareas hechas
                  </span>
```

4. Agregar, después del `<div className="grid gap-6 lg:grid-cols-2">…</div>`, la tarjeta de vencimientos:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Tareas vencidas y de los próximos 7 días</CardTitle>
        </CardHeader>
        <CardContent>
          {tareas.vencidas.length + tareas.proximas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada vencido ni por vencer esta semana.</p>
          ) : (
            <ul className="space-y-1">
              {[...tareas.vencidas, ...tareas.proximas].map((t) => (
                <ItemTarea key={t.id} tarea={t} vencida={tareas.vencidas.includes(t)} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
```

5. Agregar al final del archivo:

```tsx
function ItemTarea({ tarea, vencida }: { tarea: TareaListada; vencida: boolean }) {
  return (
    <li className="text-sm">
      <Link href={`/tareas/${tarea.id}`} className="font-medium hover:underline">
        {tarea.titulo}
      </Link>{" "}
      <span className={cn("text-muted-foreground", vencida && "text-destructive")}>
        · {vencida ? "vencida el" : "vence el"} {formatearFecha(tarea.fechaLimite!)} · {tarea.area}
        {tarea.responsable && ` · ${tarea.responsable}`}
      </span>
    </li>
  );
}
```

- [ ] **Step 2: README**

En `README.md`, agregar al final:

```markdown
## Recordatorios

Un worker revisa cada minuto los recordatorios vencidos, crea las notificaciones (campanita) y manda los emails por SMTP.

- **En desarrollo:** poné `WORKER_EN_APP=true` en `.env.local` y el worker corre dentro de `npm run dev` (PGlite no admite un segundo proceso). Sin `SMTP_HOST` los emails se imprimen en la consola.
- **En el VPS:** `WORKER_EN_APP` vacío y `npm run worker` en su propio contenedor, con `DATABASE_URL` y las variables `SMTP_*`.
```

- [ ] **Step 3: Suite, lint, tipos y build**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: todo verde; el build lista `/tareas`, `/tareas/[tareaId]`, `/api/notificaciones`.

- [ ] **Step 4: Prueba manual**

Con `npm run dev` apagado: `npm run db:migrate`. En `.env.local`, `WORKER_EN_APP=true`. Levantar `npm run dev` y verificar que la consola muestra `[worker] corriendo dentro de Next`.

1. Como admin, crear una tarea con responsable = editor y fecha límite = ayer → en el detalle aparece un recordatorio "Vencida (diario)" para el próximo 09:00.
2. Agregar un recordatorio manual para dentro de 2 minutos. Esperar: pasa a "Enviado", la consola muestra `[email sin SMTP] Para: editor@vibra.bo…`.
3. Entrar como editor: la campanita muestra 1; al hacer clic va a la tarea y el contador baja.
4. Marcar la tarea "Hecha": los recordatorios pendientes pasan a "Cancelado". El tablero muestra la tarea como hecha en su área.
5. Mi cuenta → desmarcar "Recibir los recordatorios por email" → el próximo recordatorio llega a la campanita pero no a la consola.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/page.tsx" README.md
git commit -m "feat: tablero con avance de tareas y vencimientos"
```

---

## Cobertura del spec (Plan 3)

| Spec | Task |
|---|---|
| Entidad Tarea (título, área, responsable, fecha límite, estado, notas) | 1, 3 |
| Recordatorio, Notificación, `recibir_emails` | 1, 7 |
| Regla 1: automáticos 3 días antes y día del vencimiento, 09:00 La Paz; se regeneran al cambiar la fecha | 2, 3 |
| Regla 2: vencida diaria; el worker encadena el del día siguiente | 2, 5 |
| Regla 3: manuales del creador o admin, precisión 1 minuto | 4, 8 |
| Regla 4: hecha (o borrada) cancela los pendientes | 3 |
| Regla 5: destinatario responsable o todos los admins | 5 |
| Regla 6: zona `America/La_Paz`, UTC en DB | 1, 2 |
| Worker cada minuto, `FOR UPDATE SKIP LOCKED`, notificación en la misma transacción | 5, 6 |
| Email después del commit, reintentos (máx. 5), omitido si no quiere emails | 5 |
| Campanita con no leídas, marcar leída / todas | 7, 9 |
| Pantalla Tareas: filtros por área, responsable y estado; estado en un clic; alta/edición | 8 |
| Tablero: tareas hechas/total por área; vencidas y próximos 7 días | 3, 10 |
| Permisos: borrar solo admin | 8 |

Quedan para el Plan 4: contenedor del worker (`npm run worker`), variables SMTP en el VPS, Playwright E2E ("crear tarea con recordatorio → aparece en campanita").
