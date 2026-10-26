/** Tamaño máximo de un archivo subido. Lo chequean el formulario (cliente) y el servidor. */
export const MAX_ARCHIVO = 10 * 1024 * 1024;

/** Lo que se puede subir; el servidor igual lo verifica por el contenido. */
export const TIPOS_ACEPTADOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
