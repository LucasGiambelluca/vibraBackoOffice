import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Última corrida exitosa de cada proceso de fondo (hoy solo "worker"). Ver src/lib/latido.ts. */
export const latido = pgTable("latido", {
  proceso: text("proceso").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull(),
});
