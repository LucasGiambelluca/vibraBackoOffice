import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { exigir, type Actor } from "@/lib/permissions";
import { guardarTipoCambio, tipoCambioSchema } from "@/lib/tipos-cambio";

export function actualizacionTipoCambio(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    await guardarTipoCambio(db, validar(tipoCambioSchema, datos), actor.id);
  });
}
