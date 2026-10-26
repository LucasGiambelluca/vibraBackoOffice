import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { area, tarea, user } from "@/db/schema";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";
import { cancelarPendientes, regenerarAutomaticos } from "@/lib/recordatorios";
import { hoyEnLaPaz, sumarDias } from "@/lib/reminders";
import { fechaOpcional, textoOpcional } from "@/lib/validacion";

export const ESTADOS_TAREA = ["pendiente", "en_curso", "hecha"] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

export const tareaSchema = z.object({
  titulo: z.string("Falta el título").trim().min(2, "El título es muy corto").max(200, "El título es muy largo"),
  areaId: z.coerce.number("Área inválida").int("Área inválida").positive("Área inválida"),
  responsableId: z
    .string()
    .optional()
    .transform((v) => v || null),
  fechaLimite: fechaOpcional(),
  notas: textoOpcional(2000),
});

export type DatosTarea = z.infer<typeof tareaSchema>;

const MENSAJES = { fk: "Área o responsable inválido" };

export async function crearTarea(
  db: Db,
  datos: DatosTarea,
  creadoPor: string | null,
  ahora = new Date(),
): Promise<string> {
  return conRestricciones(
    () =>
      db.transaction(async (tx) => {
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
        const [actual] = await tx
          .select({ fechaLimite: tarea.fechaLimite, estado: tarea.estado })
          .from(tarea)
          .where(eq(tarea.id, id))
          .for("update");
        if (!actual) throw new ErrorNegocio("La tarea no existe");

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
    const [actual] = await tx
      .select({ fechaLimite: tarea.fechaLimite, estado: tarea.estado })
      .from(tarea)
      .where(eq(tarea.id, id))
      .for("update");
    if (!actual) throw new ErrorNegocio("La tarea no existe");
    if (actual.estado === estado) return;

    await tx.update(tarea).set({ estado }).where(eq(tarea.id, id));
    if (estado === "hecha") await cancelarPendientes(tx, id, ahora);
    else if (actual.estado === "hecha") await regenerarAutomaticos(tx, id, actual.fechaLimite, false, ahora);
  });
}

/** Sus recordatorios y notificaciones se borran en cascada. */
export async function borrarTarea(db: Db, id: string): Promise<void> {
  const filas = await db.delete(tarea).where(eq(tarea.id, id)).returning({ id: tarea.id });
  if (filas.length === 0) throw new ErrorNegocio("La tarea no existe");
}

function consultaTareas(db: Db) {
  return db
    .select({
      id: tarea.id,
      titulo: tarea.titulo,
      areaId: tarea.areaId,
      area: area.nombre,
      responsableId: tarea.responsableId,
      responsable: user.name,
      fechaLimite: tarea.fechaLimite,
      estado: tarea.estado,
      notas: tarea.notas,
      creadoPor: tarea.creadoPor,
    })
    .from(tarea)
    .innerJoin(area, eq(tarea.areaId, area.id))
    .leftJoin(user, eq(tarea.responsableId, user.id));
}

export type FiltroTareas = { areaId?: number; responsableId?: string; estado?: EstadoTarea };

/** Ordenadas por fecha límite (las sin fecha al final). */
export function listarTareas(db: Db, filtro: FiltroTareas = {}) {
  return consultaTareas(db)
    .where(
      and(
        filtro.areaId ? eq(tarea.areaId, filtro.areaId) : undefined,
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

/** Para el tablero: avance por área, vencidas y las que vencen en los próximos 7 días. */
export async function resumenTareas(db: Db, ahora = new Date()) {
  const tareas = await listarTareas(db);
  const hoy = hoyEnLaPaz(ahora);
  const enUnaSemana = sumarDias(hoy, 7);

  const porArea = new Map<number, { hechas: number; total: number }>();
  for (const t of tareas) {
    const actual = porArea.get(t.areaId) ?? { hechas: 0, total: 0 };
    porArea.set(t.areaId, { hechas: actual.hechas + (t.estado === "hecha" ? 1 : 0), total: actual.total + 1 });
  }

  // Las fechas "YYYY-MM-DD" se comparan bien como texto.
  const abiertas = tareas.filter((t): t is TareaListada & { fechaLimite: string } => t.estado !== "hecha" && !!t.fechaLimite);
  return {
    porArea,
    vencidas: abiertas.filter((t) => t.fechaLimite < hoy),
    proximas: abiertas.filter((t) => t.fechaLimite >= hoy && t.fechaLimite <= enUnaSemana),
  };
}
