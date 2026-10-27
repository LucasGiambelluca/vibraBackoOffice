import { db } from "@/db";
import { obtenerArchivo } from "@/lib/archivos";
import { leerArchivo, TIPO_CONTENIDO } from "@/lib/archivos-disco";
import { auth } from "@/lib/auth";

/** Sirve un archivo (o su miniatura con `?min=1`) a quien tenga sesión. `?descargar=1` lo baja. */
export async function GET(request: Request, ctx: RouteContext<"/api/archivos/[id]">) {
  const sesion = await auth.api.getSession({ headers: request.headers });
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const { id } = await ctx.params;
  const url = new URL(request.url);
  const fila = await obtenerArchivo(db, id);
  const nombreEnDisco = url.searchParams.has("min") ? fila?.miniatura : fila?.guardado;
  const contenido = nombreEnDisco ? await leerArchivo(nombreEnDisco) : null;
  if (!fila || !nombreEnDisco || !contenido) return new Response("No encontrado", { status: 404 });

  const extension = nombreEnDisco.split(".").pop()!;
  const modo = url.searchParams.has("descargar") ? "attachment" : "inline";
  return new Response(new Uint8Array(contenido), {
    headers: {
      "Content-Type": TIPO_CONTENIDO[extension],
      "Content-Disposition": `${modo}; filename*=UTF-8''${encodeURIComponent(fila.nombre)}`,
      // Poco tiempo en la caché del navegador: después de cerrar sesión o borrar el archivo
      // no tiene que seguir a mano en un equipo compartido.
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
