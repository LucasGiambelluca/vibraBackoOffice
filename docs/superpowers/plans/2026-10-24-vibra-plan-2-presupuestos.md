# Vibra 2027 — Plan 2: Presupuestos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Áreas, rubros, proveedores, cotizaciones comparables con aprobación (una por rubro), tipos de cambio BOB/USD/ARS, adjuntos PDF y totales del evento en el tablero.

**Architecture:** Mismo patrón que el Plan 1. La lógica vive en `src/lib/*.ts` (funciones que reciben `db`, testeadas con PGlite en memoria). Cada sección tiene un `operaciones.ts` (permiso + validación Zod + `intentar`, sin Next) y un `actions.ts` fino (`"use server"`). Los cálculos de plata son funciones puras en `src/lib/money.ts`. Áreas y rubros iniciales se cargan en una migración SQL, así existen en dev, tests y VPS sin pasos extra. Los PDF se guardan en disco (`UPLOADS_DIR`) y se sirven por una ruta que exige sesión.

**Tech Stack:** Next.js 16.4 (App Router), Drizzle ORM 0.44 + drizzle-kit 0.31, PGlite / postgres-js, Zod 4, Vitest 3, shadcn/ui (base-ui).

**Spec:** `docs/superpowers/specs/2026-10-23-vibra-backoffice-design.md` (secciones 2, 3, 5, 6).

## Decisiones tomadas en este plan

- **Una aprobada por rubro** se garantiza dos veces: transacción en `aprobarCotizacion` + índice único parcial en Postgres (`WHERE estado = 'aprobada'`).
- **Borrar rubro o proveedor con cotizaciones** está bloqueado por FK (`ON DELETE RESTRICT`) y devuelve un mensaje claro.
- **Cálculos**: montos guardados como `numeric`; se calculan en JS con `number` y se redondean a centavos al final de cada operación (montos de un evento: precisión de `double` sobra).
- **Rubros iniciales con 2 días** (Técnica, Sonido, Pantalla, Escenario, Luces → Técnica, Escenario y Backline; Vallas blancas, Vallas freestanding → Infraestructura y Predio). Se cambian desde Configuración → Rubros.
- **Formularios nuevos** usan `FormAccion` (client) con `onSubmit` + transición en vez de `<form action>`: React 19 resetea los campos tras una acción aunque falle, y así no se pierde lo tipeado.
- **Revalidación**: toda acción exitosa hace `revalidatePath("/", "layout")`. La app es chica y así ninguna pantalla queda con datos viejos.
- **Rama**: `plan-2-presupuestos`, creada desde `plan-1-base`.

## Estructura de archivos (Plan 2)

| Archivo | Responsabilidad |
|---|---|
| `src/db/errores.ts` | Reconocer violaciones de UNIQUE (23505) y FK (23503) |
| `src/db/presupuestos-schema.ts` | Tablas `area`, `rubro`, `proveedor`, `cotizacion`, `tipo_cambio` |
| `drizzle/0001_*.sql`, `drizzle/0002_seed_areas_rubros.sql` | Migración de tablas y seed de áreas/rubros |
| `src/lib/acciones.ts` | + `conRestricciones()` (traduce errores de constraint) |
| `src/lib/validacion.ts` | Schemas Zod reutilizables: `decimal`, `textoOpcional` |
| `src/lib/limites.ts` | `MAX_ADJUNTO` (lo usan servidor y cliente) |
| `src/lib/money.ts` | Funciones puras: totales, ahorro, conversión, total del evento, formato |
| `src/lib/rubros.ts` | Áreas y ABM de rubros |
| `src/lib/proveedores.ts` | ABM y búsqueda de proveedores |
| `src/lib/tipos-cambio.ts` | Leer y guardar tipos de cambio |
| `src/lib/adjuntos.ts` | Guardar / leer / borrar PDF en disco |
| `src/lib/cotizaciones.ts` | ABM, aprobación, reversión, listado con totales |
| `src/lib/resumen.ts` | Resumen por área y total del evento (presupuestos y tablero) |
| `src/app/(app)/ejecutar.ts` | Helper compartido de server actions |
| `src/components/form-accion.tsx` | `FormAccion` y `BotonAccion` (client) |
| `src/components/campos.tsx` | `Campo`, `Select`, `Textarea` |
| `src/components/total-evento.tsx` | Tarjeta de total aprobado BOB/USD/ARS |
| `src/app/(app)/configuracion/rubros/*` | Configuración de rubros (admin) |
| `src/app/(app)/configuracion/tipos-cambio/*` | Configuración de tipos de cambio (admin) |
| `src/app/(app)/proveedores/*` | Lista, búsqueda, alta, edición, baja |
| `src/app/(app)/presupuestos/*` | Lista por área, detalle de rubro, alta/edición de cotización |
| `src/app/api/adjuntos/[nombre]/route.ts` | Descarga de PDF con sesión |
| `src/app/(app)/page.tsx`, `nav.tsx` | Tablero con totales y navegación nueva |
| `tests/helpers/actores.ts`, `tests/helpers/presupuestos.ts` | Datos de prueba |

Todos los comandos se corren desde la raíz del repo en Git Bash. **Antes de `npm run db:migrate` pará `npm run dev`** (PGlite admite un solo proceso).

---

### Task 1: Rama, errores de Postgres y `conRestricciones`

**Files:**
- Create: `src/db/errores.ts`
- Modify: `src/lib/users.ts` (usa `esViolacionUnica` de `src/db/errores.ts`)
- Modify: `src/lib/acciones.ts` (agrega `conRestricciones`)
- Test: `tests/lib/acciones.test.ts`

- [ ] **Step 1: Crear la rama**

```bash
git checkout plan-1-base
git checkout -b plan-2-presupuestos
```

- [ ] **Step 2: Escribir el test que falla**

`tests/lib/acciones.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";

const errorPg = (code: string) => Object.assign(new Error("query falló"), { cause: { code } });

describe("conRestricciones", () => {
  it("devuelve el resultado si no hay error", async () => {
    expect(await conRestricciones(async () => 42, {})).toBe(42);
  });

  it("traduce UNIQUE y FK al mensaje indicado", async () => {
    const unico = conRestricciones(() => Promise.reject(errorPg("23505")), { unico: "Repetido" });
    await expect(unico).rejects.toThrow(new ErrorNegocio("Repetido"));
    const fk = conRestricciones(() => Promise.reject(errorPg("23503")), { fk: "En uso" });
    await expect(fk).rejects.toThrow(new ErrorNegocio("En uso"));
  });

  it("deja pasar errores sin mensaje configurado", async () => {
    const error = errorPg("23505");
    await expect(conRestricciones(() => Promise.reject(error), { fk: "En uso" })).rejects.toBe(error);
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run tests/lib/acciones.test.ts`
Expected: FAIL — `conRestricciones` no está exportado.

- [ ] **Step 4: Implementar**

`src/db/errores.ts`:

```ts
/** Códigos SQLSTATE de Postgres; drizzle los envuelve en `cause` según el driver. */
function tieneCodigo(error: unknown, codigo: string): boolean {
  for (let e = error; e instanceof Object; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === codigo) return true;
  }
  return false;
}

export const esViolacionUnica = (error: unknown) => tieneCodigo(error, "23505");
export const esViolacionFk = (error: unknown) => tieneCodigo(error, "23503");
```

En `src/lib/users.ts`, borrar la función `esViolacionUnica` (y su comentario) y agregar debajo de los imports:

```ts
import { esViolacionUnica } from "@/db/errores";

export { esViolacionUnica };
```

(El re-export mantiene funcionando `tests/lib/users.test.ts`.)

En `src/lib/acciones.ts`, agregar el import y la función al final:

```ts
import { esViolacionFk, esViolacionUnica } from "@/db/errores";
```

```ts
/** Corre `fn` y traduce violaciones de UNIQUE / FK de Postgres a ErrorNegocio con estos mensajes. */
export async function conRestricciones<T>(
  fn: () => Promise<T>,
  mensajes: { unico?: string; fk?: string },
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (mensajes.unico && esViolacionUnica(error)) throw new ErrorNegocio(mensajes.unico);
    if (mensajes.fk && esViolacionFk(error)) throw new ErrorNegocio(mensajes.fk);
    throw error;
  }
}
```

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS (los 30 tests anteriores + 3 nuevos).

- [ ] **Step 6: Commit**

```bash
git add src/db/errores.ts src/lib/users.ts src/lib/acciones.ts tests/lib/acciones.test.ts
git commit -m "feat: traducir violaciones de UNIQUE y FK a errores de negocio"
```

---

### Task 2: Esquema de presupuestos, migración y seed de áreas/rubros

**Files:**
- Create: `src/db/presupuestos-schema.ts`
- Modify: `src/db/schema.ts`
- Create: `drizzle/0001_*.sql` (generada), `drizzle/0002_seed_areas_rubros.sql` (custom)
- Test: `tests/db/seed.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/db/seed.test.ts`:

```ts
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { area, rubro } from "@/db/schema";
import { crearDbPrueba } from "../helpers/db";

describe("migraciones", () => {
  it("cargan las 6 áreas y los 7 rubros iniciales", async () => {
    const db = await crearDbPrueba();
    const areas = await db.select().from(area).orderBy(asc(area.id));
    expect(areas.map((a) => a.nombre)).toEqual([
      "Marketing y Audiovisual",
      "Técnica, Escenario y Backline",
      "Logística, Hospitalidad y RRHH",
      "Infraestructura y Predio",
      "Seguridad y Prevención",
      "Gestión Presupuestaria",
    ]);

    const rubros = await db.select().from(rubro);
    expect(rubros).toHaveLength(7);
    const [sonido] = await db.select().from(rubro).where(eq(rubro.nombre, "Sonido"));
    expect(sonido).toMatchObject({ areaId: 2, dias: 2 });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/db/seed.test.ts`
Expected: FAIL — `area` no se exporta de `@/db/schema`.

- [ ] **Step 3: Definir las tablas**

`src/db/presupuestos-schema.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// En los CHECK y el índice parcial se usan nombres de columna crudos: Postgres no
// acepta columnas calificadas con la tabla ahí y drizzle-kit las calificaría.

/** Las 6 áreas del evento. Fijas: se cargan en la migración 0002. */
export const area = pgTable("area", {
  id: integer("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
});

export const rubro = pgTable(
  "rubro",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    nombre: text("nombre").notNull().unique(),
    areaId: integer("area_id")
      .notNull()
      .references(() => area.id),
    dias: integer("dias").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  () => [check("rubro_dias_check", sql`dias in (1, 2)`)],
);

export const proveedor = pgTable("proveedor", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nombre: text("nombre").notNull().unique(),
  contacto: text("contacto"),
  telefono: text("telefono"),
  email: text("email"),
  notas: text("notas"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cotizacion = pgTable(
  "cotizacion",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    rubroId: text("rubro_id")
      .notNull()
      .references(() => rubro.id, { onDelete: "restrict" }),
    proveedorId: text("proveedor_id")
      .notNull()
      .references(() => proveedor.id, { onDelete: "restrict" }),
    descripcion: text("descripcion").notNull(),
    moneda: text("moneda").notNull(),
    precioDia: numeric("precio_dia", { precision: 14, scale: 2 }).notNull(),
    descuento2Dias: numeric("descuento_2_dias", { precision: 5, scale: 2 }).notNull().default("0"),
    /** Nombre del PDF en UPLOADS_DIR (ver src/lib/adjuntos.ts). */
    adjunto: text("adjunto"),
    estado: text("estado").notNull().default("pendiente"),
    creadoPor: text("creado_por").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("cotizacion_moneda_check", sql`moneda in ('BOB', 'USD', 'ARS')`),
    check("cotizacion_estado_check", sql`estado in ('pendiente', 'aprobada', 'descartada')`),
    check("cotizacion_precio_check", sql`precio_dia > 0`),
    check("cotizacion_descuento_check", sql`descuento_2_dias between 0 and 100`),
    // Regla de negocio: como máximo una cotización aprobada por rubro.
    uniqueIndex("cotizacion_una_aprobada_por_rubro").on(t.rubroId).where(sql`estado = 'aprobada'`),
    index("cotizacion_rubro_idx").on(t.rubroId),
    index("cotizacion_proveedor_idx").on(t.proveedorId),
  ],
);

/** Cuántos BOB vale 1 unidad de la moneda. BOB no se guarda: siempre vale 1. */
export const tipoCambio = pgTable(
  "tipo_cambio",
  {
    moneda: text("moneda").primaryKey(),
    valorBob: numeric("valor_bob", { precision: 14, scale: 6 }).notNull(),
    actualizadoPor: text("actualizado_por").references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  () => [
    check("tipo_cambio_moneda_check", sql`moneda in ('USD', 'ARS')`),
    check("tipo_cambio_valor_check", sql`valor_bob > 0`),
  ],
);
```

`src/db/schema.ts`:

```ts
export * from "./auth-schema";
export * from "./presupuestos-schema";
```

- [ ] **Step 4: Generar la migración de tablas**

Run: `npm run db:generate`
Expected: crea `drizzle/0001_<nombre>.sql` con `CREATE TABLE "area"`, `"rubro"`, `"proveedor"`, `"cotizacion"`, `"tipo_cambio"`, los CHECK, las FK y `CREATE UNIQUE INDEX "cotizacion_una_aprobada_por_rubro" ... WHERE estado = 'aprobada'`. Revisar el SQL: los CHECK y el `WHERE` deben usar nombres crudos (`estado`, no `"cotizacion"."estado"`).

- [ ] **Step 5: Crear la migración de seed**

Run: `npx drizzle-kit generate --custom --name=seed_areas_rubros`
Expected: crea `drizzle/0002_seed_areas_rubros.sql` vacío y lo agrega a `drizzle/meta/_journal.json`.

Contenido de `drizzle/0002_seed_areas_rubros.sql`:

```sql
INSERT INTO "area" ("id", "nombre") VALUES
  (1, 'Marketing y Audiovisual'),
  (2, 'Técnica, Escenario y Backline'),
  (3, 'Logística, Hospitalidad y RRHH'),
  (4, 'Infraestructura y Predio'),
  (5, 'Seguridad y Prevención'),
  (6, 'Gestión Presupuestaria');
--> statement-breakpoint
INSERT INTO "rubro" ("id", "nombre", "area_id", "dias") VALUES
  (gen_random_uuid()::text, 'Técnica', 2, 2),
  (gen_random_uuid()::text, 'Sonido', 2, 2),
  (gen_random_uuid()::text, 'Pantalla', 2, 2),
  (gen_random_uuid()::text, 'Escenario', 2, 2),
  (gen_random_uuid()::text, 'Luces', 2, 2),
  (gen_random_uuid()::text, 'Vallas blancas', 4, 2),
  (gen_random_uuid()::text, 'Vallas freestanding', 4, 2);
```

- [ ] **Step 6: Correr el test**

Run: `npx vitest run tests/db/seed.test.ts`
Expected: PASS.

- [ ] **Step 7: Aplicar en la DB local y correr la suite**

Con `npm run dev` apagado:

Run: `npm run db:migrate && npm test`
Expected: `Migraciones aplicadas`; todos los tests en PASS.

