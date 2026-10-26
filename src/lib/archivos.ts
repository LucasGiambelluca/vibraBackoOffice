import { and, asc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Db } from "@/db/client";
import { archivo, cotizacion, eventoRubro, proveedor, rubro, tarea, user } from "@/db/schema";
import { ErrorNegocio } from "@/lib/acciones";
import { borrarDelDisco, type ArchivoGuardado } from "@/lib/archivos-disco";
import { asegurarEventoAbierto } from "@/lib/eventos";
import { can, ErrorPermiso, type Actor } from "@/lib/permissions";
import type { Tx } from "@/lib/recordatorios";

export const TIPOS_DUENIO = ["evento", "rubro", "cotizacion", "tarea"] as const;

/** De qué es un archivo. `rubro` es el rubro dentro del evento (evento_rubro). */
export type Duenio = { tipo: (typeof TIPOS_DUENIO)[number]; id: string };

export const duenioSchema = z.object({
  duenioTipo: z.enum(TIPOS_DUENIO, "Destino inválido"),
  duenioId: z.string("Destino inválido").min(1, "Destino inválido"),
});

/** Columnas de `archivo` que apuntan al dueño (ninguna para un archivo del evento). */
function columnasDuenio(d: Duenio) {
  if (d.tipo === "rubro") return { eventoRubroId: d.id };
  if (d.tipo === "cotizacion") return { cotizacionId: d.id };
  if (d.tipo === "tarea") return { tareaId: d.id };
  return {};
}

/** El evento del dueño; falla si el dueño no existe o el evento está cerrado. */
async function eventoAbiertoDe(tx: Tx, d: Duenio): Promise<string> {
  let fila: { eventoId: string } | undefined;
  if (d.tipo === "evento") fila = { eventoId: d.id };
  else if (d.tipo === "rubro")
    [fila] = await tx.select({ eventoId: eventoRubro.eventoId }).from(eventoRubro).where(eq(eventoRubro.id, d.id));
  else if (d.tipo === "cotizacion")
    [fila] = await tx
      .select({ eventoId: eventoRubro.eventoId })
      .from(cotizacion)
      .innerJoin(eventoRubro, eq(cotizacion.eventoRubroId, eventoRubro.id))
      .where(eq(cotizacion.id, d.id));
  else [fila] = await tx.select({ eventoId: tarea.eventoId }).from(tarea).where(eq(tarea.id, d.id));
  if (!fila) throw new ErrorNegocio("No existe dónde subir el archivo");
  await asegurarEventoAbierto(tx, fila.eventoId);
  return fila.eventoId;
}

/** Inserta la fila de un archivo ya guardado en disco, dentro de una transacción abierta. */
export async function insertarArchivo(
  tx: Tx,
  eventoId: string,
  d: Duenio,
  guardado: ArchivoGuardado,
  nombre: string,
  subidoPor: string | null,
): Promise<string> {
  const [fila] = await tx
    .insert(archivo)
    .values({ eventoId, ...columnasDuenio(d), ...guardado, nombre: nombre.slice(0, 200) || "archivo", subidoPor })
    .returning({ id: archivo.id });
  return fila.id;
}

export async function subirArchivo(
  db: Db,
  d: Duenio,
  guardado: ArchivoGuardado,
  nombre: string,
  subidoPor: string | null,
): Promise<string> {
  return db.transaction(async (tx) => insertarArchivo(tx, await eventoAbiertoDe(tx, d), d, guardado, nombre, subidoPor));
}

/** Lo borra quien lo subió o quien puede borrar (admin); con el evento abierto. */
export async function borrarArchivo(db: Db, actor: Actor, id: string): Promise<void> {
  const fila = await db.transaction(async (tx) => {
    const [actual] = await tx.select().from(archivo).where(eq(archivo.id, id));
    if (!actual) throw new ErrorNegocio("El archivo no existe");
    if (actual.subidoPor !== actor.id && !can(actor.role, "borrar")) throw new ErrorPermiso();
    await asegurarEventoAbierto(tx, actual.eventoId);
    await tx.delete(archivo).where(eq(archivo.id, id));
    return actual;
  });
  await borrarDelDisco([fila.guardado, fila.miniatura]);
}

/**
 * Nombres en disco de los archivos que se van a borrar en cascada con su dueño. Se llama en la
 * transacción que borra el dueño; después del commit se pasan a `borrarDelDisco`.
 */
export async function archivosEnCascada(
  tx: Tx,
  columna: "eventoRubroId" | "cotizacionId" | "tareaId",
  id: string,
): Promise<(string | null)[]> {
  const filas = await tx
    .select({ guardado: archivo.guardado, miniatura: archivo.miniatura })
    .from(archivo)
    .where(eq(archivo[columna], id));
  return filas.flatMap((f) => [f.guardado, f.miniatura]);
}

