import { and, asc, eq, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notificacion, recordatorio, tarea, user } from "@/db/schema";
import type { EnviarEmail } from "@/lib/email";
import { pendiente } from "@/lib/recordatorios";
import { mensajeRecordatorio, siguienteNueve } from "@/lib/reminders";

// Lógica del worker (src/worker/ciclo.ts). Testeable con una DB de prueba.

export const MAX_INTENTOS_EMAIL = 5;
const LOTE = 100;

/**
 * Toma los recordatorios vencidos y, en la misma transacción, crea las notificaciones y
 * los marca enviados. `SKIP LOCKED`: dos workers a la vez nunca toman el mismo.
 * Devuelve cuántos recordatorios procesó.
 */
export async function procesarRecordatorios(db: Db, ahora = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    const vencidos = await tx
      .select({
        id: recordatorio.id,
        tareaId: recordatorio.tareaId,
        tipoAutomatico: recordatorio.tipoAutomatico,
        titulo: tarea.titulo,
        fechaLimite: tarea.fechaLimite,
        estado: tarea.estado,
        responsableId: tarea.responsableId,
      })
      .from(recordatorio)
      .innerJoin(tarea, eq(recordatorio.tareaId, tarea.id))
      .where(and(lte(recordatorio.fechaHora, ahora), pendiente))
      .orderBy(asc(recordatorio.fechaHora))
      .limit(LOTE)
      .for("update", { of: recordatorio, skipLocked: true });
    if (vencidos.length === 0) return 0;

    const usuarios = await tx.select({ id: user.id, role: user.role, recibirEmails: user.recibirEmails }).from(user);
    const recibeEmails = new Map(usuarios.map((u) => [u.id, u.recibirEmails]));
    const admins = usuarios.filter((u) => u.role === "admin").map((u) => u.id);

    for (const r of vencidos) {
      // Sin responsable (o si lo borraron), les llega a todos los admins.
      const destinatarios = r.responsableId ? [r.responsableId] : admins;
      const mensaje = mensajeRecordatorio(r.tipoAutomatico ?? "manual", r.titulo, r.fechaLimite);
      if (destinatarios.length > 0) {
        await tx.insert(notificacion).values(
          destinatarios.map((usuarioId) => ({
            usuarioId,
            tareaId: r.tareaId,
            mensaje,
            emailEstado: recibeEmails.get(usuarioId) ? ("pendiente" as const) : ("omitido" as const),
          })),
        );
      }
      await tx.update(recordatorio).set({ enviadoAt: ahora }).where(eq(recordatorio.id, r.id));

      const vencida = r.tipoAutomatico === "dia_vencimiento" || r.tipoAutomatico === "vencida_diario";
      if (vencida && r.estado !== "hecha") {
        await tx.insert(recordatorio).values({
          tareaId: r.tareaId,
          origen: "automatico",
          tipoAutomatico: "vencida_diario",
          fechaHora: siguienteNueve(ahora),
        });
      }
    }
    return vencidos.length;
  });
}

/**
 * Manda los emails de las notificaciones pendientes. Si uno falla se reintenta en la
 * próxima corrida; después de MAX_INTENTOS_EMAIL queda como fallido.
 */
export async function enviarEmailsPendientes(db: Db, enviar: EnviarEmail, urlBase: string): Promise<void> {
  await db.transaction(async (tx) => {
    const pendientes = await tx
      .select({
        id: notificacion.id,
        tareaId: notificacion.tareaId,
        mensaje: notificacion.mensaje,
        intentos: notificacion.intentosEmail,
        email: user.email,
      })
      .from(notificacion)
      .innerJoin(user, eq(notificacion.usuarioId, user.id))
      .where(eq(notificacion.emailEstado, "pendiente"))
      .orderBy(asc(notificacion.createdAt))
      .limit(LOTE)
      .for("update", { of: notificacion, skipLocked: true });

    for (const n of pendientes) {
      const intentos = n.intentos + 1;
      try {
        await enviar({
          para: n.email,
          asunto: `Vibra 2027 — ${n.mensaje}`,
          texto: `${n.mensaje}\n\nVer la tarea: ${urlBase}/tareas/${n.tareaId}`,
        });
        await tx.update(notificacion).set({ emailEstado: "enviado", intentosEmail: intentos }).where(eq(notificacion.id, n.id));
      } catch (error) {
        console.error(`[worker] no se pudo enviar el email de la notificación ${n.id}`, error);
        await tx
          .update(notificacion)
          .set({ intentosEmail: intentos, emailEstado: intentos >= MAX_INTENTOS_EMAIL ? "fallido" : "pendiente" })
          .where(eq(notificacion.id, n.id));
      }
    }
  });
}
