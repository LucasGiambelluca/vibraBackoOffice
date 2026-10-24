import type { Db } from "@/db/client";
import { intentar, type Resultado } from "@/lib/acciones";
import { exigir, type Actor } from "@/lib/permissions";
import { cambiarRecibirEmails } from "@/lib/users";

/** Un checkbox sin marcar no viaja en el formulario: ausente = no recibir. */
export function preferenciaEmails(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "ver");
    const { recibirEmails } = (datos ?? {}) as { recibirEmails?: unknown };
    await cambiarRecibirEmails(db, actor.id, recibirEmails === "on");
  });
}
