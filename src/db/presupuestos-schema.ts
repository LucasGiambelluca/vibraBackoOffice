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
