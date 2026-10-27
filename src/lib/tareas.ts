import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { evento, grupo, tarea, user } from "@/db/schema";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";
import { archivosEnCascada } from "@/lib/archivos";
import { borrarDelDisco } from "@/lib/archivos-disco";
import { asegurarEventoAbierto } from "@/lib/eventos";
import { cancelarPendientes, regenerarAutomaticos, type Tx } from "@/lib/recordatorios";
import { hoyEnLaPaz, sumarDias } from "@/lib/reminders";
import { fechaOpcional, idEntero, textoOpcional } from "@/lib/validacion";

export const ESTADOS_TAREA = ["pendiente", "en_curso", "hecha"] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

/** Campos editables. El evento se elige al crear y no cambia. */
export const tareaSchema = z.object({
  titulo: z.string("Falta el título").trim().min(2, "El título es muy corto").max(200, "El título es muy largo"),
  grupoId: idEntero("Grupo inválido"),
  responsableId: z
    .string()
    .optional()
    .transform((v) => v || null),
  fechaLimite: fechaOpcional(),
  notas: textoOpcional(2000),
});

export const nuevaTareaSchema = tareaSchema.extend({
  eventoId: z.string("Evento inválido").min(1, "Evento inválido"),
});

export type DatosTarea = z.infer<typeof tareaSchema>;
export type NuevaTarea = z.infer<typeof nuevaTareaSchema>;

const MENSAJES = { fk: "Grupo o responsable inválido" };

/** Bloquea la tarea; falla si no existe o su evento está cerrado. */
async function tareaAbierta(tx: Tx, id: string) {
  const [actual] = await tx
    .select({ fechaLimite: tarea.fechaLimite, estado: tarea.estado, eventoId: tarea.eventoId })
    .from(tarea)
    .where(eq(tarea.id, id))
    .for("update");
  if (!actual) throw new ErrorNegocio("La tarea no existe");
  await asegurarEventoAbierto(tx, actual.eventoId);
  return actual;
}

export async function crearTarea(
  db: Db,
  datos: NuevaTarea,
  creadoPor: string | null,
  ahora = new Date(),
): Promise<string> {
  return conRestricciones(
    () =>
      db.transaction(async (tx) => {
        await asegurarEventoAbierto(tx, datos.eventoId);
        const [fila] = await tx.insert(tarea).values({ ...datos, creadoPor }).returning({ id: tarea.id });
        await regenerarAutomaticos(tx, fila.id, datos.fechaLimite, false, ahora);
        return fila.id;
      }),
    MENSAJES,
  );
}

export async function editarTarea(db: Db, id: string, datos: DatosTarea, ahora = new Date()): Promise<void> {
  await conRestricciones(
    () =>
      db.transaction(async (tx) => {
        const actual = await tareaAbierta(tx, id);
        await tx.update(tarea).set(datos).where(eq(tarea.id, id));
        if (actual.fechaLimite !== datos.fechaLimite) {
          await regenerarAutomaticos(tx, id, datos.fechaLimite, actual.estado === "hecha", ahora);
        }
      }),
    MENSAJES,
  );
}

/** Hecha cancela todos los recordatorios pendientes; reabrir regenera los automáticos. */
export async function cambiarEstadoTarea(db: Db, id: string, estado: EstadoTarea, ahora = new Date()) {
  await db.transaction(async (tx) => {
    const actual = await tareaAbierta(tx, id);
    if (actual.estado === estado) return;

    await tx.update(tarea).set({ estado }).where(eq(tarea.id, id));
    if (estado === "hecha") await cancelarPendientes(tx, id, ahora);
    else if (actual.estado === "hecha") await regenerarAutomaticos(tx, id, actual.fechaLimite, false, ahora);
  });
}

/** Sus recordatorios y notificaciones se borran en cascada. */
export async function borrarTarea(db: Db, id: string): Promise<void> {
  const enDisco = await db.transaction(async (tx) => {
    await tareaAbierta(tx, id);
    const nombres = await archivosEnCascada(tx, "tareaId", id);
    await tx.delete(tarea).where(eq(tarea.id, id));
    return nombres;
  });
  await borrarDelDisco(enDisco);
}

function consultaTareas(db: Db) {
  return db
    .select({
      id: tarea.id,
      titulo: tarea.titulo,
      eventoId: tarea.eventoId,
      evento: evento.nombre,
      grupoId: tarea.grupoId,
      grupo: grupo.nombre,
      responsableId: tarea.responsableId,
      responsable: user.name,
      fechaLimite: tarea.fechaLimite,
      estado: tarea.estado,
      notas: tarea.notas,
      creadoPor: tarea.creadoPor,
    })
    .from(tarea)
    .innerJoin(evento, eq(tarea.eventoId, evento.id))
    .innerJoin(grupo, eq(tarea.grupoId, grupo.id))
    .leftJoin(user, eq(tarea.responsableId, user.id));
}

export type FiltroTareas = {
  eventoId?: string;
  /** Varios eventos a la vez (el tablero muestra los activos). */
  eventoIds?: string[];
  grupoId?: number;
  responsableId?: string;
  estado?: EstadoTarea;
};

/** Ordenadas por fecha límite (las sin fecha al final). */
export function listarTareas(db: Db, filtro: FiltroTareas = {}) {
  return consultaTareas(db)
    .where(
      and(
        filtro.eventoId ? eq(tarea.eventoId, filtro.eventoId) : undefined,
        filtro.eventoIds ? inArray(tarea.eventoId, filtro.eventoIds) : undefined,
        filtro.grupoId ? eq(tarea.grupoId, filtro.grupoId) : undefined,
        filtro.responsableId ? eq(tarea.responsableId, filtro.responsableId) : undefined,
        filtro.estado ? eq(tarea.estado, filtro.estado) : undefined,
      ),
    )
    .orderBy(sql`${tarea.fechaLimite} asc nulls last`, asc(tarea.createdAt));
}

export type TareaListada = Awaited<ReturnType<typeof listarTareas>>[number];

export async function obtenerTarea(db: Db, id: string) {
  const [fila] = await consultaTareas(db).where(eq(tarea.id, id));
  return fila;
}

/** Para el tablero: las vencidas y las que vencen en los próximos 7 días de esos eventos. */
export async function resumenTareas(db: Db, eventoIds: string[], ahora = new Date()) {
  if (eventoIds.length === 0) return { vencidas: [], proximas: [] };
  const tareas = await listarTareas(db, { eventoIds });
  const hoy = hoyEnLaPaz(ahora);
  const enUnaSemana = sumarDias(hoy, 7);

  // Las fechas "YYYY-MM-DD" se comparan bien como texto.
  const abiertas = tareas.filter((t): t is TareaListada & { fechaLimite: string } => t.estado !== "hecha" && !!t.fechaLimite);
  return {
    vencidas: abiertas.filter((t) => t.fechaLimite < hoy),
    proximas: abiertas.filter((t) => t.fechaLimite >= hoy && t.fechaLimite <= enUnaSemana),
  };
}
