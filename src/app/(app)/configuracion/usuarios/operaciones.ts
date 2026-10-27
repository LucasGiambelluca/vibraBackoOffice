import { z } from "zod";
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { exigir, ROLES, type Actor } from "@/lib/permissions";
import {
  borrarUsuario,
  cambiarContraseniaDeUsuario,
  cambiarRol,
  crearUsuario,
  nuevaContraseniaSchema,
  nuevoUsuarioSchema,
} from "@/lib/users";

// Lógica de las server actions, sin dependencias de Next: se testea con una DB de prueba.
// `datos` llega del formulario (Object.fromEntries(formData)), por eso se valida siempre.

const usuarioIdSchema = z.object({ userId: z.string("Usuario inválido").min(1, "Usuario inválido") });
const cambioRolSchema = usuarioIdSchema.extend({ rol: z.enum(ROLES, "Rol inválido") });

export function altaUsuario(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    await crearUsuario(db, validar(nuevoUsuarioSchema, datos));
  });
}

export function cambioDeRol(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { userId, rol } = validar(cambioRolSchema, datos);
    await cambiarRol(db, actor.id, userId, rol);
  });
}

export function nuevaContrasenia(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { userId, password } = validar(nuevaContraseniaSchema, datos);
    await cambiarContraseniaDeUsuario(db, actor.id, userId, password);
  });
}

export function bajaUsuario(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { userId } = validar(usuarioIdSchema, datos);
    await borrarUsuario(db, actor.id, userId);
  });
}
