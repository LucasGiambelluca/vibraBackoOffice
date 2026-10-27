import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ErrorNegocio } from "@/lib/acciones";
import { MAX_ARCHIVO } from "@/lib/limites";

// Solo se leen/borran nombres generados acá: evita path traversal.
const NOMBRE_VALIDO = /^[0-9a-f-]{36}(-min)?\.(pdf|jpg|png|webp)$/;

export const TIPO_CONTENIDO: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Lado mayor de una foto guardada y de su miniatura, en píxeles. */
const LADO_FOTO = 2560;
const LADO_MINIATURA = 480;

export type ArchivoGuardado = {
  tipo: "pdf" | "imagen";
  guardado: string;
  miniatura: string | null;
  bytes: number;
};

function directorio(): string {
  return process.env.UPLOADS_DIR || "./.data/uploads";
}

/** Un input file vacío llega como File de tamaño 0. */
export function hayArchivo(valor: unknown): valor is File {
  return valor instanceof File && valor.size > 0;
}

async function escribir(nombre: string, bytes: Buffer): Promise<void> {
  await mkdir(directorio(), { recursive: true });
  await writeFile(path.join(directorio(), nombre), bytes);
}

/**
 * Tope de píxeles al decodificar: una foto de 50 MP entra; un PNG chico de 20.000 × 20.000
 * (pesa poco y ocupa GB en memoria al abrirlo) no.
 */
const MAX_PIXELES = 100_000_000;

/** El formato real de una imagen (por su contenido), o null si no es JPG, PNG ni WebP. */
async function formatoImagen(bytes: Buffer): Promise<"jpg" | "png" | "webp" | null> {
  let metadatos;
  try {
    // Solo lee el encabezado: el tamaño declarado se controla abajo, antes de decodificar.
    metadatos = await sharp(bytes, { limitInputPixels: false }).metadata();
  } catch {
    return null;
  }
  const { format, width = 0, height = 0 } = metadatos;
  if (width * height > MAX_PIXELES) throw new ErrorNegocio("La foto tiene demasiados píxeles (máximo 100 megapíxeles)");
  if (format === "jpeg") return "jpg";
  return format === "png" || format === "webp" ? format : null;
}

/**
 * Guarda un PDF tal cual, o una foto re-codificada: se aplica la rotación de la cámara, se
 * quitan los metadatos (GPS incluido) y se achica a LADO_FOTO. Las fotos llevan miniatura.
 * El tipo se decide por el contenido, no por la extensión ni el tipo que manda el navegador.
 */
export async function guardarArchivo(archivo: File): Promise<ArchivoGuardado> {
  if (archivo.size > MAX_ARCHIVO) throw new ErrorNegocio("El archivo supera los 10 MB");
  const bytes = Buffer.from(await archivo.arrayBuffer());
  const id = crypto.randomUUID();

  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
    const guardado = `${id}.pdf`;
    await escribir(guardado, bytes);
    return { tipo: "pdf", guardado, miniatura: null, bytes: bytes.length };
  }

  const formato = await formatoImagen(bytes);
  if (!formato) throw new ErrorNegocio("Solo se aceptan PDF o fotos (JPG, PNG o WebP)");

  const base = sharp(bytes, { limitInputPixels: MAX_PIXELES }).rotate();
  const achicada = base
    .clone()
    .resize({ width: LADO_FOTO, height: LADO_FOTO, fit: "inside", withoutEnlargement: true });
  const foto = await (
    formato === "jpg" ? achicada.jpeg({ quality: 85, mozjpeg: true }) : formato === "png" ? achicada.png() : achicada.webp({ quality: 85 })
  ).toBuffer();
  const miniatura = await base
    .clone()
    .resize({ width: LADO_MINIATURA, height: LADO_MINIATURA, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();

  const guardado = `${id}.${formato}`;
  const nombreMiniatura = `${id}-min.webp`;
  await escribir(guardado, foto);
  try {
    await escribir(nombreMiniatura, miniatura);
  } catch (error) {
    await borrarDelDisco([guardado]);
    throw error;
  }
  return { tipo: "imagen", guardado, miniatura: nombreMiniatura, bytes: foto.length };
}

/** Contenido del archivo, o null si el nombre no es válido o el archivo no existe. */
export async function leerArchivo(nombre: string): Promise<Buffer | null> {
  if (!NOMBRE_VALIDO.test(nombre)) return null;
  return readFile(path.join(directorio(), nombre)).catch(() => null);
}

/**
 * Borra archivos del disco sin fallar nunca: se llama cuando ninguna fila los usa, y un error
 * (p. ej. EBUSY en Windows) solo deja un archivo huérfano, que se registra.
 */
export async function borrarDelDisco(nombres: (string | null)[]): Promise<void> {
  for (const nombre of nombres) {
    if (!nombre || !NOMBRE_VALIDO.test(nombre)) continue;
    try {
      await rm(path.join(directorio(), nombre), { force: true });
    } catch (error) {
      console.error(`No se pudo borrar el archivo ${nombre}`, error);
    }
  }
}

/** Guarda el archivo (si vino) y corre `fn`; si `fn` falla, lo borra del disco. */
export async function conArchivoNuevo<T>(
  archivo: unknown,
  fn: (guardado: ArchivoGuardado | null) => Promise<T>,
): Promise<T> {
  const guardado = hayArchivo(archivo) ? await guardarArchivo(archivo) : null;
  try {
    return await fn(guardado);
  } catch (error) {
    if (guardado) await borrarDelDisco([guardado.guardado, guardado.miniatura]);
    throw error;
  }
}
