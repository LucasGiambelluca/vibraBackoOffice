import { asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { proveedor } from "@/db/schema";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";
import { textoOpcional } from "@/lib/validacion";

export const proveedorSchema = z.object({
  nombre: z.string("Falta el nombre").trim().min(2, "El nombre es muy corto").max(120, "El nombre es muy largo"),
  contacto: textoOpcional(120),
  telefono: textoOpcional(40),
  email: textoOpcional(120).refine((v) => v === null || z.email().safeParse(v).success, "Email inválido"),
  notas: textoOpcional(2000),
});

export type DatosProveedor = z.infer<typeof proveedorSchema>;

const MENSAJES = { unico: "Ya existe un proveedor con ese nombre" };

/** Proveedores ordenados por nombre; `busqueda` filtra por nombre o contacto. */
export function listarProveedores(db: Db, busqueda = "") {
  // % y _ son comodines de LIKE: se buscan como texto.
  const patron = `%${busqueda.replace(/[\\%_]/g, "\\$&")}%`;
  return db
    .select()
    .from(proveedor)
    .where(busqueda ? or(ilike(proveedor.nombre, patron), ilike(proveedor.contacto, patron)) : undefined)
    .orderBy(asc(proveedor.nombre));
}

export async function obtenerProveedor(db: Db, id: string) {
  const [fila] = await db.select().from(proveedor).where(eq(proveedor.id, id));
  return fila;
}

export async function crearProveedor(db: Db, datos: DatosProveedor): Promise<string> {
  const [fila] = await conRestricciones(
    () => db.insert(proveedor).values(datos).returning({ id: proveedor.id }),
    MENSAJES,
  );
  return fila.id;
}

export async function editarProveedor(db: Db, id: string, datos: DatosProveedor): Promise<void> {
  const filas = await conRestricciones(
    () => db.update(proveedor).set(datos).where(eq(proveedor.id, id)).returning({ id: proveedor.id }),
    MENSAJES,
  );
  if (filas.length === 0) throw new ErrorNegocio("El proveedor no existe");
}

export async function borrarProveedor(db: Db, id: string): Promise<void> {
  const filas = await conRestricciones(
    () => db.delete(proveedor).where(eq(proveedor.id, id)).returning({ id: proveedor.id }),
    { fk: "El proveedor tiene cotizaciones: borralas primero" },
  );
  if (filas.length === 0) throw new ErrorNegocio("El proveedor no existe");
}
