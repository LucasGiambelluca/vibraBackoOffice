import { and, count, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { evento, notificacion, tarea } from "@/db/schema";
import { ErrorNegocio } from "@/lib/acciones";

export function listarNotificaciones(db: Db, usuarioId: string, limite = 15) {
  return db
    .select({
      id: notificacion.id,
      mensaje: notificacion.mensaje,
      tareaId: notificacion.tareaId,
      eventoId: tarea.eventoId,
      evento: evento.nombre,
      leida: notificacion.leida,
      createdAt: notificacion.createdAt,
    })
    .from(notificacion)
    .innerJoin(tarea, eq(notificacion.tareaId, tarea.id))
    .innerJoin(evento, eq(tarea.eventoId, evento.id))
    .where(eq(notificacion.usuarioId, usuarioId))
    .orderBy(desc(notificacion.createdAt))
    .limit(limite);
}

export async function contarNoLeidas(db: Db, usuarioId: string): Promise<number> {
  const [fila] = await db
    .select({ cantidad: count() })
    .from(notificacion)
    .where(and(eq(notificacion.usuarioId, usuarioId), eq(notificacion.leida, false)));
  return fila.cantidad;
}

export async function marcarLeida(db: Db, usuarioId: string, id: string): Promise<void> {
  const filas = await db
    .update(notificacion)
    .set({ leida: true })
    .where(and(eq(notificacion.id, id), eq(notificacion.usuarioId, usuarioId)))
    .returning({ id: notificacion.id });
  if (filas.length === 0) throw new ErrorNegocio("La notificación no existe");
}

export async function marcarTodasLeidas(db: Db, usuarioId: string): Promise<void> {
  await db
    .update(notificacion)
    .set({ leida: true })
    .where(and(eq(notificacion.usuarioId, usuarioId), eq(notificacion.leida, false)));
}
