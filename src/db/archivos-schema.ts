import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { evento, eventoRubro } from "./eventos-schema";
import { cotizacion } from "./presupuestos-schema";
import { tarea } from "./tareas-schema";

// En los CHECK se usan nombres de columna crudos (ver presupuestos-schema.ts).

/**
 * Fotos y PDF. Siempre son de un evento; además pueden ser de uno de sus rubros, de una
 * cotización o de una tarea (a lo sumo uno). Sin ninguno, es un archivo del evento.
 */
export const archivo = pgTable(
  "archivo",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    eventoId: text("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "restrict" }),
    // Al borrar el dueño se borran las filas; el disco lo limpia quien borra (ver src/lib/archivos.ts).
    eventoRubroId: text("evento_rubro_id").references(() => eventoRubro.id, { onDelete: "cascade" }),
    cotizacionId: text("cotizacion_id").references(() => cotizacion.id, { onDelete: "cascade" }),
    tareaId: text("tarea_id").references(() => tarea.id, { onDelete: "cascade" }),
    tipo: text("tipo", { enum: ["pdf", "imagen"] }).notNull(),
    /** Nombre original, para mostrar y descargar. */
    nombre: text("nombre").notNull(),
    /** Nombre del archivo en UPLOADS_DIR (ver src/lib/archivos-disco.ts). */
    guardado: text("guardado").notNull().unique(),
    /** Miniatura WebP en UPLOADS_DIR; solo imágenes. */
    miniatura: text("miniatura"),
    /** Tamaño guardado; null en los PDF que vinieron de la columna cotizacion.adjunto. */
    bytes: integer("bytes"),
    subidoPor: text("subido_por").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("archivo_tipo_check", sql`tipo in ('pdf', 'imagen')`),
    check(
      "archivo_un_duenio_check",
      sql`num_nonnulls(evento_rubro_id, cotizacion_id, tarea_id) <= 1`,
    ),
    index("archivo_evento_idx").on(t.eventoId),
    index("archivo_evento_rubro_idx").on(t.eventoRubroId),
    index("archivo_cotizacion_idx").on(t.cotizacionId),
    index("archivo_tarea_idx").on(t.tareaId),
  ],
);
