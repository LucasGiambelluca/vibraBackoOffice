import { hashPassword } from "better-auth/crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { esViolacionUnica } from "@/db/errores";
import { account, user } from "@/db/schema";
import { ErrorNegocio } from "@/lib/acciones";
import { ROLES, type Rol } from "@/lib/permissions";

export { esViolacionUnica };

export const nuevoUsuarioSchema = z.object({
  nombre: z.string("Falta el nombre").trim().min(2, "El nombre es muy corto"),
  email: z.string("Falta el email").trim().toLowerCase().pipe(z.email("Email inválido")),
  password: z
    .string("Falta la contraseña")
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(128, "La contraseña no puede tener más de 128 caracteres"),
  rol: z.enum(ROLES, "Rol inválido"),
});

export type NuevoUsuario = z.infer<typeof nuevoUsuarioSchema>;

/** Error de regla de negocio: su mensaje se puede mostrar al usuario. */
export class ErrorUsuario extends ErrorNegocio {}

export async function crearUsuario(db: Db, datos: NuevoUsuario): Promise<string> {
  const existente = await db.select({ id: user.id }).from(user).where(eq(user.email, datos.email)).limit(1);
  if (existente.length > 0) throw new ErrorUsuario("Ya existe un usuario con ese email");

  const id = crypto.randomUUID();
  const hash = await hashPassword(datos.password);

  // Mismo formato que crea Better Auth en un registro con email y contraseña.
  try {
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
  } catch (error) {
    // Dos altas simultáneas con el mismo email pasan el chequeo de arriba.
    if (esViolacionUnica(error)) throw new ErrorUsuario("Ya existe un usuario con ese email");
    throw error;
  }

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
  const filas = await db.update(user).set({ role: rol }).where(eq(user.id, userId)).returning({ id: user.id });
  if (filas.length === 0) throw new ErrorUsuario("El usuario no existe");
}

export async function borrarUsuario(db: Db, actorId: string, userId: string): Promise<void> {
  if (actorId === userId) throw new ErrorUsuario("No podés borrar tu propio usuario");
  // session y account se borran en cascada.
  const filas = await db.delete(user).where(eq(user.id, userId)).returning({ id: user.id });
  if (filas.length === 0) throw new ErrorUsuario("El usuario no existe");
}

export async function cambiarRecibirEmails(db: Db, userId: string, recibir: boolean): Promise<void> {
  await db.update(user).set({ recibirEmails: recibir }).where(eq(user.id, userId));
}
