import { z } from "zod";
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { marcarLeida, marcarTodasLeidas } from "@/lib/notificaciones";
import { exigir, type Actor } from "@/lib/permissions";

export function lecturaNotificacion(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "ver");
    const { notificacionId } = validar(
      z.object({ notificacionId: z.string("Notificación inválida").min(1, "Notificación inválida") }),
      datos,
    );
    await marcarLeida(db, actor.id, notificacionId);
  });
}

export function lecturaTodas(db: Db, actor: Actor): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "ver");
    await marcarTodasLeidas(db, actor.id);
  });
}