- [ ] **Step 8: Commit**

```bash
git add src/db/presupuestos-schema.ts src/db/schema.ts drizzle tests/db/seed.test.ts
git commit -m "feat(db): tablas de presupuestos y seed de áreas y rubros"
```

---

### Task 3: `money.ts` — cálculos puros (TDD)

**Files:**
- Create: `src/lib/money.ts`
- Test: `tests/lib/money.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/lib/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  aBob,
  ahorroCotizacion,
  desdeBob,
  esMoneda,
  formatearMonto,
  totalCotizacion,
  totalEvento,
} from "@/lib/money";

describe("totalCotizacion y ahorroCotizacion", () => {
  it("1 día: el precio por día, sin ahorro (ignora el descuento)", () => {
    const precio = { precioDia: 1000, descuento2Dias: 10, dias: 1 };
    expect(totalCotizacion(precio)).toBe(1000);
    expect(ahorroCotizacion(precio)).toBe(0);
  });

  it("2 días: precio × 2 menos el descuento", () => {
    const precio = { precioDia: 1000, descuento2Dias: 10, dias: 2 };
    expect(totalCotizacion(precio)).toBe(1800);
    expect(ahorroCotizacion(precio)).toBe(200);
  });

  it("descuento 0 y 100", () => {
    expect(totalCotizacion({ precioDia: 1000, descuento2Dias: 0, dias: 2 })).toBe(2000);
    expect(totalCotizacion({ precioDia: 1000, descuento2Dias: 100, dias: 2 })).toBe(0);
    expect(ahorroCotizacion({ precioDia: 1000, descuento2Dias: 100, dias: 2 })).toBe(2000);
  });

  it("redondea a centavos", () => {
    // 33.33 × 2 × 0.85 = 56.661
    expect(totalCotizacion({ precioDia: 33.33, descuento2Dias: 15, dias: 2 })).toBe(56.66);
  });
});

describe("conversión", () => {
  const tipos = { USD: 6.96 };

  it("BOB vale 1 y no necesita tipo de cambio", () => {
    expect(aBob(150, "BOB", {})).toBe(150);
    expect(desdeBob(150, "BOB", {})).toBe(150);
  });

  it("convierte con el tipo de cambio", () => {
    expect(aBob(100, "USD", tipos)).toBe(696);
    expect(desdeBob(696, "USD", tipos)).toBe(100);
  });

  it("sin tipo de cambio devuelve null", () => {
    expect(aBob(100, "ARS", tipos)).toBeNull();
    expect(desdeBob(100, "ARS", tipos)).toBeNull();
  });
});

describe("totalEvento", () => {
  it("suma en BOB", () => {
    const montos = [
      { monto: 1000, moneda: "BOB" as const },
      { monto: 100, moneda: "USD" as const },
    ];
    expect(totalEvento(montos, { USD: 6.96 })).toEqual({ bob: 1696, faltan: [] });
  });

  it("sin montos da 0", () => {
    expect(totalEvento([], {})).toEqual({ bob: 0, faltan: [] });
  });

  it("si falta un tipo de cambio no da número y avisa cuáles faltan", () => {
    const montos = [
      { monto: 1, moneda: "ARS" as const },
      { monto: 1, moneda: "USD" as const },
      { monto: 2, moneda: "ARS" as const },
    ];
    expect(totalEvento(montos, {})).toEqual({ bob: null, faltan: ["ARS", "USD"] });
  });

  it("no arrastra error de punto flotante", () => {
    const montos = [
      { monto: 0.1, moneda: "BOB" as const },
      { monto: 0.2, moneda: "BOB" as const },
    ];
    expect(totalEvento(montos, {}).bob).toBe(0.3);
  });
});

describe("formato", () => {
  it("formatea con separadores de Bolivia", () => {
    expect(formatearMonto(1234.5, "USD")).toBe("USD 1.234,50");
  });

  it("esMoneda", () => {
    expect(esMoneda("ARS")).toBe(true);
    expect(esMoneda("EUR")).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/lib/money.test.ts`
Expected: FAIL — no existe `@/lib/money`.

- [ ] **Step 3: Implementar**

`src/lib/money.ts`:

```ts
// Funciones puras de plata: sin DB ni Next, se usan en servidor y cliente.

export const MONEDAS = ["BOB", "USD", "ARS"] as const;
export type Moneda = (typeof MONEDAS)[number];

export const MONEDAS_EXTRANJERAS = ["USD", "ARS"] as const;
export type MonedaExtranjera = (typeof MONEDAS_EXTRANJERAS)[number];

/** Cuántos BOB vale 1 unidad de cada moneda. BOB siempre vale 1 y no se incluye. */
export type TiposCambio = Partial<Record<MonedaExtranjera, number>>;

export type Precio = { precioDia: number; descuento2Dias: number; dias: number };

/** Total en BOB del evento; `null` si falta el tipo de cambio de alguna moneda usada. */
export type TotalBob = { bob: number; faltan: [] } | { bob: null; faltan: Moneda[] };

export function esMoneda(valor: string): valor is Moneda {
  return (MONEDAS as readonly string[]).includes(valor);
}

export function redondear(monto: number): number {
  return Math.round((monto + Number.EPSILON) * 100) / 100;
}

export function totalCotizacion({ precioDia, descuento2Dias, dias }: Precio): number {
  if (dias === 1) return redondear(precioDia);
  return redondear(precioDia * 2 * (1 - descuento2Dias / 100));
}

export function ahorroCotizacion({ precioDia, descuento2Dias, dias }: Precio): number {
  if (dias === 1) return 0;
  return redondear((precioDia * 2 * descuento2Dias) / 100);
}

function valorEnBob(moneda: Moneda, tipos: TiposCambio): number | null {
  return moneda === "BOB" ? 1 : (tipos[moneda] ?? null);
}

export function aBob(monto: number, moneda: Moneda, tipos: TiposCambio): number | null {
  const valor = valorEnBob(moneda, tipos);
  return valor === null ? null : redondear(monto * valor);
}

export function desdeBob(montoBob: number, moneda: Moneda, tipos: TiposCambio): number | null {
  const valor = valorEnBob(moneda, tipos);
  return valor === null ? null : redondear(montoBob / valor);
}

export function totalEvento(montos: { monto: number; moneda: Moneda }[], tipos: TiposCambio): TotalBob {
  const faltan = [...new Set(montos.map((m) => m.moneda))].filter((m) => valorEnBob(m, tipos) === null).sort();
  if (faltan.length > 0) return { bob: null, faltan };
  const suma = montos.reduce((total, m) => total + aBob(m.monto, m.moneda, tipos)!, 0);
  return { bob: redondear(suma), faltan: [] };
}

const FORMATO = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatearMonto(monto: number, moneda: Moneda): string {
  return `${moneda} ${FORMATO.format(monto)}`;
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run tests/lib/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.ts tests/lib/money.test.ts
git commit -m "feat: cálculos de cotizaciones, conversión y total del evento"
```

---

### Task 4: Validación reutilizable y rubros (TDD)

**Files:**
- Create: `src/lib/validacion.ts`, `src/lib/rubros.ts`
- Test: `tests/lib/validacion.test.ts`, `tests/lib/rubros.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

`tests/lib/validacion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decimal, textoOpcional } from "@/lib/validacion";

describe("decimal", () => {
  const precio = decimal("Precio inválido", 2);

  it("acepta punto o coma decimal y devuelve string con punto", () => {
    expect(precio.parse("1500")).toBe("1500");
    expect(precio.parse(" 1500,5 ")).toBe("1500.5");
    expect(precio.parse("0.25")).toBe("0.25");
  });

  it("rechaza separadores de miles, negativos, texto y decimales de más", () => {
    for (const valor of ["1.500,50", "-3", "abc", "1.234", ""]) {
      expect(precio.safeParse(valor).success).toBe(false);
    }
  });
});

describe("textoOpcional", () => {
  const texto = textoOpcional(10);

  it("vacío o ausente es null; el resto se recorta", () => {
    expect(texto.parse(undefined)).toBeNull();
    expect(texto.parse("   ")).toBeNull();
    expect(texto.parse(" hola ")).toBe("hola");
  });

  it("respeta el máximo", () => {
    expect(texto.safeParse("x".repeat(11)).success).toBe(false);
  });
});
```

`tests/lib/rubros.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import {
  borrarRubro,
  crearRubro,
  editarRubro,
  listarAreas,
  listarRubros,
  obtenerRubro,
  rubroSchema,
} from "@/lib/rubros";
import { crearDbPrueba } from "../helpers/db";

const datos = (extra: Record<string, string> = {}) =>
  rubroSchema.parse({ nombre: "Catering", areaId: "3", dias: "1", ...extra });

describe("rubroSchema", () => {
  it("convierte área y días a número", () => {
    expect(datos()).toEqual({ nombre: "Catering", areaId: 3, dias: 1 });
  });

  it("días solo 1 o 2", () => {
    const resultado = rubroSchema.safeParse({ nombre: "Catering", areaId: "3", dias: "3" });
    expect(resultado.error?.issues[0].message).toBe("Los días deben ser 1 o 2");
  });

  it("área vacía es inválida", () => {
    const resultado = rubroSchema.safeParse({ nombre: "Catering", areaId: "", dias: "1" });
    expect(resultado.error?.issues[0].message).toBe("Área inválida");
  });
});

