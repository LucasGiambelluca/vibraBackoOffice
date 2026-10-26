import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { grupo } from "@/db/schema";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";

export const grupoSchema = z.object({
  nombre: z.string("Falta el nombre").trim().min(2, "El nombre es muy corto").max(80, "El nombre es muy largo"),
});

export type DatosGrupo = z.infer<typeof grupoSchema>;

const MENSAJES = { unico: "Ya existe un grupo con ese nombre" };

export function listarGrupos(db: Db) {
  return db.select().from(grupo).orderBy(asc(grupo.orden), asc(grupo.id));
}

/** Va al final de la lista. */
export async function crearGrupo(db: Db, datos: DatosGrupo): Promise<number> {
  const [fila] = await conRestricciones(
    () =>
      db
        .insert(grupo)
        .values({ ...datos, orden: sql`(select coalesce(max(${grupo.orden}), 0) + 1 from ${grupo})` })
        .returning({ id: grupo.id }),
    MENSAJES,
  );
  return fila.id;
}

export async function renombrarGrupo(db: Db, id: number, datos: DatosGrupo): Promise<void> {
  const filas = await conRestricciones(
    () => db.update(grupo).set(datos).where(eq(grupo.id, id)).returning({ id: grupo.id }),
    MENSAJES,
  );
  if (filas.length === 0) throw new ErrorNegocio("El grupo no existe");
}

/** Intercambia el orden con el grupo de al lado; en el borde no hace nada. */
export async function moverGrupo(db: Db, id: number, direccion: "arriba" | "abajo"): Promise<void> {
  await db.transaction(async (tx) => {
    const [actual] = await tx.select().from(grupo).where(eq(grupo.id, id)).for("update");
    if (!actual) throw new ErrorNegocio("El grupo no existe");
    const [vecino] = await tx
      .select()
      .from(grupo)
      .where(and(direccion === "arriba" ? lt(grupo.orden, actual.orden) : gt(grupo.orden, actual.orden)))
      .orderBy(direccion === "arriba" ? sql`${grupo.orden} desc` : asc(grupo.orden))
      .limit(1)
      .for("update");
    if (!vecino) return;
    await tx.update(grupo).set({ orden: vecino.orden }).where(eq(grupo.id, actual.id));
    await tx.update(grupo).set({ orden: actual.orden }).where(eq(grupo.id, vecino.id));
  });
}

export async function borrarGrupo(db: Db, id: number): Promise<void> {
  const filas = await conRestricciones(
    () => db.delete(grupo).where(eq(grupo.id, id)).returning({ id: grupo.id }),
    { fk: "El grupo tiene rubros o tareas: movelos a otro grupo primero" },
  );
  if (filas.length === 0) throw new ErrorNegocio("El grupo no existe");
}
