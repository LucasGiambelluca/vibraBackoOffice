import type { Db } from "@/db/client";
import type { Actor } from "@/lib/permissions";
import { crearUsuario, nuevoUsuarioSchema } from "@/lib/users";

export const SIN_PERMISO = { ok: false, error: "No tenés permiso para hacer esto" };

/** Un admin y un editor reales (las FK de creado_por / actualizado_por apuntan a user). */
export async function crearActores(db: Db): Promise<{ admin: Actor; editor: Actor }> {
  const alta = (email: string, rol: string) =>
    crearUsuario(db, nuevoUsuarioSchema.parse({ nombre: email, email, password: "secreto123", rol }));
  return {
    admin: { id: await alta("admin@vibra.bo", "admin"), role: "admin" },
    editor: { id: await alta("editor@vibra.bo", "editor"), role: "editor" },
  };
}
