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
