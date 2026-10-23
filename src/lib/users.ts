import { hashPassword } from "better-auth/crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { account, user } from "@/db/schema";
import { ROLES, type Rol } from "@/lib/permissions";

export const nuevoUsuarioSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es muy corto"),
  email: z.string().trim().toLowerCase().pipe(z.email("Email inválido")),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  rol: z.enum(ROLES, "Rol inválido"),
});

export type NuevoUsuario = z.infer<typeof nuevoUsuarioSchema>;

/** Error de regla de negocio: su mensaje se puede mostrar al usuario. */
export class ErrorUsuario extends Error {}

export async function crearUsuario(db: Db, datos: NuevoUsuario): Promise<string> {
  const existente = await db.select({ id: user.id }).from(user).where(eq(user.email, datos.email)).limit(1);
  if (existente.length > 0) throw new ErrorUsuario("Ya existe un usuario con ese email");

  const id = crypto.randomUUID();
  const hash = await hashPassword(datos.password);

  // Mismo formato que crea Better Auth en un registro con email y contraseña.
  await db.transaction(async (tx) => {
    await tx.insert(user).values({ id, name: datos.nombre, email: datos.email, emailVerified: true, role: datos.rol });
    await tx.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hash,
    });
  });

  return id;
}

export async function listarUsuarios(db: Db) {
  return db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .orderBy(asc(user.name));
}

export async function cambiarRol(db: Db, actorId: string, userId: string, rol: Rol): Promise<void> {
  if (actorId === userId) throw new ErrorUsuario("No podés cambiar tu propio rol");
  await db.update(user).set({ role: rol }).where(eq(user.id, userId));
}

export async function borrarUsuario(db: Db, actorId: string, userId: string): Promise<void> {
  if (actorId === userId) throw new ErrorUsuario("No podés borrar tu propio usuario");
  // session y account se borran en cascada.
  await db.delete(user).where(eq(user.id, userId));
}
