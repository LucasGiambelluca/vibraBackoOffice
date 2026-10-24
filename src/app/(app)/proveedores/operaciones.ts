import { z } from "zod";
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { exigir, type Actor } from "@/lib/permissions";
import { borrarProveedor, crearProveedor, editarProveedor, proveedorSchema } from "@/lib/proveedores";

const proveedorId = z.string("Proveedor inválido").min(1, "Proveedor inválido");

export function altaProveedor(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    await crearProveedor(db, validar(proveedorSchema, datos));
  });
}

export function edicionProveedor(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    const { proveedorId: id, ...valores } = validar(proveedorSchema.extend({ proveedorId }), datos);
    await editarProveedor(db, id, valores);
  });
}

export function bajaProveedor(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "borrar");
    const { proveedorId: id } = validar(z.object({ proveedorId }), datos);
    await borrarProveedor(db, id);
  });
}
