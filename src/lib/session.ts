import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, type Accion } from "@/lib/permissions";

/** Usuario logueado; si no hay sesión redirige a /login. */
export async function usuarioActual() {
  const sesion = await auth.api.getSession({ headers: await headers() });
  if (!sesion) redirect("/login");
  return sesion.user;
}

/** Para server actions: corta con error si el rol no tiene permiso. */
export async function exigirPermiso(accion: Accion) {
  const usuario = await usuarioActual();
  if (!can(usuario.role ?? "", accion)) throw new Error("No autorizado");
  return usuario;
}
