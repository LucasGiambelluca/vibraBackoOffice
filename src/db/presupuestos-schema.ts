import { sql } from "drizzle-orm";
import { check, index, integer, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { eventoRubro } from "./eventos-schema";

// En los CHECK y el índice parcial se usan nombres de columna crudos: Postgres no
// acepta columnas calificadas con la tabla ahí y drizzle-kit las calificaría.

/** Grupos de rubros (antes, las 6 áreas fijas). Los arma el admin. */
export const grupo = pgTable("grupo", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity({ startWith: 7 }),
  nombre: text("nombre").notNull().unique(),
  orden: integer("orden").notNull().default(0),
});

/** Catálogo de rubros de la productora: cada evento elige cuáles usa (ver evento_rubro). */
export const rubro = pgTable("rubro", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nombre: text("nombre").notNull().unique(),
  grupoId: integer("grupo_id")
    .notNull()
    .references(() => grupo.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
    /** El rubro dentro de un evento: así cada evento tiene sus cotizaciones. */
    eventoRubroId: text("evento_rubro_id")
      .notNull()
      .references(() => eventoRubro.id, { onDelete: "restrict" }),
    proveedorId: text("proveedor_id")
      .notNull()
      .references(() => proveedor.id, { onDelete: "restrict" }),
    descripcion: text("descripcion").notNull(),
    moneda: text("moneda").notNull(),
    precioDia: numeric("precio_dia", { precision: 14, scale: 2 }).notNull(),
    descuento2Dias: numeric("descuento_2_dias", { precision: 5, scale: 2 }).notNull().default("0"),
    estado: text("estado").notNull().default("pendiente"),
    /** Quién y cuándo la aprobó. Solo tienen valor mientras está aprobada. */
    aprobadaPor: text("aprobada_por").references(() => user.id, { onDelete: "set null" }),
    aprobadaAt: timestamp("aprobada_at"),
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
    // Regla de negocio: como máximo una cotización aprobada por rubro de cada evento.
    uniqueIndex("cotizacion_una_aprobada_por_rubro").on(t.eventoRubroId).where(sql`estado = 'aprobada'`),
    index("cotizacion_evento_rubro_idx").on(t.eventoRubroId),
    index("cotizacion_proveedor_idx").on(t.proveedorId),
  ],
);
