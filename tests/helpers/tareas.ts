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
