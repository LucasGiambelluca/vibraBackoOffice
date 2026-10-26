import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { recordatorio } from "@/db/schema";
import { crearTarea, nuevaTareaSchema } from "@/lib/tareas";
import { idVibra } from "./presupuestos";

/** 1/3/2027 08:00 en La Paz. */
export const AHORA = new Date("2027-03-01T12:00:00Z");

/** Datos de formulario editables (sin evento: se elige al crear). */
export const TAREA = { titulo: "Contratar vallas", grupoId: "4", responsableId: "", fechaLimite: "", notas: "" };

/** Por defecto, en Vibra Bolivia 2027. */
export async function nuevaTarea(
  db: Db,
  extra: Partial<typeof TAREA> & { eventoId?: string } = {},
  creadoPor: string | null = null,
  ahora = AHORA,
): Promise<string> {
  const datos = nuevaTareaSchema.parse({ eventoId: await idVibra(db), ...TAREA, ...extra });
  return crearTarea(db, datos, creadoPor, ahora);
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
