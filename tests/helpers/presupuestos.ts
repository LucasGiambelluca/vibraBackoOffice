import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { rubro } from "@/db/schema";
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

/** Id de un rubro cargado por la migración de seed (todos son de 2 días). */
export async function idRubro(db: Db, nombre = "Sonido"): Promise<string> {
  const [fila] = await db.select({ id: rubro.id }).from(rubro).where(eq(rubro.nombre, nombre));
  return fila.id;
}

export function nuevoProveedor(db: Db, nombre = "Sonido Andino"): Promise<string> {
  return crearProveedor(db, proveedorSchema.parse({ nombre }));
}

/** Datos de formulario de una cotización: 1000 BOB por día, 10 % de descuento por 2 días. */
export const COTIZACION = { descripcion: "Equipo completo", moneda: "BOB", precioDia: "1000", descuento2Dias: "10" };

export function nuevaCotizacion(
  db: Db,
  rubroId: string,
  proveedorId: string,
  extra: Partial<typeof COTIZACION> = {},
): Promise<string> {
  return crearCotizacion(db, nuevaCotizacionSchema.parse({ ...COTIZACION, rubroId, proveedorId, ...extra }), null);
}
