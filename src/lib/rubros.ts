import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { grupo, rubro } from "@/db/schema";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";

// Catálogo de rubros de la productora. Cada evento elige cuáles usa (src/lib/evento-rubros.ts).

export const rubroSchema = z.object({
  nombre: z.string("Falta el nombre").trim().min(2, "El nombre es muy corto").max(80, "El nombre es muy largo"),
  grupoId: z.coerce.number("Grupo inválido").int("Grupo inválido").positive("Grupo inválido"),
});

export type DatosRubro = z.infer<typeof rubroSchema>;

const MENSAJES = { unico: "Ya existe un rubro con ese nombre", fk: "Grupo inválido" };

function consultaRubros(db: Db) {
  return db
    .select({ id: rubro.id, nombre: rubro.nombre, grupoId: rubro.grupoId, grupo: grupo.nombre })
    .from(rubro)
    .innerJoin(grupo, eq(rubro.grupoId, grupo.id));
}

export function listarRubros(db: Db) {
  return consultaRubros(db).orderBy(asc(grupo.orden), asc(rubro.nombre));
}

export async function obtenerRubro(db: Db, id: string) {
  const [fila] = await consultaRubros(db).where(eq(rubro.id, id));
  return fila;
}

export async function crearRubro(db: Db, datos: DatosRubro): Promise<string> {
  const [fila] = await conRestricciones(
    () => db.insert(rubro).values(datos).returning({ id: rubro.id }),
    MENSAJES,
  );
  return fila.id;
}

export async function editarRubro(db: Db, id: string, datos: DatosRubro): Promise<void> {
  const filas = await conRestricciones(
    () => db.update(rubro).set(datos).where(eq(rubro.id, id)).returning({ id: rubro.id }),
    MENSAJES,
  );
  if (filas.length === 0) throw new ErrorNegocio("El rubro no existe");
}

/** Un rubro usado en algún evento es historial: no se borra. */
export async function borrarRubro(db: Db, id: string): Promise<void> {
  const filas = await conRestricciones(
    () => db.delete(rubro).where(eq(rubro.id, id)).returning({ id: rubro.id }),
    { fk: "El rubro se usa en algún evento: no se puede borrar" },
  );
  if (filas.length === 0) throw new ErrorNegocio("El rubro no existe");
}