/** Para servir un archivo por su id. */
export async function obtenerArchivo(db: Db, id: string) {
  const [fila] = await db
    .select({ nombre: archivo.nombre, guardado: archivo.guardado, miniatura: archivo.miniatura })
    .from(archivo)
    .where(eq(archivo.id, id));
  return fila;
}

const erDeCotizacion = alias(eventoRubro, "er_cotizacion");
const rubroDirecto = alias(rubro, "rubro_directo");
const rubroDeCotizacion = alias(rubro, "rubro_cotizacion");

async function consultar(db: Db, filtro: SQL | undefined) {
  const filas = await db
    .select({
      id: archivo.id,
      eventoId: archivo.eventoId,
      tipo: archivo.tipo,
      nombre: archivo.nombre,
      conMiniatura: archivo.miniatura,
      bytes: archivo.bytes,
      subidoPor: archivo.subidoPor,
      subidor: user.name,
      createdAt: archivo.createdAt,
      eventoRubroId: archivo.eventoRubroId,
      rubro: rubroDirecto.nombre,
      cotizacionId: archivo.cotizacionId,
      cotizacionRubroId: cotizacion.eventoRubroId,
      cotizacionRubro: rubroDeCotizacion.nombre,
      proveedor: proveedor.nombre,
      tareaId: archivo.tareaId,
      tarea: tarea.titulo,
    })
    .from(archivo)
    .leftJoin(user, eq(archivo.subidoPor, user.id))
    .leftJoin(eventoRubro, eq(archivo.eventoRubroId, eventoRubro.id))
    .leftJoin(rubroDirecto, eq(eventoRubro.rubroId, rubroDirecto.id))
    .leftJoin(cotizacion, eq(archivo.cotizacionId, cotizacion.id))
    .leftJoin(erDeCotizacion, eq(cotizacion.eventoRubroId, erDeCotizacion.id))
    .leftJoin(rubroDeCotizacion, eq(erDeCotizacion.rubroId, rubroDeCotizacion.id))
    .leftJoin(proveedor, eq(cotizacion.proveedorId, proveedor.id))
    .leftJoin(tarea, eq(archivo.tareaId, tarea.id))
    .where(filtro)
    .orderBy(asc(archivo.createdAt), asc(archivo.id));

  return filas.map((f) => {
    const base = `/eventos/${f.eventoId}`;
    // Dónde está el archivo, para la pestaña Archivos del evento.
    const donde = f.eventoRubroId
      ? { texto: `Rubro ${f.rubro}`, href: `${base}/rubros/${f.eventoRubroId}` }
      : f.cotizacionId
        ? {
            texto: `Cotización de ${f.proveedor} · ${f.cotizacionRubro}`,
            href: `${base}/rubros/${f.cotizacionRubroId}/${f.cotizacionId}`,
          }
        : f.tareaId
          ? { texto: `Tarea ${f.tarea}`, href: `${base}/tareas/${f.tareaId}` }
          : null;
    return {
      id: f.id,
      tipo: f.tipo,
      nombre: f.nombre,
      conMiniatura: f.conMiniatura !== null,
      bytes: f.bytes,
      subidoPor: f.subidoPor,
      subidor: f.subidor,
      createdAt: f.createdAt,
      cotizacionId: f.cotizacionId,
      donde,
    };
  });
}

export type ArchivoListado = Awaited<ReturnType<typeof consultar>>[number];

/** Los archivos de un dueño. Para un evento, solo los del evento (no los de sus rubros, etc.). */
export function listarArchivos(db: Db, d: Duenio): Promise<ArchivoListado[]> {
  if (d.tipo === "evento")
    return consultar(
      db,
      and(eq(archivo.eventoId, d.id), isNull(archivo.eventoRubroId), isNull(archivo.cotizacionId), isNull(archivo.tareaId)),
    );
  const columna = { rubro: archivo.eventoRubroId, cotizacion: archivo.cotizacionId, tarea: archivo.tareaId }[d.tipo];
  return consultar(db, eq(columna, d.id));
}

/** Todos los archivos del evento: los suyos y los de sus rubros, cotizaciones y tareas. */
export function listarArchivosEvento(db: Db, eventoId: string): Promise<ArchivoListado[]> {
  return consultar(db, eq(archivo.eventoId, eventoId));
}

/** Los archivos de varias cotizaciones a la vez (para la lista de un rubro). */
export async function archivosPorCotizacion(db: Db, ids: string[]): Promise<Map<string, ArchivoListado[]>> {
  const mapa = new Map<string, ArchivoListado[]>();
  if (ids.length === 0) return mapa;
  for (const a of await consultar(db, inArray(archivo.cotizacionId, ids))) {
    mapa.set(a.cotizacionId!, [...(mapa.get(a.cotizacionId!) ?? []), a]);
  }
  return mapa;
}
