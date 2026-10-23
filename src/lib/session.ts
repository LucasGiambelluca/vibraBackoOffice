import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { exigir, type Accion } from "@/lib/permissions";

/** Usuario logueado; si no hay sesión redirige a /login. Una sola consulta por request. */
export const usuarioActual = cache(async () => {
  const sesion = await auth.api.getSession({ headers: await headers() });
  if (!sesion) redirect("/login");
  return { ...sesion.user, role: sesion.user.role ?? "" };
});

/** Usuario logueado con permiso para `accion`; si no lo tiene lanza ErrorPermiso. */
export async function exigirPermiso(accion: Accion) {
  const usuario = await usuarioActual();
  exigir(usuario, accion);
  return usuario;
}
