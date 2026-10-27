/**
 * Prefijo donde vive la app (p. ej. "/backoffice" en https://rsgroupenter.com/backoffice).
 * Se fija al compilar: Next lo aplica solo a <Link>, redirect() y router; las URLs armadas a
 * mano (fetch, <a>, <img>, next/image) tienen que pasar por `conBase`.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const conBase = (ruta: string) => `${BASE_PATH}${ruta}`;
