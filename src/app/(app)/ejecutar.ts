import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import type { Db } from "@/db/client";
import type { Resultado } from "@/lib/acciones";
import type { Actor } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";

/** Lógica de una server action, sin Next: se testea con una DB de prueba. */
export type Operacion = (db: Db, actor: Actor, datos: unknown) => Promise<Resultado>;

/** Corre la operación con el usuario logueado y los datos del formulario. */
export async function ejecutar(operacion: Operacion, formData: FormData): Promise<Resultado> {
  const resultado = await operacion(db, await usuarioActual(), Object.fromEntries(formData));
  // App chica: se revalida todo para que ninguna pantalla quede con datos viejos.
  if (resultado.ok) revalidatePath("/", "layout");
  return resultado;
}
