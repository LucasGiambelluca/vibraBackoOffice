"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import type { Db } from "@/db/client";
import type { Resultado } from "@/lib/acciones";
import type { Actor } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";
import { altaUsuario, bajaUsuario, cambioDeRol } from "./operaciones";

const RUTA = "/configuracion/usuarios";

type Operacion = (db: Db, actor: Actor, datos: unknown) => Promise<Resultado>;

async function ejecutar(operacion: Operacion, formData: FormData): Promise<Resultado> {
  const resultado = await operacion(db, await usuarioActual(), Object.fromEntries(formData));
  if (resultado.ok) revalidatePath(RUTA);
  return resultado;
}

export async function crearUsuarioAction(_previo: Resultado | null, formData: FormData) {
  return ejecutar(altaUsuario, formData);
}

export async function cambiarRolAction(_previo: Resultado | null, formData: FormData) {
  return ejecutar(cambioDeRol, formData);
}

export async function borrarUsuarioAction(_previo: Resultado | null, formData: FormData) {
  return ejecutar(bajaUsuario, formData);
}
