import { db } from "@/db";
import { auth } from "@/lib/auth";
import { contarNoLeidas, listarNotificaciones } from "@/lib/notificaciones";

/** Lo consulta la campanita al montar y cada minuto. */
export async function GET(request: Request) {
  const sesion = await auth.api.getSession({ headers: request.headers });
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const [noLeidas, items] = await Promise.all([
    contarNoLeidas(db, sesion.user.id),
    listarNotificaciones(db, sesion.user.id),
  ]);
  return Response.json({ noLeidas, items }, { headers: { "Cache-Control": "private, no-store" } });
}
