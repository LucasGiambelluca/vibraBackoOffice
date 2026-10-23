"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { esRol } from "@/lib/permissions";
import { exigirPermiso } from "@/lib/session";
import { borrarUsuario, cambiarRol, crearUsuario, ErrorUsuario, nuevoUsuarioSchema } from "@/lib/users";

const RUTA = "/configuracion/usuarios";

export type Resultado = { ok: true } | { ok: false; error: string };

export async function crearUsuarioAction(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("configurar");

  const parsed = nuevoUsuarioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await crearUsuario(db, parsed.data);
  } catch (error) {
    if (error instanceof ErrorUsuario) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath(RUTA);
  return { ok: true };
}

export async function cambiarRolAction(userId: string, formData: FormData): Promise<void> {
  const actor = await exigirPermiso("configurar");
  const rol = String(formData.get("rol"));
  if (!esRol(rol)) throw new Error("Rol inválido");
  await cambiarRol(db, actor.id, userId, rol);
  revalidatePath(RUTA);
}

export async function borrarUsuarioAction(userId: string): Promise<void> {
  const actor = await exigirPermiso("configurar");
  await borrarUsuario(db, actor.id, userId);
  revalidatePath(RUTA);
}
