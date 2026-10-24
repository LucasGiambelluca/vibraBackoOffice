import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ErrorNegocio } from "@/lib/acciones";
import { MAX_ADJUNTO } from "@/lib/limites";

// Solo se leen/borran nombres generados por guardarPdf: evita path traversal.
const NOMBRE_VALIDO = /^[0-9a-f-]{36}\.pdf$/;

function directorio(): string {
  return process.env.UPLOADS_DIR || "./.data/uploads";
}

/** Un input file vacío llega como File de tamaño 0. */
export function hayArchivo(valor: unknown): valor is File {
  return valor instanceof File && valor.size > 0;
}

export async function guardarPdf(archivo: File): Promise<string> {
  if (archivo.size > MAX_ADJUNTO) throw new ErrorNegocio("El adjunto supera los 10 MB");
  const bytes = Buffer.from(await archivo.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new ErrorNegocio("El adjunto debe ser un PDF");

  const nombre = `${crypto.randomUUID()}.pdf`;
  await mkdir(directorio(), { recursive: true });
  await writeFile(path.join(directorio(), nombre), bytes);
  return nombre;
}

/** Contenido del PDF, o null si el nombre no es válido o el archivo no existe. */
export async function leerPdf(nombre: string): Promise<Buffer | null> {
  if (!NOMBRE_VALIDO.test(nombre)) return null;
  return readFile(path.join(directorio(), nombre)).catch(() => null);
}

export async function borrarPdf(nombre: string | null): Promise<void> {
  if (nombre && NOMBRE_VALIDO.test(nombre)) await rm(path.join(directorio(), nombre), { force: true });
}

/** Guarda el PDF (si vino) y corre `fn` con su nombre; si `fn` falla, borra el archivo guardado. */
export async function conPdfNuevo(archivo: unknown, fn: (nombre: string | null) => Promise<void>): Promise<void> {
  const nombre = hayArchivo(archivo) ? await guardarPdf(archivo) : null;
  try {
    await fn(nombre);
  } catch (error) {
    await borrarPdf(nombre);
    throw error;
  }
}
