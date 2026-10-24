import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
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

/** Un email reclamado no lo vuelve a tomar ningún worker durante este tiempo. */
export const VENTANA_RECLAMO_MS = 10 * 60_000;

export type EmailReclamado = { id: string; tareaId: string; mensaje: string; intentos: number; email: string };

/**
 * Reclama un lote de emails pendientes en una transacción corta: les suma el intento y
 * marca `email_intento_at`, así otro worker (o una corrida después de un crash) no los
 * retoma hasta pasada la ventana. Los que ya agotaron los intentos quedan fallidos.
 */
export async function reclamarEmails(db: Db, ahora = new Date()): Promise<EmailReclamado[]> {
  const limite = new Date(ahora.getTime() - VENTANA_RECLAMO_MS);
  return db.transaction(async (tx) => {
    const filas = await tx
      .select({
        id: notificacion.id,
        tareaId: notificacion.tareaId,
        mensaje: notificacion.mensaje,
        intentos: notificacion.intentosEmail,
        email: user.email,
      })
      .from(notificacion)
      .innerJoin(user, eq(notificacion.usuarioId, user.id))
      .where(
        and(
          eq(notificacion.emailEstado, "pendiente"),
          or(isNull(notificacion.emailIntentoAt), lte(notificacion.emailIntentoAt, limite)),
        ),
      )
      .orderBy(asc(notificacion.createdAt))
      .limit(LOTE)
      .for("update", { of: notificacion, skipLocked: true });

    const agotadas = filas.filter((n) => n.intentos >= MAX_INTENTOS_EMAIL).map((n) => n.id);
    if (agotadas.length > 0) {
      await tx.update(notificacion).set({ emailEstado: "fallido" }).where(inArray(notificacion.id, agotadas));
    }
    const reclamadas = filas.filter((n) => n.intentos < MAX_INTENTOS_EMAIL);
    if (reclamadas.length > 0) {
      await tx
        .update(notificacion)
        .set({ intentosEmail: sql`${notificacion.intentosEmail} + 1`, emailIntentoAt: ahora })
        .where(
          inArray(
            notificacion.id,
            reclamadas.map((n) => n.id),
          ),
        );
    }
    return reclamadas.map((n) => ({ ...n, intentos: n.intentos + 1 }));
  });
}

/**
 * Manda los emails de las notificaciones pendientes, fuera de toda transacción (un SMTP
 * lento no bloquea filas). Si uno falla se reintenta pasada la ventana de reclamo;
 * después de MAX_INTENTOS_EMAIL queda como fallido.
 */
export async function enviarEmailsPendientes(
  db: Db,
  enviar: EnviarEmail,
  urlBase: string,
  ahora = new Date(),
): Promise<void> {
  const reclamadas = await reclamarEmails(db, ahora);
  for (const n of reclamadas) {
    let estado: "enviado" | "pendiente" | "fallido";
    try {
      await enviar({
        para: n.email,
        asunto: `Vibra 2027 — ${n.mensaje}`,
        texto: `${n.mensaje}

Ver la tarea: ${urlBase}/tareas/${n.tareaId}`,
      });
      estado = "enviado";
    } catch (error) {
      console.error(`[worker] no se pudo enviar el email de la notificación ${n.id}`, error);
      estado = n.intentos >= MAX_INTENTOS_EMAIL ? "fallido" : "pendiente";
    }
    await db.update(notificacion).set({ emailEstado: estado }).where(eq(notificacion.id, n.id));
  }
}
