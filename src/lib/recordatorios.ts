import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { recordatorio, tarea } from "@/db/schema";
import { ErrorNegocio } from "@/lib/acciones";
import { asegurarEventoAbierto } from "@/lib/eventos";
import { can, ErrorPermiso, type Actor } from "@/lib/permissions";
import { desdeHoraLaPaz, recordatoriosAutomaticos } from "@/lib/reminders";

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

export const recordatorioManualSchema = z.object({
  tareaId: z.string("Tarea inválida").min(1, "Tarea inválida"),
  fechaHora: z
    .string("Falta la fecha y hora")
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha y hora inválidas")
    .transform(desdeHoraLaPaz)
    .refine((d) => !Number.isNaN(d.getTime()), "Fecha y hora inválidas"),
});

export type DatosRecordatorioManual = z.infer<typeof recordatorioManualSchema>;

/** Los manuales los agrega o cancela quien creó la tarea, o un admin. */
export function puedeGestionarRecordatorios(actor: Actor, creadorTarea: string | null): boolean {
  return creadorTarea === actor.id || can(actor.role, "configurar");
}

export async function crearRecordatorioManual(
  db: Db,
  actor: Actor,
  datos: DatosRecordatorioManual,
  ahora = new Date(),
): Promise<void> {
  if (datos.fechaHora <= ahora) throw new ErrorNegocio("La fecha tiene que ser futura");
  // En una transacción con la tarea bloqueada: si en el medio se cierra el evento o se
  // marca hecha la tarea, se espera y se lee el estado real.
  await db.transaction(async (tx) => {
    const [t] = await tx
      .select({ creadoPor: tarea.creadoPor, estado: tarea.estado, eventoId: tarea.eventoId })
      .from(tarea)
      .where(eq(tarea.id, datos.tareaId))
      .for("update");
    if (!t) throw new ErrorNegocio("La tarea no existe");
    if (!puedeGestionarRecordatorios(actor, t.creadoPor)) throw new ErrorPermiso();
    await asegurarEventoAbierto(tx, t.eventoId);
    if (t.estado === "hecha") throw new ErrorNegocio("La tarea ya está hecha");

    await tx.insert(recordatorio).values({ ...datos, origen: "manual", creadoPor: actor.id });
  });
}

export async function cancelarRecordatorio(db: Db, actor: Actor, id: string, ahora = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const [r] = await tx
      .select({
        origen: recordatorio.origen,
        creadorTarea: tarea.creadoPor,
        eventoId: tarea.eventoId,
        enviadoAt: recordatorio.enviadoAt,
        canceladoAt: recordatorio.canceladoAt,
      })
      .from(recordatorio)
      .innerJoin(tarea, eq(recordatorio.tareaId, tarea.id))
      .where(eq(recordatorio.id, id))
      .for("update", { of: [recordatorio, tarea] });
    if (!r) throw new ErrorNegocio("El recordatorio no existe o ya no está pendiente");
    if (r.origen !== "manual") throw new ErrorNegocio("Los recordatorios automáticos no se cancelan a mano");
    if (!puedeGestionarRecordatorios(actor, r.creadorTarea)) throw new ErrorPermiso();
    // Antes que "ya no está pendiente": al cerrar el evento sus recordatorios se cancelan.
    await asegurarEventoAbierto(tx, r.eventoId);
    if (r.enviadoAt || r.canceladoAt) throw new ErrorNegocio("El recordatorio no existe o ya no está pendiente");

    await tx.update(recordatorio).set({ canceladoAt: ahora }).where(eq(recordatorio.id, id));
  });
}

export function listarRecordatorios(db: Db, tareaId: string) {
  return db
    .select({
      id: recordatorio.id,
      fechaHora: recordatorio.fechaHora,
      origen: recordatorio.origen,
      tipoAutomatico: recordatorio.tipoAutomatico,
      enviadoAt: recordatorio.enviadoAt,
      canceladoAt: recordatorio.canceladoAt,
    })
    .from(recordatorio)
    .where(eq(recordatorio.tareaId, tareaId))
    .orderBy(asc(recordatorio.fechaHora));
}
