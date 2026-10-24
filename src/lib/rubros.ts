import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { area, rubro } from "@/db/schema";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";

export const rubroSchema = z.object({
  nombre: z.string("Falta el nombre").trim().min(2, "El nombre es muy corto").max(80, "El nombre es muy largo"),
  areaId: z.coerce.number("Área inválida").int("Área inválida").positive("Área inválida"),
  dias: z.enum(["1", "2"], "Los días deben ser 1 o 2").transform(Number),
});

export type DatosRubro = z.infer<typeof rubroSchema>;

const MENSAJES = { unico: "Ya existe un rubro con ese nombre", fk: "Área inválida" };

export function listarAreas(db: Db) {
  return db.select().from(area).orderBy(asc(area.id));
}

function consultaRubros(db: Db) {
  return db
    .select({ id: rubro.id, nombre: rubro.nombre, dias: rubro.dias, areaId: rubro.areaId, area: area.nombre })
    .from(rubro)
    .innerJoin(area, eq(rubro.areaId, area.id));
}

export function listarRubros(db: Db) {
  return consultaRubros(db).orderBy(asc(area.id), asc(rubro.nombre));
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

export async function borrarRubro(db: Db, id: string): Promise<void> {
  const filas = await conRestricciones(
    () => db.delete(rubro).where(eq(rubro.id, id)).returning({ id: rubro.id }),
    { fk: "El rubro tiene cotizaciones: borralas primero" },
  );
  if (filas.length === 0) throw new ErrorNegocio("El rubro no existe");
}
