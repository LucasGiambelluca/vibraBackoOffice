import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { evento } from "./eventos-schema";
import { grupo } from "./presupuestos-schema";

// En los CHECK y los índices parciales se usan nombres de columna crudos (ver presupuestos-schema.ts).

export const tarea = pgTable(
  "tarea",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    titulo: text("titulo").notNull(),
    eventoId: text("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "restrict" }),
    grupoId: integer("grupo_id")
      .notNull()
      .references(() => grupo.id),
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
    index("tarea_evento_idx").on(t.eventoId),
    index("tarea_grupo_idx").on(t.grupoId),
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
    /** Cuándo un worker reclamó el email por última vez: nadie más lo toma por 10 minutos. */
    emailIntentoAt: timestamp("email_intento_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("notificacion_email_estado_check", sql`email_estado in ('pendiente', 'enviado', 'omitido', 'fallido')`),
    index("notificacion_usuario_idx").on(t.usuarioId, t.leida),
    index("notificacion_email_pendiente_idx").on(t.createdAt).where(sql`email_estado = 'pendiente'`),
  ],
);
