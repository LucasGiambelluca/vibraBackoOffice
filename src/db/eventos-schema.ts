import { sql } from "drizzle-orm";
import { check, date, index, integer, numeric, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { rubro } from "./presupuestos-schema";

/** Un evento de la productora. Cerrado = solo lectura (ver asegurarEventoAbierto). */
export const evento = pgTable(
  "evento",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    nombre: text("nombre").notNull().unique(),
    /** "YYYY-MM-DD". */
    fechaInicio: date("fecha_inicio", { mode: "string" }),
    fechaFin: date("fecha_fin", { mode: "string" }),
    lugar: text("lugar"),
    estado: text("estado", { enum: ["activo", "cerrado"] }).notNull().default("activo"),
    cerradoPor: text("cerrado_por").references(() => user.id, { onDelete: "set null" }),
    cerradoAt: timestamp("cerrado_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [check("evento_estado_check", sql`estado in ('activo', 'cerrado')`)],
);

/** Un rubro del catálogo usado en un evento, con su presupuesto y lo pagado. */
export const eventoRubro = pgTable(
  "evento_rubro",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    eventoId: text("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "restrict" }),
    rubroId: text("rubro_id")
      .notNull()
      .references(() => rubro.id, { onDelete: "restrict" }),
    dias: integer("dias").notNull().default(1),
    presupuesto: numeric("presupuesto", { precision: 14, scale: 2 }),
    presupuestoMoneda: text("presupuesto_moneda"),
    pagado: numeric("pagado", { precision: 14, scale: 2 }),
    pagadoMoneda: text("pagado_moneda"),
    /** "YYYY-MM-DD". */
    pagadoFecha: date("pagado_fecha", { mode: "string" }),
    pagadoNota: text("pagado_nota"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("evento_rubro_evento_rubro_unique").on(t.eventoId, t.rubroId),
    check("evento_rubro_dias_check", sql`dias in (1, 2)`),
    check(
      "evento_rubro_presupuesto_check",
      sql`(presupuesto is null and presupuesto_moneda is null) or (presupuesto >= 0 and presupuesto_moneda in ('ARS', 'USD', 'BOB'))`,
    ),
    check(
      "evento_rubro_pagado_check",
      sql`(pagado is null and pagado_moneda is null) or (pagado >= 0 and pagado_moneda in ('ARS', 'USD', 'BOB'))`,
    ),
    index("evento_rubro_rubro_idx").on(t.rubroId),
  ],
);

/** Cuántos ARS vale 1 unidad de la moneda, en ese evento. ARS no se guarda: vale 1. */
export const eventoTipoCambio = pgTable(
  "evento_tipo_cambio",
  {
    eventoId: text("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "cascade" }),
    moneda: text("moneda").notNull(),
    valorArs: numeric("valor_ars", { precision: 18, scale: 6 }).notNull(),
    actualizadoPor: text("actualizado_por").references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.eventoId, t.moneda] }),
    check("evento_tipo_cambio_moneda_check", sql`moneda in ('USD', 'BOB')`),
    check("evento_tipo_cambio_valor_check", sql`valor_ars > 0`),
  ],
);