describe("con DB", () => {
  let db: Db;
  beforeEach(async () => {
    db = await crearDbPrueba();
  });

  it("listarAreas devuelve las 6 áreas en orden", async () => {
    const areas = await listarAreas(db);
    expect(areas).toHaveLength(6);
    expect(areas[0]).toEqual({ id: 1, nombre: "Marketing y Audiovisual" });
  });

  it("listarRubros trae el nombre del área, ordenado por área y nombre", async () => {
    const rubros = await listarRubros(db);
    expect(rubros.map((r) => r.nombre)).toEqual([
      "Escenario",
      "Luces",
      "Pantalla",
      "Sonido",
      "Técnica",
      "Vallas blancas",
      "Vallas freestanding",
    ]);
    expect(rubros[0]).toMatchObject({ area: "Técnica, Escenario y Backline", areaId: 2, dias: 2 });
  });

  it("crea y obtiene un rubro", async () => {
    const id = await crearRubro(db, datos());
    expect(await obtenerRubro(db, id)).toMatchObject({
      id,
      nombre: "Catering",
      areaId: 3,
      area: "Logística, Hospitalidad y RRHH",
      dias: 1,
    });
    expect(await obtenerRubro(db, "no-existe")).toBeUndefined();
  });

  it("nombre repetido o área inexistente vuelven como ErrorNegocio", async () => {
    await expect(crearRubro(db, datos({ nombre: "Sonido" }))).rejects.toThrow("Ya existe un rubro con ese nombre");
    await expect(crearRubro(db, datos({ areaId: "99" }))).rejects.toThrow("Área inválida");
  });

  it("edita un rubro", async () => {
    const id = await crearRubro(db, datos());
    await editarRubro(db, id, datos({ dias: "2", nombre: "Catering artistas" }));
    expect(await obtenerRubro(db, id)).toMatchObject({ nombre: "Catering artistas", dias: 2 });
    await expect(editarRubro(db, "no-existe", datos())).rejects.toThrow("El rubro no existe");
  });

  it("borra un rubro", async () => {
    const id = await crearRubro(db, datos());
    await borrarRubro(db, id);
    expect(await obtenerRubro(db, id)).toBeUndefined();
    await expect(borrarRubro(db, id)).rejects.toThrow("El rubro no existe");
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/lib/validacion.test.ts tests/lib/rubros.test.ts`
Expected: FAIL — no existen los módulos.

- [ ] **Step 3: Implementar**

`src/lib/validacion.ts`:

```ts
import { z } from "zod";

/** Texto opcional de formulario: vacío o ausente se guarda como null. */
export function textoOpcional(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((valor) => valor || null);
}

/**
 * Decimal no negativo escrito en un formulario. Acepta coma o punto decimal (sin
 * separador de miles) y lo devuelve como string con punto, listo para `numeric`.
 */
export function decimal(mensaje: string, decimales: number) {
  const patron = new RegExp(`^\\d+(\\.\\d{1,${decimales}})?$`);
  return z
    .string(mensaje)
    .trim()
    .transform((valor) => valor.replace(",", "."))
    .pipe(z.string().regex(patron, mensaje));
}
```

`src/lib/rubros.ts`:

```ts
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { area, rubro } from "@/db/schema";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";

export const rubroSchema = z.object({
  nombre: z.string("Falta el nombre").trim().min(2, "El nombre es muy corto").max(80, "El nombre es muy largo"),
  areaId: z.coerce.number("Área inválida").int("Área inválida").positive("Área inválida"),
  dias: z.enum(["1", "2"], "Los días deben ser 1 o 2").transform(Number),
});

export type DatosRubro = z.infer<typeof rubroSchema>;

const MENSAJES = { unico: "Ya existe un rubro con ese nombre", fk: "Área inválida" };

export function listarAreas(db: Db) {
  return db.select().from(area).orderBy(asc(area.id));
}

function consultaRubros(db: Db) {
  return db
    .select({ id: rubro.id, nombre: rubro.nombre, dias: rubro.dias, areaId: rubro.areaId, area: area.nombre })
    .from(rubro)
    .innerJoin(area, eq(rubro.areaId, area.id));
}

export function listarRubros(db: Db) {
  return consultaRubros(db).orderBy(asc(area.id), asc(rubro.nombre));
}

export async function obtenerRubro(db: Db, id: string) {
  const [fila] = await consultaRubros(db).where(eq(rubro.id, id));
  return fila;
}

export async function crearRubro(db: Db, datos: DatosRubro): Promise<string> {
  const [fila] = await conRestricciones(
    () => db.insert(rubro).values(datos).returning({ id: rubro.id }),
    MENSAJES,
  );
  return fila.id;
}

export async function editarRubro(db: Db, id: string, datos: DatosRubro): Promise<void> {
  const filas = await conRestricciones(
    () => db.update(rubro).set(datos).where(eq(rubro.id, id)).returning({ id: rubro.id }),
    MENSAJES,
  );
  if (filas.length === 0) throw new ErrorNegocio("El rubro no existe");
}

export async function borrarRubro(db: Db, id: string): Promise<void> {
  const filas = await conRestricciones(
    () => db.delete(rubro).where(eq(rubro.id, id)).returning({ id: rubro.id }),
    { fk: "El rubro tiene cotizaciones: borralas primero" },
  );
  if (filas.length === 0) throw new ErrorNegocio("El rubro no existe");
}
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run tests/lib/validacion.test.ts tests/lib/rubros.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validacion.ts src/lib/rubros.ts tests/lib/validacion.test.ts tests/lib/rubros.test.ts
git commit -m "feat: áreas y ABM de rubros"
```

---

### Task 5: Proveedores (TDD)

**Files:**
- Create: `src/lib/proveedores.ts`
- Test: `tests/lib/proveedores.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/lib/proveedores.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import {
  borrarProveedor,
  crearProveedor,
  editarProveedor,
  listarProveedores,
  obtenerProveedor,
  proveedorSchema,
} from "@/lib/proveedores";
import { crearDbPrueba } from "../helpers/db";

const datos = (extra: Record<string, string> = {}) => proveedorSchema.parse({ nombre: "Sonido Andino", ...extra });

describe("proveedorSchema", () => {
  it("campos opcionales vacíos o ausentes quedan en null", () => {
    expect(datos({ contacto: "", email: "  " })).toEqual({
      nombre: "Sonido Andino",
      contacto: null,
      telefono: null,
      email: null,
      notas: null,
    });
  });

  it("valida el email si viene", () => {
    expect(proveedorSchema.safeParse({ nombre: "X SA", email: "no-es-email" }).error?.issues[0].message).toBe(
      "Email inválido",
    );
    expect(datos({ email: "ventas@andino.bo" }).email).toBe("ventas@andino.bo");
  });
});

describe("con DB", () => {
  let db: Db;
  beforeEach(async () => {
    db = await crearDbPrueba();
  });

  it("crea, obtiene y lista ordenado por nombre", async () => {
    const id = await crearProveedor(db, datos({ contacto: "Juan" }));
    await crearProveedor(db, datos({ nombre: "Audio Total" }));
    expect(await obtenerProveedor(db, id)).toMatchObject({ nombre: "Sonido Andino", contacto: "Juan" });
    expect((await listarProveedores(db)).map((p) => p.nombre)).toEqual(["Audio Total", "Sonido Andino"]);
  });

  it("busca por nombre o contacto sin importar mayúsculas", async () => {
    await crearProveedor(db, datos({ contacto: "Juan Pérez" }));
    await crearProveedor(db, datos({ nombre: "Vallas Sur", contacto: "María" }));
    // Sin acentos en la búsqueda: con collation C, ILIKE solo pliega mayúsculas ASCII.
    expect((await listarProveedores(db, "ANDINO")).map((p) => p.nombre)).toEqual(["Sonido Andino"]);
    expect((await listarProveedores(db, "juan")).map((p) => p.nombre)).toEqual(["Sonido Andino"]);
    expect((await listarProveedores(db, "vallas")).map((p) => p.nombre)).toEqual(["Vallas Sur"]);
  });

  it("nombre repetido vuelve como ErrorNegocio", async () => {
    await crearProveedor(db, datos());
    await expect(crearProveedor(db, datos())).rejects.toThrow("Ya existe un proveedor con ese nombre");
  });

  it("edita y borra", async () => {
    const id = await crearProveedor(db, datos());
    await editarProveedor(db, id, datos({ telefono: "70000000" }));
    expect((await obtenerProveedor(db, id))?.telefono).toBe("70000000");
    await borrarProveedor(db, id);
    expect(await obtenerProveedor(db, id)).toBeUndefined();
  });

  it("editar o borrar uno inexistente vuelve como ErrorNegocio", async () => {
    await expect(editarProveedor(db, "no-existe", datos())).rejects.toThrow("El proveedor no existe");
    await expect(borrarProveedor(db, "no-existe")).rejects.toThrow("El proveedor no existe");
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/lib/proveedores.test.ts`
Expected: FAIL — no existe `@/lib/proveedores`.

- [ ] **Step 3: Implementar**

`src/lib/proveedores.ts`:

```ts
import { asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { proveedor } from "@/db/schema";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";
import { textoOpcional } from "@/lib/validacion";

export const proveedorSchema = z.object({
  nombre: z.string("Falta el nombre").trim().min(2, "El nombre es muy corto").max(120, "El nombre es muy largo"),
  contacto: textoOpcional(120),
  telefono: textoOpcional(40),
  email: textoOpcional(120).refine((v) => v === null || z.email().safeParse(v).success, "Email inválido"),
  notas: textoOpcional(2000),
});

export type DatosProveedor = z.infer<typeof proveedorSchema>;

const MENSAJES = { unico: "Ya existe un proveedor con ese nombre" };

/** Proveedores ordenados por nombre; `busqueda` filtra por nombre o contacto. */
export function listarProveedores(db: Db, busqueda = "") {
  const patron = `%${busqueda}%`;
  return db
    .select()
    .from(proveedor)
    .where(busqueda ? or(ilike(proveedor.nombre, patron), ilike(proveedor.contacto, patron)) : undefined)
    .orderBy(asc(proveedor.nombre));
}

export async function obtenerProveedor(db: Db, id: string) {
  const [fila] = await db.select().from(proveedor).where(eq(proveedor.id, id));
  return fila;
}

export async function crearProveedor(db: Db, datos: DatosProveedor): Promise<string> {
  const [fila] = await conRestricciones(
    () => db.insert(proveedor).values(datos).returning({ id: proveedor.id }),
    MENSAJES,
  );
  return fila.id;
}

export async function editarProveedor(db: Db, id: string, datos: DatosProveedor): Promise<void> {
  const filas = await conRestricciones(
    () => db.update(proveedor).set(datos).where(eq(proveedor.id, id)).returning({ id: proveedor.id }),
    MENSAJES,
  );
  if (filas.length === 0) throw new ErrorNegocio("El proveedor no existe");
}

export async function borrarProveedor(db: Db, id: string): Promise<void> {
  const filas = await conRestricciones(
    () => db.delete(proveedor).where(eq(proveedor.id, id)).returning({ id: proveedor.id }),
    { fk: "El proveedor tiene cotizaciones: borralas primero" },
  );
  if (filas.length === 0) throw new ErrorNegocio("El proveedor no existe");
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run tests/lib/proveedores.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proveedores.ts tests/lib/proveedores.test.ts
git commit -m "feat: ABM y búsqueda de proveedores"
```

---

### Task 6: Tipos de cambio (TDD)

**Files:**
- Create: `src/lib/tipos-cambio.ts`
- Test: `tests/lib/tipos-cambio.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/lib/tipos-cambio.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { guardarTipoCambio, listarTiposCambio, obtenerTiposCambio, tipoCambioSchema } from "@/lib/tipos-cambio";
import { crearDbPrueba } from "../helpers/db";

describe("tipoCambioSchema", () => {
  it("acepta coma decimal y hasta 6 decimales", () => {
    expect(tipoCambioSchema.parse({ moneda: "ARS", valorBob: "0,007512" })).toEqual({
      moneda: "ARS",
      valorBob: "0.007512",
    });
  });

  it("rechaza BOB/EUR y valores no positivos", () => {
    expect(tipoCambioSchema.safeParse({ moneda: "BOB", valorBob: "1" }).error?.issues[0].message).toBe("Moneda inválida");
    expect(tipoCambioSchema.safeParse({ moneda: "USD", valorBob: "0" }).error?.issues[0].message).toBe(
      "El valor debe ser mayor a 0",
    );
  });
});

describe("con DB", () => {
  let db: Db;
  beforeEach(async () => {
    db = await crearDbPrueba();
  });

  it("sin datos no hay tipos de cambio", async () => {
    expect(await obtenerTiposCambio(db)).toEqual({});
  });

  it("guarda y actualiza (una fila por moneda)", async () => {
    await guardarTipoCambio(db, tipoCambioSchema.parse({ moneda: "USD", valorBob: "6.96" }), null);
    await guardarTipoCambio(db, tipoCambioSchema.parse({ moneda: "USD", valorBob: "7" }), null);
    await guardarTipoCambio(db, tipoCambioSchema.parse({ moneda: "ARS", valorBob: "0.0075" }), null);
    expect(await obtenerTiposCambio(db)).toEqual({ USD: 7, ARS: 0.0075 });

    const lista = await listarTiposCambio(db);
    expect(lista).toHaveLength(2);
    expect(lista.find((t) => t.moneda === "USD")).toMatchObject({ valorBob: "7.000000", actualizadoPor: null });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/lib/tipos-cambio.test.ts`
Expected: FAIL — no existe `@/lib/tipos-cambio`.

- [ ] **Step 3: Implementar**

`src/lib/tipos-cambio.ts`:

```ts
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { tipoCambio, user } from "@/db/schema";
import { MONEDAS_EXTRANJERAS, type TiposCambio } from "@/lib/money";
import { decimal } from "@/lib/validacion";

export const tipoCambioSchema = z.object({
  moneda: z.enum(MONEDAS_EXTRANJERAS, "Moneda inválida"),
  valorBob: decimal("Valor inválido: usá solo números, ej. 6.96", 6).refine(
    (valor) => Number(valor) > 0,
    "El valor debe ser mayor a 0",
  ),
});

export type DatosTipoCambio = z.infer<typeof tipoCambioSchema>;

/** Tipos de cambio cargados, listos para `money.ts`. */
export async function obtenerTiposCambio(db: Db): Promise<TiposCambio> {
  const filas = await db.select({ moneda: tipoCambio.moneda, valorBob: tipoCambio.valorBob }).from(tipoCambio);
  return Object.fromEntries(filas.map((f) => [f.moneda, Number(f.valorBob)]));
}

/** Para la pantalla de configuración: valor, fecha y quién lo actualizó. */
export function listarTiposCambio(db: Db) {
  return db
    .select({
      moneda: tipoCambio.moneda,
      valorBob: tipoCambio.valorBob,
      updatedAt: tipoCambio.updatedAt,
      actualizadoPor: user.name,
    })
    .from(tipoCambio)
    .leftJoin(user, eq(tipoCambio.actualizadoPor, user.id))
    .orderBy(asc(tipoCambio.moneda));
}

export async function guardarTipoCambio(db: Db, datos: DatosTipoCambio, actorId: string | null): Promise<void> {
  await db
    .insert(tipoCambio)
    .values({ ...datos, actualizadoPor: actorId })
    .onConflictDoUpdate({
      target: tipoCambio.moneda,
      set: { valorBob: datos.valorBob, actualizadoPor: actorId, updatedAt: new Date() },
    });
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run tests/lib/tipos-cambio.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tipos-cambio.ts tests/lib/tipos-cambio.test.ts
git commit -m "feat: tipos de cambio USD y ARS"
```

---

### Task 7: Adjuntos PDF en disco (TDD)

**Files:**
- Create: `src/lib/limites.ts`, `src/lib/adjuntos.ts`
- Modify: `.env.example` (documentar `UPLOADS_DIR`)
- Test: `tests/lib/adjuntos.test.ts`, `tests/helpers/presupuestos.ts`

- [ ] **Step 1: Crear el helper de PDF para tests**

`tests/helpers/presupuestos.ts` (se completa en Task 8):

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Un PDF mínimo (alcanza con la firma `%PDF-`). */
export const pdf = (contenido = "%PDF-1.4 prueba") => new File([contenido], "cotizacion.pdf", { type: "application/pdf" });

/** Apunta UPLOADS_DIR a una carpeta temporal nueva y la devuelve. */
export function usarUploadsTemporal(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "vibra-uploads-"));
  process.env.UPLOADS_DIR = dir;
  return dir;
}
```

- [ ] **Step 2: Escribir el test que falla**

`tests/lib/adjuntos.test.ts`:

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { borrarPdf, conPdfNuevo, guardarPdf, hayArchivo, leerPdf } from "@/lib/adjuntos";
import { MAX_ADJUNTO } from "@/lib/limites";
import { pdf, usarUploadsTemporal } from "../helpers/presupuestos";

let dir: string;
beforeEach(() => {
  dir = usarUploadsTemporal();
});

describe("hayArchivo", () => {
  it("un input file vacío no cuenta", () => {
    expect(hayArchivo(new File([], ""))).toBe(false);
    expect(hayArchivo("texto")).toBe(false);
    expect(hayArchivo(pdf())).toBe(true);
  });
});

describe("guardarPdf / leerPdf / borrarPdf", () => {
  it("guarda con nombre aleatorio, lo lee y lo borra", async () => {
    const nombre = await guardarPdf(pdf("%PDF-1.4 hola"));
    expect(nombre).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect((await leerPdf(nombre))?.toString()).toBe("%PDF-1.4 hola");

    await borrarPdf(nombre);
    expect(existsSync(path.join(dir, nombre))).toBe(false);
    expect(await leerPdf(nombre)).toBeNull();
  });

  it("rechaza lo que no es PDF y lo que supera 10 MB", async () => {
    await expect(guardarPdf(new File(["hola"], "x.pdf"))).rejects.toThrow("El adjunto debe ser un PDF");
    const grande = new File([new Uint8Array(MAX_ADJUNTO + 1)], "x.pdf");
    await expect(guardarPdf(grande)).rejects.toThrow("El adjunto supera los 10 MB");
  });

  it("no lee nombres que no generó (path traversal)", async () => {
    expect(await leerPdf("../../.env.local")).toBeNull();
    await expect(borrarPdf("../../.env.local")).resolves.toBeUndefined();
  });
});

describe("conPdfNuevo", () => {
  it("si la operación falla borra el PDF recién guardado", async () => {
    let guardado: string | null = null;
    const fallar = conPdfNuevo(pdf(), async (nombre) => {
      guardado = nombre;
      throw new Error("falló");
    });
    await expect(fallar).rejects.toThrow("falló");
    expect(existsSync(path.join(dir, guardado!))).toBe(false);
  });

  it("sin archivo llama con null", async () => {
    let recibido: string | null | undefined;
    await conPdfNuevo(new File([], ""), async (nombre) => {
      recibido = nombre;
    });
    expect(recibido).toBeNull();
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run tests/lib/adjuntos.test.ts`
Expected: FAIL — no existe `@/lib/adjuntos`.

- [ ] **Step 4: Implementar**

`src/lib/limites.ts`:

```ts
/** Tamaño máximo de un PDF adjunto. Lo chequean el formulario (cliente) y el servidor. */
export const MAX_ADJUNTO = 10 * 1024 * 1024;
```

`src/lib/adjuntos.ts`:

```ts
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ErrorNegocio } from "@/lib/acciones";
import { MAX_ADJUNTO } from "@/lib/limites";

// Solo se leen/borran nombres generados por guardarPdf: evita path traversal.
const NOMBRE_VALIDO = /^[0-9a-f-]{36}\.pdf$/;

function directorio(): string {
  return process.env.UPLOADS_DIR || "./.data/uploads";
}

/** Un input file vacío llega como File de tamaño 0. */
export function hayArchivo(valor: unknown): valor is File {
  return valor instanceof File && valor.size > 0;
}

export async function guardarPdf(archivo: File): Promise<string> {
  if (archivo.size > MAX_ADJUNTO) throw new ErrorNegocio("El adjunto supera los 10 MB");
  const bytes = Buffer.from(await archivo.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new ErrorNegocio("El adjunto debe ser un PDF");

  const nombre = `${crypto.randomUUID()}.pdf`;
  await mkdir(directorio(), { recursive: true });
  await writeFile(path.join(directorio(), nombre), bytes);
  return nombre;
}

/** Contenido del PDF, o null si el nombre no es válido o el archivo no existe. */
export async function leerPdf(nombre: string): Promise<Buffer | null> {
  if (!NOMBRE_VALIDO.test(nombre)) return null;
  return readFile(path.join(directorio(), nombre)).catch(() => null);
}

export async function borrarPdf(nombre: string | null): Promise<void> {
  if (nombre && NOMBRE_VALIDO.test(nombre)) await rm(path.join(directorio(), nombre), { force: true });
}

/** Guarda el PDF (si vino) y corre `fn` con su nombre; si `fn` falla, borra el archivo guardado. */
export async function conPdfNuevo(archivo: unknown, fn: (nombre: string | null) => Promise<void>): Promise<void> {
  const nombre = hayArchivo(archivo) ? await guardarPdf(archivo) : null;
  try {
    await fn(nombre);
  } catch (error) {
    await borrarPdf(nombre);
    throw error;
  }
}
```

En `.env.example`, agregar al final:

```bash

# Carpeta de los PDF adjuntos. Vacío = ./.data/uploads. En el VPS, un volumen persistente.
UPLOADS_DIR=
```

- [ ] **Step 5: Correr el test**

Run: `npx vitest run tests/lib/adjuntos.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/limites.ts src/lib/adjuntos.ts .env.example tests/lib/adjuntos.test.ts tests/helpers/presupuestos.ts
git commit -m "feat: adjuntos PDF en disco"
```

---

### Task 8: Cotizaciones — ABM, aprobación y listado con totales (TDD)

**Files:**
- Create: `src/lib/cotizaciones.ts`
- Modify: `tests/helpers/presupuestos.ts`
- Test: `tests/lib/cotizaciones.test.ts`

- [ ] **Step 1: Completar el helper de tests**

Agregar a `tests/helpers/presupuestos.ts`:

```ts
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { rubro } from "@/db/schema";
import { crearCotizacion, nuevaCotizacionSchema } from "@/lib/cotizaciones";
import { crearProveedor, proveedorSchema } from "@/lib/proveedores";

/** Id de un rubro cargado por la migración de seed (todos son de 2 días). */
export async function idRubro(db: Db, nombre = "Sonido"): Promise<string> {
  const [fila] = await db.select({ id: rubro.id }).from(rubro).where(eq(rubro.nombre, nombre));
  return fila.id;
}

export function nuevoProveedor(db: Db, nombre = "Sonido Andino"): Promise<string> {
  return crearProveedor(db, proveedorSchema.parse({ nombre }));
}

/** Datos de formulario de una cotización: 1000 BOB por día, 10 % de descuento por 2 días. */
export const COTIZACION = { descripcion: "Equipo completo", moneda: "BOB", precioDia: "1000", descuento2Dias: "10" };

export function nuevaCotizacion(
  db: Db,
  rubroId: string,
  proveedorId: string,
  extra: Partial<typeof COTIZACION> = {},
): Promise<string> {
  return crearCotizacion(db, nuevaCotizacionSchema.parse({ ...COTIZACION, rubroId, proveedorId, ...extra }), null);
}
```

(Juntar los imports nuevos con los que ya están arriba del archivo.)

- [ ] **Step 2: Escribir el test que falla**

`tests/lib/cotizaciones.test.ts`:

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { esViolacionUnica } from "@/db/errores";
import { cotizacion } from "@/db/schema";
import { guardarPdf } from "@/lib/adjuntos";
import {
  aprobarCotizacion,
  borrarCotizacion,
  cotizacionSchema,
  editarCotizacion,
  idMasBarata,
  listarCotizaciones,
  obtenerCotizacion,
  revertirAprobacion,
  type CotizacionListada,
} from "@/lib/cotizaciones";
import { borrarProveedor } from "@/lib/proveedores";
import { borrarRubro } from "@/lib/rubros";
import { guardarTipoCambio } from "@/lib/tipos-cambio";
import { crearDbPrueba } from "../helpers/db";
import { COTIZACION, idRubro, nuevaCotizacion, nuevoProveedor, pdf, usarUploadsTemporal } from "../helpers/presupuestos";

const estado = async (db: Db, id: string) => (await obtenerCotizacion(db, id))?.estado;

describe("cotizacionSchema", () => {
  const base = { ...COTIZACION, proveedorId: "p1" };
  const error = (extra: Record<string, string>) =>
    cotizacionSchema.safeParse({ ...base, ...extra }).error?.issues[0].message;

  it("descuento vacío es 0 y acepta coma decimal", () => {
    expect(cotizacionSchema.parse({ ...base, descuento2Dias: "", precioDia: "1500,5" })).toMatchObject({
      descuento2Dias: "0",
      precioDia: "1500.5",
    });
  });

  it("rechaza precio 0, descuento > 100 y moneda desconocida", () => {
    expect(error({ precioDia: "0" })).toBe("El precio debe ser mayor a 0");
    expect(error({ descuento2Dias: "150" })).toBe("El descuento debe estar entre 0 y 100");
    expect(error({ moneda: "EUR" })).toBe("Moneda inválida");
    expect(error({ proveedorId: "" })).toBe("Elegí un proveedor");
  });
});

describe("con DB", () => {
  let db: Db;
  let sonido: string;
  let luces: string;
  let proveedor: string;

  beforeEach(async () => {
    usarUploadsTemporal();
    db = await crearDbPrueba();
    sonido = await idRubro(db, "Sonido");
    luces = await idRubro(db, "Luces");
    proveedor = await nuevoProveedor(db);
  });

  describe("listarCotizaciones", () => {
    it("calcula totales con los días del rubro", async () => {
      await nuevaCotizacion(db, sonido, proveedor);
      const [c] = await listarCotizaciones(db, { rubroId: sonido });
      expect(c).toMatchObject({
        rubro: "Sonido",
        proveedor: "Sonido Andino",
        estado: "pendiente",
        precioDia: 1000,
        descuento2Dias: 10,
        total: 1800,
        ahorro: 200,
        totalBob: 1800,
      });
    });

    it("totalBob es null si falta el tipo de cambio", async () => {
      await nuevaCotizacion(db, sonido, proveedor, { moneda: "USD", precioDia: "100", descuento2Dias: "0" });
      expect((await listarCotizaciones(db))[0].totalBob).toBeNull();

      await guardarTipoCambio(db, { moneda: "USD", valorBob: "6.96" }, null);
      expect((await listarCotizaciones(db))[0]).toMatchObject({ total: 200, totalBob: 1392 });
    });

    it("filtra por rubro, proveedor y estado", async () => {
      const otro = await nuevoProveedor(db, "Luz Total");
      await nuevaCotizacion(db, sonido, proveedor);
      await nuevaCotizacion(db, luces, otro);
      expect(await listarCotizaciones(db, { rubroId: luces })).toHaveLength(1);
      expect(await listarCotizaciones(db, { proveedorId: proveedor })).toHaveLength(1);
      expect(await listarCotizaciones(db, { estado: "aprobada" })).toHaveLength(0);
      expect(await listarCotizaciones(db)).toHaveLength(2);
    });
  });

  describe("aprobarCotizacion", () => {
    it("aprueba una y descarta las demás del rubro, sin tocar otros rubros", async () => {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      const b = await nuevaCotizacion(db, sonido, proveedor);
      const otroRubro = await nuevaCotizacion(db, luces, proveedor);

      await aprobarCotizacion(db, a);
      expect(await estado(db, a)).toBe("aprobada");
      expect(await estado(db, b)).toBe("descartada");
      expect(await estado(db, otroRubro)).toBe("pendiente");

      await aprobarCotizacion(db, b);
      expect(await estado(db, a)).toBe("descartada");
      expect(await estado(db, b)).toBe("aprobada");
    });

    it("falla si la cotización no existe", async () => {
      await expect(aprobarCotizacion(db, "no-existe")).rejects.toThrow("La cotización no existe");
    });

    it("la DB impide dos aprobadas en el mismo rubro", async () => {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      const b = await nuevaCotizacion(db, sonido, proveedor);
      await aprobarCotizacion(db, a);
      const error = await db
        .update(cotizacion)
        .set({ estado: "aprobada" })
        .where(eq(cotizacion.id, b))
        .catch((e: unknown) => e);
      expect(esViolacionUnica(error)).toBe(true);
    });
  });

  describe("revertirAprobacion", () => {
    it("vuelve a pendiente; las descartadas quedan descartadas", async () => {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      const b = await nuevaCotizacion(db, sonido, proveedor);
      await aprobarCotizacion(db, a);
      await revertirAprobacion(db, a);
      expect(await estado(db, a)).toBe("pendiente");
      expect(await estado(db, b)).toBe("descartada");
    });

    it("falla si no está aprobada", async () => {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      await expect(revertirAprobacion(db, a)).rejects.toThrow("La cotización no está aprobada");
    });
  });

  describe("editarCotizacion", () => {
    const cambios = { ...COTIZACION, precioDia: "500", descuento2Dias: "0", moneda: "BOB" as const };

    it("cambia los datos y conserva el adjunto si no se indica otro", async () => {
      const nombre = await guardarPdf(pdf());
      const a = await nuevaCotizacion(db, sonido, proveedor);
      await editarCotizacion(db, a, { ...cambios, proveedorId: proveedor }, nombre);
      await editarCotizacion(db, a, { ...cambios, proveedorId: proveedor });
      expect(await obtenerCotizacion(db, a)).toMatchObject({ precioDia: "500.00", adjunto: nombre });
    });

    it("al reemplazar o quitar el adjunto borra el archivo anterior", async () => {
      const viejo = await guardarPdf(pdf());
      const nuevo = await guardarPdf(pdf());
      const a = await nuevaCotizacion(db, sonido, proveedor);
      await editarCotizacion(db, a, { ...cambios, proveedorId: proveedor }, viejo);
      await editarCotizacion(db, a, { ...cambios, proveedorId: proveedor }, nuevo);
      expect(existsSync(path.join(process.env.UPLOADS_DIR!, viejo))).toBe(false);

      await editarCotizacion(db, a, { ...cambios, proveedorId: proveedor }, null);
      expect((await obtenerCotizacion(db, a))?.adjunto).toBeNull();
      expect(existsSync(path.join(process.env.UPLOADS_DIR!, nuevo))).toBe(false);
    });

    it("falla si no existe", async () => {
      await expect(editarCotizacion(db, "no-existe", { ...cambios, proveedorId: proveedor })).rejects.toThrow(
        "La cotización no existe",
      );
    });
  });

  describe("borrarCotizacion", () => {
    it("borra la fila y su PDF", async () => {
      const nombre = await guardarPdf(pdf());
      const a = await nuevaCotizacion(db, sonido, proveedor);
      await editarCotizacion(db, a, { ...COTIZACION, moneda: "BOB", proveedorId: proveedor }, nombre);
      await borrarCotizacion(db, a);
      expect(await obtenerCotizacion(db, a)).toBeUndefined();
      expect(existsSync(path.join(process.env.UPLOADS_DIR!, nombre))).toBe(false);
      await expect(borrarCotizacion(db, a)).rejects.toThrow("La cotización no existe");
    });
  });

  it("no se puede borrar un rubro ni un proveedor con cotizaciones", async () => {
    await nuevaCotizacion(db, sonido, proveedor);
    await expect(borrarRubro(db, sonido)).rejects.toThrow("El rubro tiene cotizaciones: borralas primero");
    await expect(borrarProveedor(db, proveedor)).rejects.toThrow("El proveedor tiene cotizaciones: borralas primero");
  });
});

describe("idMasBarata", () => {
  const c = (id: string, totalBob: number | null, estado: CotizacionListada["estado"] = "pendiente") =>
    ({ id, totalBob, estado }) as CotizacionListada;

  it("la de menor total en BOB, ignorando descartadas y sin tipo de cambio", () => {
    expect(idMasBarata([c("a", 500), c("b", 300, "descartada"), c("c", null), c("d", 400)])).toBe("d");
  });

  it("null si no hay candidatas", () => {
    expect(idMasBarata([c("a", null)])).toBeNull();
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run tests/lib/cotizaciones.test.ts`
Expected: FAIL — no existe `@/lib/cotizaciones`.

- [ ] **Step 4: Implementar**

`src/lib/cotizaciones.ts`:

```ts
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { cotizacion, proveedor, rubro } from "@/db/schema";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";
import { borrarPdf } from "@/lib/adjuntos";
import { aBob, ahorroCotizacion, MONEDAS, totalCotizacion, type Moneda } from "@/lib/money";
import { obtenerTiposCambio } from "@/lib/tipos-cambio";
import { decimal } from "@/lib/validacion";

export const ESTADOS = ["pendiente", "aprobada", "descartada"] as const;
export type Estado = (typeof ESTADOS)[number];

/** Campos editables. El rubro se elige al crear y no cambia. */
export const cotizacionSchema = z.object({
  proveedorId: z.string("Elegí un proveedor").min(1, "Elegí un proveedor"),
  descripcion: z
    .string("Falta la descripción")
    .trim()
    .min(2, "La descripción es muy corta")
    .max(2000, "La descripción es muy larga"),
  moneda: z.enum(MONEDAS, "Moneda inválida"),
  precioDia: decimal("Precio inválido: usá solo números, ej. 1500.50", 2).refine(
    (valor) => Number(valor) > 0,
    "El precio debe ser mayor a 0",
  ),
  descuento2Dias: z
    .preprocess((valor) => (valor === undefined || valor === "" ? "0" : valor), decimal("Descuento inválido", 2))
    .refine((valor) => Number(valor) <= 100, "El descuento debe estar entre 0 y 100"),
});

export const nuevaCotizacionSchema = cotizacionSchema.extend({
  rubroId: z.string("Rubro inválido").min(1, "Rubro inválido"),
});

export type DatosCotizacion = z.infer<typeof cotizacionSchema>;
export type NuevaCotizacion = z.infer<typeof nuevaCotizacionSchema>;

export async function crearCotizacion(
  db: Db,
  datos: NuevaCotizacion,
  creadoPor: string | null,
  adjunto: string | null = null,
): Promise<string> {
  const [fila] = await conRestricciones(
    () => db.insert(cotizacion).values({ ...datos, creadoPor, adjunto }).returning({ id: cotizacion.id }),
    { fk: "Rubro o proveedor inválido" },
  );
  return fila.id;
}

/**
 * `adjunto`: undefined = se conserva el actual; null = se quita; string = se reemplaza.
 * El archivo anterior se borra del disco después de actualizar la fila.
 */
export async function editarCotizacion(
  db: Db,
  id: string,
  datos: DatosCotizacion,
  adjunto?: string | null,
): Promise<void> {
  const [actual] = await db.select({ adjunto: cotizacion.adjunto }).from(cotizacion).where(eq(cotizacion.id, id));
  if (!actual) throw new ErrorNegocio("La cotización no existe");

  const cambios = adjunto === undefined ? datos : { ...datos, adjunto };
  await conRestricciones(() => db.update(cotizacion).set(cambios).where(eq(cotizacion.id, id)), {
    fk: "Proveedor inválido",
  });
  if (adjunto !== undefined && actual.adjunto !== adjunto) await borrarPdf(actual.adjunto);
}

/** Aprueba y pasa a descartada el resto de las cotizaciones del rubro, en una transacción. */
export async function aprobarCotizacion(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [fila] = await tx
      .select({ rubroId: cotizacion.rubroId })
      .from(cotizacion)
      .where(eq(cotizacion.id, id))
      .for("update");
    if (!fila) throw new ErrorNegocio("La cotización no existe");

    // Primero se descartan las demás para no chocar con el índice de una aprobada por rubro.
    await tx
      .update(cotizacion)
      .set({ estado: "descartada" })
      .where(and(eq(cotizacion.rubroId, fila.rubroId), ne(cotizacion.id, id)));
    await tx.update(cotizacion).set({ estado: "aprobada" }).where(eq(cotizacion.id, id));
  });
}

export async function revertirAprobacion(db: Db, id: string): Promise<void> {
  const filas = await db
    .update(cotizacion)
    .set({ estado: "pendiente" })
    .where(and(eq(cotizacion.id, id), eq(cotizacion.estado, "aprobada")))
    .returning({ id: cotizacion.id });
  if (filas.length === 0) throw new ErrorNegocio("La cotización no está aprobada");
}

export async function borrarCotizacion(db: Db, id: string): Promise<void> {
  const [fila] = await db.delete(cotizacion).where(eq(cotizacion.id, id)).returning({ adjunto: cotizacion.adjunto });
  if (!fila) throw new ErrorNegocio("La cotización no existe");
  await borrarPdf(fila.adjunto);
}

/** Fila cruda, para precargar el formulario de edición. */
export async function obtenerCotizacion(db: Db, id: string) {
  const [fila] = await db.select().from(cotizacion).where(eq(cotizacion.id, id));
  return fila;
}

export type FiltroCotizaciones = { rubroId?: string; proveedorId?: string; estado?: Estado };

/** Cotizaciones con rubro, proveedor y totales calculados (en su moneda y en BOB). */
export async function listarCotizaciones(db: Db, filtro: FiltroCotizaciones = {}) {
  const [filas, tipos] = await Promise.all([
    db
      .select({
        id: cotizacion.id,
        rubroId: cotizacion.rubroId,
        rubro: rubro.nombre,
        dias: rubro.dias,
        proveedorId: cotizacion.proveedorId,
        proveedor: proveedor.nombre,
        descripcion: cotizacion.descripcion,
        moneda: cotizacion.moneda,
        precioDia: cotizacion.precioDia,
        descuento2Dias: cotizacion.descuento2Dias,
        adjunto: cotizacion.adjunto,
        estado: cotizacion.estado,
        createdAt: cotizacion.createdAt,
      })
      .from(cotizacion)
      .innerJoin(rubro, eq(cotizacion.rubroId, rubro.id))
      .innerJoin(proveedor, eq(cotizacion.proveedorId, proveedor.id))
      .where(
        and(
          filtro.rubroId ? eq(cotizacion.rubroId, filtro.rubroId) : undefined,
          filtro.proveedorId ? eq(cotizacion.proveedorId, filtro.proveedorId) : undefined,
          filtro.estado ? eq(cotizacion.estado, filtro.estado) : undefined,
        ),
      )
      .orderBy(asc(cotizacion.createdAt)),
    obtenerTiposCambio(db),
  ]);

  return filas.map((fila) => {
    const precio = { precioDia: Number(fila.precioDia), descuento2Dias: Number(fila.descuento2Dias), dias: fila.dias };
    const moneda = fila.moneda as Moneda;
    const total = totalCotizacion(precio);
    return {
      ...fila,
      ...precio,
      moneda,
      estado: fila.estado as Estado,
      total,
      ahorro: ahorroCotizacion(precio),
      totalBob: aBob(total, moneda, tipos),
    };
  });
}

export type CotizacionListada = Awaited<ReturnType<typeof listarCotizaciones>>[number];

/** La más barata en BOB entre las no descartadas con tipo de cambio conocido. */
export function idMasBarata(cotizaciones: CotizacionListada[]): string | null {
  let mejor: CotizacionListada | null = null;
  for (const c of cotizaciones) {
    if (c.estado === "descartada" || c.totalBob === null) continue;
    if (!mejor || c.totalBob < mejor.totalBob!) mejor = c;
  }
  return mejor?.id ?? null;
}
```

- [ ] **Step 5: Correr el test y la suite**

Run: `npx vitest run tests/lib/cotizaciones.test.ts && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cotizaciones.ts tests/lib/cotizaciones.test.ts tests/helpers/presupuestos.ts
git commit -m "feat: cotizaciones con aprobación única por rubro y totales"
```

---

### Task 9: Resumen por área y total del evento (TDD)

**Files:**
- Create: `src/lib/resumen.ts`
- Test: `tests/lib/resumen.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/lib/resumen.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { aprobarCotizacion } from "@/lib/cotizaciones";
import { resumenPresupuesto } from "@/lib/resumen";
import { crearDbPrueba } from "../helpers/db";
import { idRubro, nuevaCotizacion, nuevoProveedor } from "../helpers/presupuestos";

let db: Db;
let proveedor: string;
beforeEach(async () => {
  db = await crearDbPrueba();
  proveedor = await nuevoProveedor(db);
});

const rubroDe = (resumen: Awaited<ReturnType<typeof resumenPresupuesto>>, nombre: string) =>
  resumen.areas.flatMap((a) => a.rubros).find((r) => r.nombre === nombre)!;

describe("resumenPresupuesto", () => {
  it("sin cotizaciones: las 6 áreas, nada aprobado y total 0", async () => {
    const resumen = await resumenPresupuesto(db);
    expect(resumen.areas).toHaveLength(6);
    expect(resumen.areas[1].rubros).toHaveLength(5);
    expect(resumen.areas[0].rubros).toHaveLength(0);
    expect(rubroDe(resumen, "Sonido")).toMatchObject({ cotizaciones: 0, aprobada: null });
    expect(resumen.total).toEqual({ bob: 0, faltan: [] });
  });

  it("cuenta cotizaciones, muestra la aprobada y suma solo aprobadas", async () => {
    const sonido = await idRubro(db, "Sonido");
    const a = await nuevaCotizacion(db, sonido, proveedor);
    await nuevaCotizacion(db, sonido, proveedor);
    await nuevaCotizacion(db, await idRubro(db, "Luces"), proveedor);
    await aprobarCotizacion(db, a);

    const resumen = await resumenPresupuesto(db);
    expect(rubroDe(resumen, "Sonido").cotizaciones).toBe(2);
    expect(rubroDe(resumen, "Sonido").aprobada).toMatchObject({ id: a, total: 1800, proveedor: "Sonido Andino" });
    expect(rubroDe(resumen, "Luces").aprobada).toBeNull();
    expect(resumen.total).toEqual({ bob: 1800, faltan: [] });
  });

  it("si una aprobada no tiene tipo de cambio, el total avisa", async () => {
    const a = await nuevaCotizacion(db, await idRubro(db, "Sonido"), proveedor, { moneda: "USD" });
    await aprobarCotizacion(db, a);
    expect((await resumenPresupuesto(db)).total).toEqual({ bob: null, faltan: ["USD"] });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/lib/resumen.test.ts`
Expected: FAIL — no existe `@/lib/resumen`.

- [ ] **Step 3: Implementar**

`src/lib/resumen.ts`:

```ts
import type { Db } from "@/db/client";
import { listarCotizaciones, type CotizacionListada } from "@/lib/cotizaciones";
import { totalEvento } from "@/lib/money";
import { listarAreas, listarRubros } from "@/lib/rubros";
import { obtenerTiposCambio } from "@/lib/tipos-cambio";

/** Rubros agrupados por área con su cotización aprobada, y el total aprobado del evento. */
export async function resumenPresupuesto(db: Db) {
  const [areas, rubros, cotizaciones, tipos] = await Promise.all([
    listarAreas(db),
    listarRubros(db),
    listarCotizaciones(db),
    obtenerTiposCambio(db),
  ]);

  const cantidad = new Map<string, number>();
  const aprobadas = new Map<string, CotizacionListada>();
  for (const c of cotizaciones) {
    cantidad.set(c.rubroId, (cantidad.get(c.rubroId) ?? 0) + 1);
    if (c.estado === "aprobada") aprobadas.set(c.rubroId, c);
  }

  const filas = rubros.map((r) => ({
    ...r,
    cotizaciones: cantidad.get(r.id) ?? 0,
    aprobada: aprobadas.get(r.id) ?? null,
  }));

  return {
    areas: areas.map((a) => ({ ...a, rubros: filas.filter((r) => r.areaId === a.id) })),
    total: totalEvento(
      [...aprobadas.values()].map((c) => ({ monto: c.total, moneda: c.moneda })),
      tipos,
    ),
    tipos,
  };
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run tests/lib/resumen.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/resumen.ts tests/lib/resumen.test.ts
git commit -m "feat: resumen de presupuesto por área y total del evento"
```

---

### Task 10: Base de UI — `ejecutar`, `FormAccion`, campos, navegación y límite de subida

**Files:**
- Create: `src/app/(app)/ejecutar.ts`, `src/components/form-accion.tsx`, `src/components/campos.tsx`, `src/components/total-evento.tsx`
- Modify: `src/app/(app)/configuracion/usuarios/actions.ts`, `src/app/(app)/nav.tsx`, `next.config.ts`

- [ ] **Step 1: Helper compartido de server actions**

`src/app/(app)/ejecutar.ts`:

```ts
import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import type { Db } from "@/db/client";
import type { Resultado } from "@/lib/acciones";
import type { Actor } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";

/** Lógica de una server action, sin Next: se testea con una DB de prueba. */
export type Operacion = (db: Db, actor: Actor, datos: unknown) => Promise<Resultado>;

/** Corre la operación con el usuario logueado y los datos del formulario. */
export async function ejecutar(operacion: Operacion, formData: FormData): Promise<Resultado> {
  const resultado = await operacion(db, await usuarioActual(), Object.fromEntries(formData));
  // App chica: se revalida todo para que ninguna pantalla quede con datos viejos.
  if (resultado.ok) revalidatePath("/", "layout");
  return resultado;
}
```

- [ ] **Step 2: Usarlo en las acciones de usuarios**

`src/app/(app)/configuracion/usuarios/actions.ts` completo:

```ts
"use server";

import type { Resultado } from "@/lib/acciones";
import { ejecutar } from "../../ejecutar";
import { altaUsuario, bajaUsuario, cambioDeRol } from "./operaciones";

export async function crearUsuarioAction(_previo: Resultado | null, formData: FormData) {
  return ejecutar(altaUsuario, formData);
}

export async function cambiarRolAction(_previo: Resultado | null, formData: FormData) {
  return ejecutar(cambioDeRol, formData);
}

export async function borrarUsuarioAction(_previo: Resultado | null, formData: FormData) {
  return ejecutar(bajaUsuario, formData);
}
```

- [ ] **Step 3: Componentes de formulario**

`src/components/campos.tsx`:

```tsx
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Campo({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn("h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn("min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm", className)}
      {...props}
    />
  );
}
```

`src/components/form-accion.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { Resultado } from "@/lib/acciones";
import { MAX_ADJUNTO } from "@/lib/limites";

export type AccionFormulario = (formData: FormData) => Promise<Resultado>;

function Mensaje({ estado, exito }: { estado: Resultado | null; exito?: string }) {
  if (estado?.ok === false) return <p className="text-sm text-destructive">{estado.error}</p>;
  if (estado?.ok && exito) return <p className="text-sm text-green-600">{exito}</p>;
  return null;
}

/**
 * Envía el formulario a la server action con una transición. No usa `<form action>`
 * porque React 19 resetea los campos tras la acción aunque falle.
 */
function useAccion(accion: AccionFormulario, redirigir?: string) {
  const router = useRouter();
  const [estado, setEstado] = useState<Resultado | null>(null);
  const [pendiente, startTransition] = useTransition();

  function enviar(form: HTMLFormElement, alTerminar?: (resultado: Resultado) => void) {
    const datos = new FormData(form);
    const pesado = [...datos.values()].some((v) => v instanceof File && v.size > MAX_ADJUNTO);
    if (pesado) {
      setEstado({ ok: false, error: "El adjunto supera los 10 MB" });
      return;
    }
    startTransition(async () => {
      const resultado = await accion(datos);
      setEstado(resultado);
      alTerminar?.(resultado);
      if (resultado.ok && redirigir) router.push(redirigir);
    });
  }

  return { estado, pendiente, enviar };
}

export function FormAccion({
  accion,
  enviar: textoEnviar,
  enviando,
  exito,
  limpiar = false,
  redirigir,
  className,
  children,
}: {
  accion: AccionFormulario;
  enviar: string;
  enviando: string;
  exito?: string;
  /** Vacía el formulario si sale bien (formularios de alta). */
  limpiar?: boolean;
  /** Ruta a la que navegar si sale bien. */
  redirigir?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { estado, pendiente, enviar } = useAccion(accion, redirigir);

  function onSubmit(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    enviar(form, (resultado) => {
      if (resultado.ok && limpiar) form.reset();
    });
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? enviando : textoEnviar}
        </Button>
        <Mensaje estado={estado} exito={exito} />
      </div>
    </form>
  );
}

/** Un botón que manda `campos` ocultos. Con `confirmar`, pide "¿Seguro?" inline antes de enviar. */
export function BotonAccion({
  accion,
  campos,
  texto,
  enviando,
  confirmar = false,
  redirigir,
  variant = "outline",
}: {
  accion: AccionFormulario;
  campos: Record<string, string>;
  texto: string;
  enviando: string;
  confirmar?: boolean;
  redirigir?: string;
  variant?: "default" | "outline" | "ghost" | "destructive";
}) {
  const { estado, pendiente, enviar } = useAccion(accion, redirigir);
  const [confirmando, setConfirmando] = useState(false);

  function onSubmit(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    enviar(evento.currentTarget, () => setConfirmando(false));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center justify-end gap-2">
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      <Mensaje estado={estado} />
      {confirmar && !confirmando ? (
        <Button type="button" variant={variant} size="sm" onClick={() => setConfirmando(true)}>
          {texto}
        </Button>
      ) : (
        <>
          {confirmando && <span className="text-sm">¿Seguro?</span>}
          <Button type="submit" variant={variant} size="sm" disabled={pendiente}>
            {pendiente ? enviando : confirmando ? "Sí" : texto}
          </Button>
          {confirmando && (
            <Button type="button" variant="ghost" size="sm" disabled={pendiente} onClick={() => setConfirmando(false)}>
              No
            </Button>
          )}
        </>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Tarjeta de total del evento**

`src/components/total-evento.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { desdeBob, formatearMonto, MONEDAS, type TiposCambio, type TotalBob } from "@/lib/money";

export function TotalEventoCard({ total, tipos }: { total: TotalBob; tipos: TiposCambio }) {
  const bob = total.bob;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Total aprobado del evento</CardTitle>
      </CardHeader>
      <CardContent>
        {bob === null ? (
          <p className="text-sm text-destructive">
            Falta el tipo de cambio de {total.faltan.join(", ")}. Un admin lo carga en Configuración → Tipos de
            cambio.
          </p>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-3">
            {MONEDAS.map((moneda) => {
              const monto = desdeBob(bob, moneda, tipos);
              return (
                <div key={moneda}>
                  <dt className="text-sm text-muted-foreground">{moneda}</dt>
                  <dd className="text-xl font-semibold">
                    {monto === null ? "Sin tipo de cambio" : formatearMonto(monto, moneda)}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Navegación**

En `src/app/(app)/nav.tsx`, reemplazar `LINKS` y `LINKS_ADMIN`:

```tsx
const LINKS = [
  { href: "/", label: "Tablero" },
  { href: "/presupuestos", label: "Presupuestos" },
  { href: "/proveedores", label: "Proveedores" },
  { href: "/cuenta", label: "Mi cuenta" },
];

const LINKS_ADMIN = [
  { href: "/configuracion/usuarios", label: "Usuarios" },
  { href: "/configuracion/rubros", label: "Rubros" },
  { href: "/configuracion/tipos-cambio", label: "Tipos de cambio" },
];
```

- [ ] **Step 6: Límite de subida de las server actions**

En `next.config.ts`, agregar dentro de `nextConfig` (después de `serverExternalPackages`):

```ts
  // PDF de hasta 10 MB (src/lib/limites.ts) + margen para el multipart.
  experimental: {
    serverActions: { bodySizeLimit: "11mb" },
  },
```

- [ ] **Step 7: Verificar**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: todo en verde. (`tsc` puede quejarse de `PageProps`/`LayoutProps` si nunca se corrió `next dev`/`next build`; en ese caso correr `npx next typegen` antes.)

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/ejecutar.ts" "src/app/(app)/configuracion/usuarios/actions.ts" "src/app/(app)/nav.tsx" src/components/campos.tsx src/components/form-accion.tsx src/components/total-evento.tsx next.config.ts
git commit -m "feat: base de UI para formularios con server actions y navegación"
```

---

### Task 11: Configuración — rubros y tipos de cambio (admin)

**Files:**
- Create: `src/app/(app)/configuracion/rubros/{operaciones.ts,actions.ts,rubro-campos.tsx,page.tsx}`
- Create: `src/app/(app)/configuracion/tipos-cambio/{operaciones.ts,actions.ts,page.tsx}`
- Create: `tests/helpers/actores.ts`
- Test: `tests/configuracion/operaciones.test.ts`

- [ ] **Step 1: Helper de actores para tests**

`tests/helpers/actores.ts`:

```ts
import type { Db } from "@/db/client";
import type { Actor } from "@/lib/permissions";
import { crearUsuario, nuevoUsuarioSchema } from "@/lib/users";

export const SIN_PERMISO = { ok: false, error: "No tenés permiso para hacer esto" };

/** Un admin y un editor reales (las FK de creado_por / actualizado_por apuntan a user). */
export async function crearActores(db: Db): Promise<{ admin: Actor; editor: Actor }> {
  const alta = (email: string, rol: string) =>
    crearUsuario(db, nuevoUsuarioSchema.parse({ nombre: email, email, password: "secreto123", rol }));
  return {
    admin: { id: await alta("admin@vibra.bo", "admin"), role: "admin" },
    editor: { id: await alta("editor@vibra.bo", "editor"), role: "editor" },
  };
}
```

- [ ] **Step 2: Escribir el test que falla**

`tests/configuracion/operaciones.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { altaRubro, bajaRubro, edicionRubro } from "@/app/(app)/configuracion/rubros/operaciones";
import { actualizacionTipoCambio } from "@/app/(app)/configuracion/tipos-cambio/operaciones";
import type { Db } from "@/db/client";
import type { Actor } from "@/lib/permissions";
import { listarRubros, obtenerRubro } from "@/lib/rubros";
import { listarTiposCambio, obtenerTiposCambio } from "@/lib/tipos-cambio";
import { crearActores, SIN_PERMISO } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { idRubro } from "../helpers/presupuestos";

const RUBRO = { nombre: "Catering", areaId: "3", dias: "1" };

let db: Db;
let admin: Actor;
let editor: Actor;
beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
});

describe("rubros", () => {
  it("el editor no puede crear, editar ni borrar", async () => {
    const sonido = await idRubro(db);
    expect(await altaRubro(db, editor, RUBRO)).toEqual(SIN_PERMISO);
    expect(await edicionRubro(db, editor, { ...RUBRO, rubroId: sonido })).toEqual(SIN_PERMISO);
    expect(await bajaRubro(db, editor, { rubroId: sonido })).toEqual(SIN_PERMISO);
    expect(await listarRubros(db)).toHaveLength(7);
  });

  it("el admin crea, edita y borra", async () => {
    expect(await altaRubro(db, admin, RUBRO)).toEqual({ ok: true });
    const id = await idRubro(db, "Catering");
    expect(await edicionRubro(db, admin, { ...RUBRO, dias: "2", rubroId: id })).toEqual({ ok: true });
    expect((await obtenerRubro(db, id))?.dias).toBe(2);
    expect(await bajaRubro(db, admin, { rubroId: id })).toEqual({ ok: true });
  });

  it("errores de validación vuelven como Resultado", async () => {
    expect(await altaRubro(db, admin, { ...RUBRO, dias: "5" })).toEqual({
      ok: false,
      error: "Los días deben ser 1 o 2",
    });
    expect(await bajaRubro(db, admin, {})).toEqual({ ok: false, error: "Rubro inválido" });
  });
});

describe("tipos de cambio", () => {
  it("el editor no puede actualizar", async () => {
    expect(await actualizacionTipoCambio(db, editor, { moneda: "USD", valorBob: "6.96" })).toEqual(SIN_PERMISO);
    expect(await obtenerTiposCambio(db)).toEqual({});
  });

  it("el admin actualiza y queda registrado quién", async () => {
    expect(await actualizacionTipoCambio(db, admin, { moneda: "USD", valorBob: "6,96" })).toEqual({ ok: true });
    expect(await obtenerTiposCambio(db)).toEqual({ USD: 6.96 });
    expect((await listarTiposCambio(db))[0].actualizadoPor).toBe("admin@vibra.bo");
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run tests/configuracion/operaciones.test.ts`
Expected: FAIL — no existen los módulos de operaciones.

- [ ] **Step 4: Operaciones y acciones**

`src/app/(app)/configuracion/rubros/operaciones.ts`:

```ts
import { z } from "zod";
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { exigir, type Actor } from "@/lib/permissions";
import { borrarRubro, crearRubro, editarRubro, rubroSchema } from "@/lib/rubros";

const rubroId = z.string("Rubro inválido").min(1, "Rubro inválido");

export function altaRubro(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    await crearRubro(db, validar(rubroSchema, datos));
  });
}

export function edicionRubro(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { rubroId: id, ...valores } = validar(rubroSchema.extend({ rubroId }), datos);
    await editarRubro(db, id, valores);
  });
}

export function bajaRubro(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { rubroId: id } = validar(z.object({ rubroId }), datos);
    await borrarRubro(db, id);
  });
}
```

`src/app/(app)/configuracion/rubros/actions.ts`:

```ts
"use server";

import { ejecutar } from "../../ejecutar";
import { altaRubro, bajaRubro, edicionRubro } from "./operaciones";

export async function crearRubroAction(formData: FormData) {
  return ejecutar(altaRubro, formData);
}

export async function editarRubroAction(formData: FormData) {
  return ejecutar(edicionRubro, formData);
}

export async function borrarRubroAction(formData: FormData) {
  return ejecutar(bajaRubro, formData);
}
```

`src/app/(app)/configuracion/tipos-cambio/operaciones.ts`:

```ts
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { exigir, type Actor } from "@/lib/permissions";
import { guardarTipoCambio, tipoCambioSchema } from "@/lib/tipos-cambio";

export function actualizacionTipoCambio(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    await guardarTipoCambio(db, validar(tipoCambioSchema, datos), actor.id);
  });
}
```

`src/app/(app)/configuracion/tipos-cambio/actions.ts`:

```ts
"use server";

import { ejecutar } from "../../ejecutar";
import { actualizacionTipoCambio } from "./operaciones";

export async function guardarTipoCambioAction(formData: FormData) {
  return ejecutar(actualizacionTipoCambio, formData);
}
```

- [ ] **Step 5: Correr el test**

Run: `npx vitest run tests/configuracion/operaciones.test.ts`
Expected: PASS.

- [ ] **Step 6: Pantalla de rubros**

`src/app/(app)/configuracion/rubros/rubro-campos.tsx`:

```tsx
import { Campo, Select } from "@/components/campos";
import { Input } from "@/components/ui/input";

type Area = { id: number; nombre: string };
type Valores = { nombre: string; areaId: number; dias: number };

/** `prefijo` hace únicos los ids cuando hay un formulario por fila. */
export function RubroCampos({ areas, valores, prefijo }: { areas: Area[]; valores?: Valores; prefijo: string }) {
  return (
    <div className="grid flex-1 gap-4 sm:grid-cols-3">
      <Campo id={`${prefijo}-nombre`} label="Nombre">
        <Input id={`${prefijo}-nombre`} name="nombre" defaultValue={valores?.nombre} required />
      </Campo>
      <Campo id={`${prefijo}-area`} label="Área">
        <Select id={`${prefijo}-area`} name="areaId" defaultValue={valores?.areaId ?? ""} required>
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
      <Campo id={`${prefijo}-dias`} label="Días a contratar">
        <Select id={`${prefijo}-dias`} name="dias" defaultValue={valores?.dias ?? 2}>
          <option value="1">1 día</option>
          <option value="2">2 días</option>
        </Select>
      </Campo>
    </div>
  );
}
```

`src/app/(app)/configuracion/rubros/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { BotonAccion, FormAccion } from "@/components/form-accion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { can } from "@/lib/permissions";
import { listarAreas, listarRubros } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import { borrarRubroAction, crearRubroAction, editarRubroAction } from "./actions";
import { RubroCampos } from "./rubro-campos";

export default async function RubrosPage() {
  const yo = await usuarioActual();
  if (!can(yo.role, "configurar")) notFound();

  const [areas, rubros] = await Promise.all([listarAreas(db), listarRubros(db)]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Rubros</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo rubro</CardTitle>
        </CardHeader>
        <CardContent>
          <FormAccion accion={crearRubroAction} enviar="Crear rubro" enviando="Creando…" limpiar className="space-y-4">
            <RubroCampos areas={areas} prefijo="nuevo" />
          </FormAccion>
        </CardContent>
      </Card>

      {areas.map((a) => {
        const delArea = rubros.filter((r) => r.areaId === a.id);
        if (delArea.length === 0) return null;
        return (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle>{a.nombre}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {delArea.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-end gap-4 py-4 first:pt-0 last:pb-0">
                    <FormAccion
                      accion={editarRubroAction}
                      enviar="Guardar"
                      enviando="Guardando…"
                      exito="Guardado"
                      className="flex flex-1 flex-wrap items-end gap-4"
                    >
                      <input type="hidden" name="rubroId" value={r.id} />
                      <RubroCampos areas={areas} valores={r} prefijo={r.id} />
                    </FormAccion>
                    <BotonAccion
                      accion={borrarRubroAction}
                      campos={{ rubroId: r.id }}
                      texto="Borrar"
                      enviando="Borrando…"
                      variant="ghost"
                      confirmar
                    />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 7: Pantalla de tipos de cambio**

`src/app/(app)/configuracion/tipos-cambio/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { Campo } from "@/components/campos";
import { FormAccion } from "@/components/form-accion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { MONEDAS_EXTRANJERAS } from "@/lib/money";
import { can } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";
import { listarTiposCambio } from "@/lib/tipos-cambio";
import { guardarTipoCambioAction } from "./actions";

const FECHA = new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short", timeZone: "America/La_Paz" });

export default async function TiposCambioPage() {
  const yo = await usuarioActual();
  if (!can(yo.role, "configurar")) notFound();

  const tipos = await listarTiposCambio(db);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tipos de cambio</h1>
        <p className="text-muted-foreground">Cuántos bolivianos vale cada moneda. Los totales se calculan en BOB.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {MONEDAS_EXTRANJERAS.map((moneda) => {
          const actual = tipos.find((t) => t.moneda === moneda);
          return (
            <Card key={moneda}>
              <CardHeader>
                <CardTitle>1 {moneda} en BOB</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <FormAccion
                  accion={guardarTipoCambioAction}
                  enviar="Guardar"
                  enviando="Guardando…"
                  exito="Guardado"
                  className="flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="moneda" value={moneda} />
                  <Campo id={`valor-${moneda}`} label="Valor en BOB">
                    <Input
                      id={`valor-${moneda}`}
                      name="valorBob"
                      inputMode="decimal"
                      defaultValue={actual ? String(Number(actual.valorBob)) : ""}
                      required
                    />
                  </Campo>
                </FormAccion>
                <p className="text-sm text-muted-foreground">
                  {actual
                    ? `Actualizado el ${FECHA.format(actual.updatedAt)}${actual.actualizadoPor ? ` por ${actual.actualizadoPor}` : ""}`
                    : "Todavía no se cargó"}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Verificar**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/configuracion/rubros" "src/app/(app)/configuracion/tipos-cambio" tests/helpers/actores.ts tests/configuracion
git commit -m "feat: configuración de rubros y tipos de cambio"
```

---

### Task 12: Proveedores — pantallas

**Files:**
- Create: `src/app/(app)/proveedores/{operaciones.ts,actions.ts,proveedor-campos.tsx,page.tsx}`
- Create: `src/app/(app)/proveedores/[proveedorId]/page.tsx`
- Create: `src/components/estado-cotizacion.tsx`
- Test: `tests/proveedores/operaciones.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/proveedores/operaciones.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { altaProveedor, bajaProveedor, edicionProveedor } from "@/app/(app)/proveedores/operaciones";
import type { Db } from "@/db/client";
import type { Actor } from "@/lib/permissions";
import { listarProveedores, obtenerProveedor } from "@/lib/proveedores";
import { crearActores, SIN_PERMISO } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { nuevoProveedor } from "../helpers/presupuestos";

let db: Db;
let admin: Actor;
let editor: Actor;
beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
});

describe("proveedores", () => {
  it("el editor crea y edita", async () => {
    expect(await altaProveedor(db, editor, { nombre: "Audio Total", email: "" })).toEqual({ ok: true });
    const [p] = await listarProveedores(db);
    expect(await edicionProveedor(db, editor, { proveedorId: p.id, nombre: "Audio Total SRL" })).toEqual({ ok: true });
    expect((await obtenerProveedor(db, p.id))?.nombre).toBe("Audio Total SRL");
  });

  it("el editor no puede borrar; el admin sí", async () => {
    const id = await nuevoProveedor(db);
    expect(await bajaProveedor(db, editor, { proveedorId: id })).toEqual(SIN_PERMISO);
    expect(await obtenerProveedor(db, id)).toBeDefined();
    expect(await bajaProveedor(db, admin, { proveedorId: id })).toEqual({ ok: true });
    expect(await obtenerProveedor(db, id)).toBeUndefined();
  });

  it("errores de validación vuelven como Resultado", async () => {
    expect(await altaProveedor(db, editor, { nombre: "X" })).toEqual({ ok: false, error: "El nombre es muy corto" });
    expect(await edicionProveedor(db, editor, { nombre: "Audio" })).toEqual({ ok: false, error: "Proveedor inválido" });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/proveedores/operaciones.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Operaciones y acciones**

`src/app/(app)/proveedores/operaciones.ts`:

```ts
import { z } from "zod";
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { exigir, type Actor } from "@/lib/permissions";
import { borrarProveedor, crearProveedor, editarProveedor, proveedorSchema } from "@/lib/proveedores";

const proveedorId = z.string("Proveedor inválido").min(1, "Proveedor inválido");

export function altaProveedor(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    await crearProveedor(db, validar(proveedorSchema, datos));
  });
}

export function edicionProveedor(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    const { proveedorId: id, ...valores } = validar(proveedorSchema.extend({ proveedorId }), datos);
    await editarProveedor(db, id, valores);
  });
}

export function bajaProveedor(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "borrar");
    const { proveedorId: id } = validar(z.object({ proveedorId }), datos);
    await borrarProveedor(db, id);
  });
}
```

`src/app/(app)/proveedores/actions.ts`:

```ts
"use server";

import { ejecutar } from "../ejecutar";
import { altaProveedor, bajaProveedor, edicionProveedor } from "./operaciones";

export async function crearProveedorAction(formData: FormData) {
  return ejecutar(altaProveedor, formData);
}

export async function editarProveedorAction(formData: FormData) {
  return ejecutar(edicionProveedor, formData);
}

export async function borrarProveedorAction(formData: FormData) {
  return ejecutar(bajaProveedor, formData);
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run tests/proveedores/operaciones.test.ts`
Expected: PASS.

- [ ] **Step 5: Componentes compartidos**

`src/components/estado-cotizacion.tsx` (lo usan proveedores y presupuestos):

```tsx
import { Badge } from "@/components/ui/badge";
import type { Estado } from "@/lib/cotizaciones";

const VARIANTE = { aprobada: "default", pendiente: "outline", descartada: "secondary" } as const;
const TEXTO: Record<Estado, string> = { aprobada: "Aprobada", pendiente: "Pendiente", descartada: "Descartada" };

export function EstadoCotizacion({ estado }: { estado: Estado }) {
  return <Badge variant={VARIANTE[estado]}>{TEXTO[estado]}</Badge>;
}
```

`src/app/(app)/proveedores/proveedor-campos.tsx`:

```tsx
import { Campo, Textarea } from "@/components/campos";
import { Input } from "@/components/ui/input";

type Valores = { nombre: string; contacto: string | null; telefono: string | null; email: string | null; notas: string | null };

export function ProveedorCampos({ valores }: { valores?: Valores }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo id="nombre" label="Nombre">
        <Input id="nombre" name="nombre" defaultValue={valores?.nombre} required />
      </Campo>
      <Campo id="contacto" label="Persona de contacto">
        <Input id="contacto" name="contacto" defaultValue={valores?.contacto ?? ""} />
      </Campo>
      <Campo id="telefono" label="Teléfono">
        <Input id="telefono" name="telefono" type="tel" defaultValue={valores?.telefono ?? ""} />
      </Campo>
      <Campo id="email" label="Email">
        <Input id="email" name="email" type="email" defaultValue={valores?.email ?? ""} />
      </Campo>
      <Campo id="notas" label="Notas" className="sm:col-span-2">
        <Textarea id="notas" name="notas" defaultValue={valores?.notas ?? ""} />
      </Campo>
    </div>
  );
}
```

- [ ] **Step 6: Lista con buscador y alta**

`src/app/(app)/proveedores/page.tsx`:

```tsx
import Form from "next/form";
import Link from "next/link";
import { FormAccion } from "@/components/form-accion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { listarProveedores } from "@/lib/proveedores";
import { usuarioActual } from "@/lib/session";
import { crearProveedorAction } from "./actions";
import { ProveedorCampos } from "./proveedor-campos";

export default async function ProveedoresPage({ searchParams }: PageProps<"/proveedores">) {
  await usuarioActual();
  const { q } = await searchParams;
  const busqueda = typeof q === "string" ? q.trim() : "";
  const proveedores = await listarProveedores(db, busqueda);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Proveedores</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <FormAccion
            accion={crearProveedorAction}
            enviar="Crear proveedor"
            enviando="Creando…"
            exito="Proveedor creado"
            limpiar
            className="space-y-4"
          >
            <ProveedorCampos />
          </FormAccion>
        </CardContent>
      </Card>

      <Form action="/proveedores" className="flex max-w-md gap-2" role="search">
        <Input name="q" defaultValue={busqueda} placeholder="Buscar por nombre o contacto" aria-label="Buscar" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </Form>

      {proveedores.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {busqueda ? "Ningún proveedor coincide con la búsqueda." : "Todavía no hay proveedores."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {proveedores.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/proveedores/${p.id}`} className="font-medium hover:underline">
                    {p.nombre}
                  </Link>
                </TableCell>
                <TableCell>{p.contacto}</TableCell>
                <TableCell>{p.telefono}</TableCell>
                <TableCell>{p.email}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Detalle / edición**

`src/app/(app)/proveedores/[proveedorId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoCotizacion } from "@/components/estado-cotizacion";
import { BotonAccion, FormAccion } from "@/components/form-accion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { listarCotizaciones } from "@/lib/cotizaciones";
import { formatearMonto } from "@/lib/money";
import { can } from "@/lib/permissions";
import { obtenerProveedor } from "@/lib/proveedores";
import { usuarioActual } from "@/lib/session";
import { borrarProveedorAction, editarProveedorAction } from "../actions";
import { ProveedorCampos } from "../proveedor-campos";

export default async function ProveedorPage({ params }: PageProps<"/proveedores/[proveedorId]">) {
  const usuario = await usuarioActual();
  const { proveedorId } = await params;
  const proveedor = await obtenerProveedor(db, proveedorId);
  if (!proveedor) notFound();
  const cotizaciones = await listarCotizaciones(db, { proveedorId });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/proveedores" className="text-sm text-muted-foreground hover:underline">
            ← Proveedores
          </Link>
          <h1 className="text-2xl font-semibold">{proveedor.nombre}</h1>
        </div>
        {can(usuario.role, "borrar") && (
          <BotonAccion
            accion={borrarProveedorAction}
            campos={{ proveedorId }}
            texto="Borrar proveedor"
            enviando="Borrando…"
            variant="destructive"
            redirigir="/proveedores"
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
            accion={editarProveedorAction}
            enviar="Guardar cambios"
            enviando="Guardando…"
            exito="Guardado"
            className="space-y-4"
          >
            <input type="hidden" name="proveedorId" value={proveedorId} />
            <ProveedorCampos valores={proveedor} />
          </FormAccion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cotizaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {cotizaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este proveedor todavía no tiene cotizaciones.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rubro</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cotizaciones.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/presupuestos/${c.rubroId}`} className="hover:underline">
                        {c.rubro}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{c.descripcion}</TableCell>
                    <TableCell className="text-right">{formatearMonto(c.total, c.moneda)}</TableCell>
                    <TableCell>
                      <EstadoCotizacion estado={c.estado} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 8: Verificar**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/proveedores" src/components/estado-cotizacion.tsx tests/proveedores
git commit -m "feat: pantallas de proveedores con buscador"
```

---

### Task 13: Presupuestos — lista, detalle de rubro, cotizaciones y descarga de PDF

**Files:**
- Create: `src/app/(app)/presupuestos/{operaciones.ts,actions.ts,cotizacion-campos.tsx,page.tsx}`
- Create: `src/app/(app)/presupuestos/[rubroId]/page.tsx`
- Create: `src/app/(app)/presupuestos/[rubroId]/[cotizacionId]/page.tsx`
- Create: `src/app/api/adjuntos/[nombre]/route.ts`
- Test: `tests/presupuestos/operaciones.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/presupuestos/operaciones.test.ts`:

```ts
import { readdirSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  altaCotizacion,
  aprobacion,
  bajaCotizacion,
  edicionCotizacion,
  reversion,
} from "@/app/(app)/presupuestos/operaciones";
import type { Db } from "@/db/client";
import { listarCotizaciones, obtenerCotizacion } from "@/lib/cotizaciones";
import type { Actor } from "@/lib/permissions";
import { crearActores, SIN_PERMISO } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { COTIZACION, idRubro, nuevaCotizacion, nuevoProveedor, pdf, usarUploadsTemporal } from "../helpers/presupuestos";

let db: Db;
let admin: Actor;
let editor: Actor;
let rubroId: string;
let proveedorId: string;
let uploads: string;

beforeEach(async () => {
  uploads = usarUploadsTemporal();
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
  rubroId = await idRubro(db);
  proveedorId = await nuevoProveedor(db);
});

describe("altaCotizacion", () => {
  it("el editor crea una cotización con PDF y queda como creador", async () => {
    const datos = { ...COTIZACION, rubroId, proveedorId, adjunto: pdf() };
    expect(await altaCotizacion(db, editor, datos)).toEqual({ ok: true });
    const [c] = await listarCotizaciones(db, { rubroId });
    const fila = await obtenerCotizacion(db, c.id);
    expect(fila).toMatchObject({ creadoPor: editor.id, estado: "pendiente" });
    expect(readdirSync(uploads)).toEqual([fila!.adjunto]);
  });

  it("un adjunto que no es PDF vuelve como error y no crea nada", async () => {
    const datos = { ...COTIZACION, rubroId, proveedorId, adjunto: new File(["hola"], "x.pdf") };
    expect(await altaCotizacion(db, editor, datos)).toEqual({ ok: false, error: "El adjunto debe ser un PDF" });
    expect(await listarCotizaciones(db)).toHaveLength(0);
  });

  it("si la cotización no se puede guardar, no queda el PDF", async () => {
    const datos = { ...COTIZACION, rubroId: "no-existe", proveedorId, adjunto: pdf() };
    expect(await altaCotizacion(db, editor, datos)).toEqual({ ok: false, error: "Rubro o proveedor inválido" });
    expect(readdirSync(uploads)).toEqual([]);
  });
});

describe("edicionCotizacion", () => {
  it("cambia datos y puede quitar el adjunto", async () => {
    await altaCotizacion(db, editor, { ...COTIZACION, rubroId, proveedorId, adjunto: pdf() });
    const [c] = await listarCotizaciones(db);
    const cambios = { ...COTIZACION, cotizacionId: c.id, proveedorId, precioDia: "900", quitarAdjunto: "on" };
    expect(await edicionCotizacion(db, editor, cambios)).toEqual({ ok: true });
    expect(await obtenerCotizacion(db, c.id)).toMatchObject({ precioDia: "900.00", adjunto: null });
    expect(readdirSync(uploads)).toEqual([]);
  });
});

describe("aprobación y borrado", () => {
  it("el editor no puede aprobar, revertir ni borrar", async () => {
    const id = await nuevaCotizacion(db, rubroId, proveedorId);
    expect(await aprobacion(db, editor, { cotizacionId: id })).toEqual(SIN_PERMISO);
    expect(await reversion(db, editor, { cotizacionId: id })).toEqual(SIN_PERMISO);
    expect(await bajaCotizacion(db, editor, { cotizacionId: id })).toEqual(SIN_PERMISO);
    expect((await obtenerCotizacion(db, id))?.estado).toBe("pendiente");
  });

  it("el admin aprueba, revierte y borra", async () => {
    const id = await nuevaCotizacion(db, rubroId, proveedorId);
    expect(await aprobacion(db, admin, { cotizacionId: id })).toEqual({ ok: true });
    expect((await obtenerCotizacion(db, id))?.estado).toBe("aprobada");
    expect(await reversion(db, admin, { cotizacionId: id })).toEqual({ ok: true });
    expect(await bajaCotizacion(db, admin, { cotizacionId: id })).toEqual({ ok: true });
    expect(await obtenerCotizacion(db, id)).toBeUndefined();
  });

  it("sin id vuelve como error", async () => {
    expect(await aprobacion(db, admin, {})).toEqual({ ok: false, error: "Cotización inválida" });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/presupuestos/operaciones.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Operaciones y acciones**

`src/app/(app)/presupuestos/operaciones.ts`:

```ts
import { z } from "zod";
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { conPdfNuevo } from "@/lib/adjuntos";
import {
  aprobarCotizacion,
  borrarCotizacion,
  cotizacionSchema,
  crearCotizacion,
  editarCotizacion,
  nuevaCotizacionSchema,
  revertirAprobacion,
} from "@/lib/cotizaciones";
import { exigir, type Actor } from "@/lib/permissions";

// `datos` llega de Object.fromEntries(formData): el PDF viene como File en `adjunto`.

const cotizacionId = z.string("Cotización inválida").min(1, "Cotización inválida");
const idSchema = z.object({ cotizacionId });

function separarAdjunto(datos: unknown) {
  const { adjunto, ...campos } = datos as Record<string, unknown>;
  return { adjunto, campos };
}

export function altaCotizacion(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    const { adjunto, campos } = separarAdjunto(datos);
    const valores = validar(nuevaCotizacionSchema, campos);
    await conPdfNuevo(adjunto, async (nombre) => {
      await crearCotizacion(db, valores, actor.id, nombre);
    });
  });
}

export function edicionCotizacion(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    const { adjunto, campos } = separarAdjunto(datos);
    const { cotizacionId: id, ...valores } = validar(cotizacionSchema.extend({ cotizacionId }), campos);
    const quitar = campos.quitarAdjunto === "on";
    // Archivo nuevo: se reemplaza. Sin archivo: se quita si lo pidió, si no se conserva.
    await conPdfNuevo(adjunto, (nombre) => editarCotizacion(db, id, valores, nombre ?? (quitar ? null : undefined)));
  });
}

export function aprobacion(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "aprobar");
    await aprobarCotizacion(db, validar(idSchema, datos).cotizacionId);
  });
}

export function reversion(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "aprobar");
    await revertirAprobacion(db, validar(idSchema, datos).cotizacionId);
  });
}

export function bajaCotizacion(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "borrar");
    await borrarCotizacion(db, validar(idSchema, datos).cotizacionId);
  });
}
```

`src/app/(app)/presupuestos/actions.ts`:

```ts
"use server";

import { ejecutar } from "../ejecutar";
import { altaCotizacion, aprobacion, bajaCotizacion, edicionCotizacion, reversion } from "./operaciones";

export async function crearCotizacionAction(formData: FormData) {
  return ejecutar(altaCotizacion, formData);
}

export async function editarCotizacionAction(formData: FormData) {
  return ejecutar(edicionCotizacion, formData);
}

export async function aprobarCotizacionAction(formData: FormData) {
  return ejecutar(aprobacion, formData);
}

export async function revertirAprobacionAction(formData: FormData) {
  return ejecutar(reversion, formData);
}

export async function borrarCotizacionAction(formData: FormData) {
  return ejecutar(bajaCotizacion, formData);
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run tests/presupuestos/operaciones.test.ts`
Expected: PASS.

- [ ] **Step 5: Ruta de descarga de PDF**

`src/app/api/adjuntos/[nombre]/route.ts`:

```ts
import { leerPdf } from "@/lib/adjuntos";
import { auth } from "@/lib/auth";

export async function GET(request: Request, ctx: RouteContext<"/api/adjuntos/[nombre]">) {
  const sesion = await auth.api.getSession({ headers: request.headers });
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const { nombre } = await ctx.params;
  const pdf = await leerPdf(nombre);
  if (!pdf) return new Response("No encontrado", { status: 404 });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
```

- [ ] **Step 6: Campos de cotización**

`src/app/(app)/presupuestos/cotizacion-campos.tsx`:

```tsx
import { Campo, Select, Textarea } from "@/components/campos";
import { Input } from "@/components/ui/input";
import { MONEDAS } from "@/lib/money";

type Valores = { proveedorId: string; descripcion: string; moneda: string; precioDia: string; descuento2Dias: string };

/** Si el rubro es de 1 día no se pide descuento (no aplica al total). */
export function CotizacionCampos({
  proveedores,
  dias,
  valores,
}: {
  proveedores: { id: string; nombre: string }[];
  dias: number;
  valores?: Valores;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo id="proveedorId" label="Proveedor">
        <Select id="proveedorId" name="proveedorId" defaultValue={valores?.proveedorId ?? ""} required>
          <option value="" disabled>
            Elegí un proveedor
          </option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo id="moneda" label="Moneda">
        <Select id="moneda" name="moneda" defaultValue={valores?.moneda ?? "BOB"}>
          {MONEDAS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo id="descripcion" label="Qué incluye" className="sm:col-span-2">
        <Textarea id="descripcion" name="descripcion" defaultValue={valores?.descripcion} required />
      </Campo>
      <Campo id="precioDia" label="Precio por día">
        <Input id="precioDia" name="precioDia" inputMode="decimal" defaultValue={valores?.precioDia} required />
      </Campo>
      {dias === 2 ? (
        <Campo id="descuento2Dias" label="% de descuento por contratar 2 días">
          <Input
            id="descuento2Dias"
            name="descuento2Dias"
            inputMode="decimal"
            defaultValue={valores?.descuento2Dias ?? "0"}
          />
        </Campo>
      ) : (
        <input type="hidden" name="descuento2Dias" value={valores?.descuento2Dias ?? "0"} />
      )}
      <Campo id="adjunto" label="Cotización en PDF (opcional, hasta 10 MB)" className="sm:col-span-2">
        <Input id="adjunto" name="adjunto" type="file" accept="application/pdf" />
      </Campo>
    </div>
  );
}
```

- [ ] **Step 7: Lista por área**

`src/app/(app)/presupuestos/page.tsx`:

```tsx
import Link from "next/link";
import { TotalEventoCard } from "@/components/total-evento";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { formatearMonto } from "@/lib/money";
import { resumenPresupuesto } from "@/lib/resumen";
import { usuarioActual } from "@/lib/session";

export default async function PresupuestosPage() {
  await usuarioActual();
  const { areas, total, tipos } = await resumenPresupuesto(db);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Presupuestos</h1>
      <TotalEventoCard total={total} tipos={tipos} />

      {areas
        .filter((a) => a.rubros.length > 0)
        .map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle>{a.nombre}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rubro</TableHead>
                    <TableHead>Días</TableHead>
                    <TableHead>Cotizaciones</TableHead>
                    <TableHead>Aprobada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {a.rubros.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/presupuestos/${r.id}`} className="font-medium hover:underline">
                          {r.nombre}
                        </Link>
                      </TableCell>
                      <TableCell>{r.dias}</TableCell>
                      <TableCell>{r.cotizaciones}</TableCell>
                      <TableCell>
                        {r.aprobada ? (
                          `${r.aprobada.proveedor} · ${formatearMonto(r.aprobada.total, r.aprobada.moneda)}`
                        ) : (
                          <Badge variant="outline">Sin aprobar</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
```

- [ ] **Step 8: Detalle de rubro (comparación y alta)**

`src/app/(app)/presupuestos/[rubroId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoCotizacion } from "@/components/estado-cotizacion";
import { BotonAccion, FormAccion } from "@/components/form-accion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { idMasBarata, listarCotizaciones } from "@/lib/cotizaciones";
import { formatearMonto } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listarProveedores } from "@/lib/proveedores";
import { obtenerRubro } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  aprobarCotizacionAction,
  borrarCotizacionAction,
  crearCotizacionAction,
  revertirAprobacionAction,
} from "../actions";
import { CotizacionCampos } from "../cotizacion-campos";

export default async function RubroPage({ params }: PageProps<"/presupuestos/[rubroId]">) {
  const usuario = await usuarioActual();
  const { rubroId } = await params;
  const rubro = await obtenerRubro(db, rubroId);
  if (!rubro) notFound();

  const [cotizaciones, proveedores] = await Promise.all([
    listarCotizaciones(db, { rubroId }),
    listarProveedores(db),
  ]);
  const masBarata = idMasBarata(cotizaciones);
  const puedeAprobar = can(usuario.role, "aprobar");
  const puedeBorrar = can(usuario.role, "borrar");
  const faltaCambio = cotizaciones.some((c) => c.totalBob === null);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/presupuestos" className="text-sm text-muted-foreground hover:underline">
          ← Presupuestos
        </Link>
        <h1 className="text-2xl font-semibold">{rubro.nombre}</h1>
        <p className="text-muted-foreground">
          {rubro.area} · {rubro.dias === 1 ? "1 día" : "2 días"}
        </p>
      </div>

      {faltaCambio && (
        <p className="text-sm text-destructive">
          Hay cotizaciones en monedas sin tipo de cambio: no se pueden comparar en BOB.
        </p>
      )}

      {cotizaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay cotizaciones para este rubro.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proveedor</TableHead>
              <TableHead>Qué incluye</TableHead>
              <TableHead className="text-right">Precio/día</TableHead>
              {rubro.dias === 2 && <TableHead className="text-right">Desc.</TableHead>}
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Total BOB</TableHead>
              {rubro.dias === 2 && <TableHead className="text-right">Ahorro</TableHead>}
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cotizaciones.map((c) => (
              <TableRow key={c.id} className={cn(c.id === masBarata && "bg-green-50 dark:bg-green-950/30")}>
                <TableCell className="font-medium">
                  <Link href={`/proveedores/${c.proveedorId}`} className="hover:underline">
                    {c.proveedor}
                  </Link>
                  {c.id === masBarata && (
                    <Badge variant="secondary" className="ml-2">
                      Más barata
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal">
                  {c.descripcion}
                  {c.adjunto && (
                    <a
                      href={`/api/adjuntos/${c.adjunto}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 text-sm underline"
                    >
                      PDF
                    </a>
                  )}
                </TableCell>
                <TableCell className="text-right">{formatearMonto(c.precioDia, c.moneda)}</TableCell>
                {rubro.dias === 2 && <TableCell className="text-right">{c.descuento2Dias} %</TableCell>}
                <TableCell className="text-right">{formatearMonto(c.total, c.moneda)}</TableCell>
                <TableCell className="text-right">
                  {c.totalBob === null ? "—" : formatearMonto(c.totalBob, "BOB")}
                </TableCell>
                {rubro.dias === 2 && (
                  <TableCell className="text-right">{formatearMonto(c.ahorro, c.moneda)}</TableCell>
                )}
                <TableCell>
                  <EstadoCotizacion estado={c.estado} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Link
                      href={`/presupuestos/${rubroId}/${c.id}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Editar
                    </Link>
                    {puedeAprobar && c.estado !== "aprobada" && (
                      <BotonAccion
                        accion={aprobarCotizacionAction}
                        campos={{ cotizacionId: c.id }}
                        texto="Aprobar"
                        enviando="Aprobando…"
                        variant="default"
                      />
                    )}
                    {puedeAprobar && c.estado === "aprobada" && (
                      <BotonAccion
                        accion={revertirAprobacionAction}
                        campos={{ cotizacionId: c.id }}
                        texto="Revertir"
                        enviando="Revirtiendo…"
                        confirmar
                      />
                    )}
                    {puedeBorrar && (
                      <BotonAccion
                        accion={borrarCotizacionAction}
                        campos={{ cotizacionId: c.id }}
                        texto="Borrar"
                        enviando="Borrando…"
                        variant="ghost"
                        confirmar
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nueva cotización</CardTitle>
        </CardHeader>
        <CardContent>
          {proveedores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Primero cargá al menos un proveedor en{" "}
              <Link href="/proveedores" className="underline">
                Proveedores
              </Link>
              .
            </p>
          ) : (
            <FormAccion
              accion={crearCotizacionAction}
              enviar="Agregar cotización"
              enviando="Guardando…"
              exito="Cotización agregada"
              limpiar
              className="space-y-4"
            >
              <input type="hidden" name="rubroId" value={rubroId} />
              <CotizacionCampos proveedores={proveedores} dias={rubro.dias} />
            </FormAccion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 9: Edición de cotización**

`src/app/(app)/presupuestos/[rubroId]/[cotizacionId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAccion } from "@/components/form-accion";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { obtenerCotizacion } from "@/lib/cotizaciones";
import { listarProveedores } from "@/lib/proveedores";
import { obtenerRubro } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import { editarCotizacionAction } from "../../actions";
import { CotizacionCampos } from "../../cotizacion-campos";

export default async function EditarCotizacionPage({
  params,
}: PageProps<"/presupuestos/[rubroId]/[cotizacionId]">) {
  await usuarioActual();
  const { rubroId, cotizacionId } = await params;
  const [cotizacion, rubro, proveedores] = await Promise.all([
    obtenerCotizacion(db, cotizacionId),
    obtenerRubro(db, rubroId),
    listarProveedores(db),
  ]);
  if (!cotizacion || !rubro || cotizacion.rubroId !== rubroId) notFound();

  const volver = `/presupuestos/${rubroId}`;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={volver} className="text-sm text-muted-foreground hover:underline">
          ← {rubro.nombre}
        </Link>
        <h1 className="text-2xl font-semibold">Editar cotización</h1>
      </div>

      <Card>
        <CardContent>
          <FormAccion
            accion={editarCotizacionAction}
            enviar="Guardar cambios"
            enviando="Guardando…"
            redirigir={volver}
            className="space-y-4"
          >
            <input type="hidden" name="cotizacionId" value={cotizacion.id} />
            <CotizacionCampos proveedores={proveedores} dias={rubro.dias} valores={cotizacion} />
            {cotizacion.adjunto && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="quitarAdjunto" />
                Quitar el PDF actual (
                <a href={`/api/adjuntos/${cotizacion.adjunto}`} target="_blank" rel="noreferrer" className="underline">
                  ver
                </a>
                ). Si subís uno nuevo, reemplaza al actual.
              </label>
            )}
          </FormAccion>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 10: Verificar**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 11: Commit**

```bash
git add "src/app/(app)/presupuestos" "src/app/api/adjuntos" tests/presupuestos
git commit -m "feat: presupuestos por rubro con comparación, aprobación y PDF"
```

---

### Task 14: Tablero y verificación de punta a punta

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Modify: `README.md` (sección de uploads)

- [ ] **Step 1: Tablero**

`src/app/(app)/page.tsx` completo:

```tsx
import Link from "next/link";
import { TotalEventoCard } from "@/components/total-evento";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { resumenPresupuesto } from "@/lib/resumen";
import { usuarioActual } from "@/lib/session";

export default async function TableroPage() {
  const usuario = await usuarioActual();
  const { areas, total, tipos } = await resumenPresupuesto(db);
  const sinAprobar = areas.flatMap((a) => a.rubros).filter((r) => !r.aprobada);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Hola, {usuario.name}</h1>
        <p className="text-muted-foreground">Vibra Bolivia 2027 — back office de producción.</p>
      </div>

      <TotalEventoCard total={total} tipos={tipos} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Avance por área</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {areas.map((a) => (
                <li key={a.id} className="flex justify-between gap-4 text-sm">
                  <span>{a.nombre}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {a.rubros.filter((r) => r.aprobada).length} / {a.rubros.length} rubros aprobados
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rubros sin cotización aprobada</CardTitle>
          </CardHeader>
          <CardContent>
            {sinAprobar.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todos los rubros tienen una cotización aprobada.</p>
            ) : (
              <ul className="space-y-1">
                {sinAprobar.map((r) => (
                  <li key={r.id} className="text-sm">
                    <Link href={`/presupuestos/${r.id}`} className="font-medium hover:underline">
                      {r.nombre}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      · {r.area} · {r.cotizaciones} {r.cotizaciones === 1 ? "cotización" : "cotizaciones"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: README**

En `README.md`, debajo de la sección "Importante: PGlite admite un solo proceso", agregar:

```markdown
## Adjuntos

Los PDF de las cotizaciones se guardan en `UPLOADS_DIR` (por defecto `.data/uploads`, fuera de git) y se descargan por `/api/adjuntos/<nombre>`, que exige sesión. En el VPS, `UPLOADS_DIR` tiene que ser un volumen persistente incluido en el backup.
```

- [ ] **Step 3: Suite, lint, tipos y build**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: todo verde; el build lista las rutas `/presupuestos`, `/presupuestos/[rubroId]`, `/presupuestos/[rubroId]/[cotizacionId]`, `/proveedores`, `/proveedores/[proveedorId]`, `/configuracion/rubros`, `/configuracion/tipos-cambio`, `/api/adjuntos/[nombre]`.

- [ ] **Step 4: Prueba manual en el navegador**

Con `npm run dev` (después de `npm run db:migrate` con el server apagado):

1. Login como `admin@vibra.bo` → Configuración → Tipos de cambio: cargar USD = 6.96.
2. Proveedores: crear "Sonido Andino" y "Audio Total".
3. Presupuestos → Sonido: cargar una cotización por proveedor (una en USD, con PDF). Ver totales, "Más barata", link al PDF.
4. Aprobar una → la otra queda "Descartada"; el tablero muestra el total en BOB/USD/ARS ("Sin tipo de cambio" en ARS).
5. Revertir → vuelve a "Pendiente".
6. Login como `editor@vibra.bo`: puede crear/editar cotizaciones y proveedores; no ve "Aprobar", "Borrar" ni los links de configuración.
7. Abrir `/api/adjuntos/<nombre>` en una ventana privada (sin sesión) → 401.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/page.tsx" README.md
git commit -m "feat: tablero con total aprobado y avance por área"
```

---

## Cobertura del spec (Plan 2)

| Spec | Task |
|---|---|
| Modelo: Área, Rubro, Proveedor, Cotización, Tipo de cambio | 2 |
| Regla 1 (total 1/2 días, ahorro) | 3, 8 |
| Regla 2 (conversión a BOB; totales en BOB/USD/ARS) | 3, 10 |
| Regla 3 (una aprobada por rubro, transacción, revertir, solo admin) | 8, 13 |
| Regla 4 (total del evento = aprobadas) | 3, 9 |
| Regla 5 (falta tipo de cambio → advertencia) | 3, 10, 13 |
| Regla 6 (montos `numeric`) | 2 |
| Pantalla Presupuestos (lista, detalle, más barata, aprobar, formulario) | 13 |
| Pantalla Proveedores (buscador, alta/edición, sus cotizaciones) | 12 |
| Configuración: tipos de cambio y rubros | 11 |
| Tablero: total, avance por área (rubros), rubros sin aprobar | 14 |
| Permisos (editor crea/edita; admin aprueba, borra, configura) | 11, 12, 13 |
| Adjuntos PDF ≤ 10 MB, cliente y servidor, ruta protegida | 7, 10, 13 |

Quedan para el Plan 3: tareas (avance por área de tareas, tareas vencidas en el tablero) y recordatorios. Para el Plan 4: volumen de `UPLOADS_DIR` y backup de adjuntos.
