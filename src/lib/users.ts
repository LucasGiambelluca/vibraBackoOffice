import { hashPassword } from "better-auth/crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { esViolacionUnica } from "@/db/errores";
import { account, session, user } from "@/db/schema";
import { ErrorNegocio } from "@/lib/acciones";
import { ROLES, type Rol } from "@/lib/permissions";

export { esViolacionUnica };

const passwordSchema = z
  .string("Falta la contraseña")
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(128, "La contraseña no puede tener más de 128 caracteres");

export const nuevoUsuarioSchema = z.object({
  nombre: z.string("Falta el nombre").trim().min(2, "El nombre es muy corto"),
  email: z.string("Falta el email").trim().toLowerCase().pipe(z.email("Email inválido")),
  password: passwordSchema,
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
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, recibirEmails: user.recibirEmails })
    .from(user)
    .orderBy(asc(user.name));
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Bloquea las filas de los admins hasta el fin de la transacción. Dos admins que se
 * degradan o se borran entre sí al mismo tiempo se ordenan acá: el segundo ve que el
 * primero ya no es admin y no puede dejar el sistema sin ninguno.
 */
async function bloquearAdmins(tx: Tx, actorId: string): Promise<string[]> {
  const admins = (await tx.select({ id: user.id }).from(user).where(eq(user.role, "admin")).for("update")).map((a) => a.id);
  if (!admins.includes(actorId)) throw new ErrorUsuario("Ya no sos admin");
  return admins;
}

export async function cambiarRol(db: Db, actorId: string, userId: string, rol: Rol): Promise<void> {
  if (actorId === userId) throw new ErrorUsuario("No podés cambiar tu propio rol");
  await db.transaction(async (tx) => {
    await bloquearAdmins(tx, actorId);
    const filas = await tx.update(user).set({ role: rol }).where(eq(user.id, userId)).returning({ id: user.id });
    if (filas.length === 0) throw new ErrorUsuario("El usuario no existe");
  });
}

export async function borrarUsuario(db: Db, actorId: string, userId: string): Promise<void> {
  if (actorId === userId) throw new ErrorUsuario("No podés borrar tu propio usuario");
  await db.transaction(async (tx) => {
    await bloquearAdmins(tx, actorId);
    // session y account se borran en cascada.
    const filas = await tx.delete(user).where(eq(user.id, userId)).returning({ id: user.id });
    if (filas.length === 0) throw new ErrorUsuario("El usuario no existe");
  });
}

export const nuevaContraseniaSchema = z.object({
  userId: z.string("Usuario inválido").min(1, "Usuario inválido"),
  password: passwordSchema,
});

/**
 * El admin le pone una contraseña nueva a otro usuario (que la olvidó). Se cierran todas sus
 * sesiones abiertas: si alguien más la usaba, queda afuera. La propia se cambia en Mi cuenta.
 */
export async function cambiarContraseniaDeUsuario(db: Db, actorId: string, userId: string, password: string): Promise<void> {
  if (actorId === userId) throw new ErrorUsuario("Tu contraseña la cambiás en Mi cuenta");
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await bloquearAdmins(tx, actorId);
    const filas = await tx
      .update(account)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (filas.length === 0) throw new ErrorUsuario("El usuario no existe");
    await tx.delete(session).where(eq(session.userId, userId));
  });
}

export async function cambiarRecibirEmails(db: Db, userId: string, recibir: boolean): Promise<void> {
  await db.update(user).set({ recibirEmails: recibir }).where(eq(user.id, userId));
}
