import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Un PDF mínimo (alcanza con la firma `%PDF-`). */
export const pdf = (contenido = "%PDF-1.4 prueba") => new File([contenido], "cotizacion.pdf", { type: "application/pdf" });

/** Apunta UPLOADS_DIR a una carpeta temporal nueva y la devuelve. */
export function usarUploadsTemporal(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "vibra-uploads-"));
  process.env.UPLOADS_DIR = dir;
  return dir;
}
