import { z } from "zod";
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { borrarGrupo, crearGrupo, grupoSchema, moverGrupo, renombrarGrupo } from "@/lib/grupos";
import { exigir, type Actor } from "@/lib/permissions";
import { borrarRubro, crearRubro, editarRubro, rubroSchema } from "@/lib/rubros";

// Grupos y catálogo de rubros de la productora: solo el admin.

const grupoId = z.coerce.number("Grupo inválido").int("Grupo inválido").positive("Grupo inválido");
const rubroId = z.string("Rubro inválido").min(1, "Rubro inválido");

export function altaGrupo(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    await crearGrupo(db, validar(grupoSchema, datos));
  });
}

export function edicionGrupo(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { grupoId: id, ...valores } = validar(grupoSchema.extend({ grupoId }), datos);
    await renombrarGrupo(db, id, valores);
  });
}

export function movimientoGrupo(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { grupoId: id, direccion } = validar(
      z.object({ grupoId, direccion: z.enum(["arriba", "abajo"], "Dirección inválida") }),
      datos,
    );
    await moverGrupo(db, id, direccion);
  });
}

export function bajaGrupo(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    await borrarGrupo(db, validar(z.object({ grupoId }), datos).grupoId);
  });
}

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
    await borrarRubro(db, validar(z.object({ rubroId }), datos).rubroId);
  });
}
