import { z } from "zod";
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { exigir, type Actor } from "@/lib/permissions";
import { borrarRubro, crearRubro, editarRubro, rubroSchema } from "@/lib/rubros";

const rubroId = z.string("Rubro inválido").min(1, "Rubro inválido");

export function altaRubro(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    await crearRubro(db, validar(rubroSchema, datos));
  });
}

export function edicionRubro(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { rubroId: id, ...valores } = validar(rubroSchema.extend({ rubroId }), datos);
    await editarRubro(db, id, valores);
  });
}

export function bajaRubro(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { rubroId: id } = validar(z.object({ rubroId }), datos);
    await borrarRubro(db, id);
  });
}
