import { z } from "zod";
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { exigir, type Actor } from "@/lib/permissions";
import { cancelarRecordatorio, crearRecordatorioManual, recordatorioManualSchema } from "@/lib/recordatorios";
import { borrarTarea, cambiarEstadoTarea, crearTarea, editarTarea, ESTADOS_TAREA, tareaSchema } from "@/lib/tareas";

const tareaId = z.string("Tarea inválida").min(1, "Tarea inválida");

export function altaTarea(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    await crearTarea(db, validar(tareaSchema, datos), actor.id);
  });
}

export function edicionTarea(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    const { tareaId: id, ...valores } = validar(tareaSchema.extend({ tareaId }), datos);
    await editarTarea(db, id, valores);
  });
}

export function cambioEstadoTarea(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    const { tareaId: id, estado } = validar(
      z.object({ tareaId, estado: z.enum(ESTADOS_TAREA, "Estado inválido") }),
      datos,
    );
    await cambiarEstadoTarea(db, id, estado);
  });
}

export function bajaTarea(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "borrar");
    await borrarTarea(db, validar(z.object({ tareaId }), datos).tareaId);
  });
}

// Recordatorios manuales: el permiso (creador de la tarea o admin) lo chequea src/lib/recordatorios.ts.

export function altaRecordatorio(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "ver");
    await crearRecordatorioManual(db, actor, validar(recordatorioManualSchema, datos));
  });
}

export function bajaRecordatorio(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "ver");
    const { recordatorioId } = validar(
      z.object({ recordatorioId: z.string("Recordatorio inválido").min(1, "Recordatorio inválido") }),
      datos,
    );
    await cancelarRecordatorio(db, actor, recordatorioId);
  });
}
