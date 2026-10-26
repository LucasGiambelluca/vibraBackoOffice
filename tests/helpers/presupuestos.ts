import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { evento, eventoRubro, rubro } from "@/db/schema";
import { crearCotizacion, nuevaCotizacionSchema } from "@/lib/cotizaciones";
import { crearProveedor, proveedorSchema } from "@/lib/proveedores";

/** Un PDF mínimo (alcanza con la firma `%PDF-`). */
export const pdf = (contenido = "%PDF-1.4 prueba") => new File([contenido], "cotizacion.pdf", { type: "application/pdf" });

/** Apunta UPLOADS_DIR a una carpeta temporal nueva y la devuelve. */
export function usarUploadsTemporal(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "vibra-uploads-"));
  process.env.UPLOADS_DIR = dir;
  return dir;
}

/** Id de un rubro del catálogo cargado por la migración de seed. */
export async function idRubro(db: Db, nombre = "Sonido"): Promise<string> {
  const [fila] = await db.select({ id: rubro.id }).from(rubro).where(eq(rubro.nombre, nombre));
  return fila.id;
}

/** Id del evento que crea la migración 0007 (todos sus rubros son de 2 días). */
export async function idVibra(db: Db): Promise<string> {
  const [fila] = await db.select({ id: evento.id }).from(evento).where(eq(evento.nombre, "Vibra Bolivia 2027"));
  return fila.id;
}

/** Id del rubro `nombre` dentro del evento (por defecto, Vibra Bolivia 2027). */
export async function idEventoRubro(db: Db, nombre = "Sonido", eventoId?: string): Promise<string> {
  const [fila] = await db
    .select({ id: eventoRubro.id })
    .from(eventoRubro)
    .innerJoin(rubro, eq(eventoRubro.rubroId, rubro.id))
    .where(and(eq(rubro.nombre, nombre), eq(eventoRubro.eventoId, eventoId ?? (await idVibra(db)))));
  return fila.id;
}

export function nuevoProveedor(db: Db, nombre = "Sonido Andino"): Promise<string> {
  return crearProveedor(db, proveedorSchema.parse({ nombre }));
}

/** Datos de formulario de una cotización: 1000 ARS por día, 10 % de descuento por 2 días. */
export const COTIZACION = { descripcion: "Equipo completo", moneda: "ARS", precioDia: "1000", descuento2Dias: "10" };

export function nuevaCotizacion(
  db: Db,
  eventoRubroId: string,
  proveedorId: string,
  extra: Partial<typeof COTIZACION> = {},
): Promise<string> {
  return crearCotizacion(db, nuevaCotizacionSchema.parse({ ...COTIZACION, eventoRubroId, proveedorId, ...extra }), null);
}
