import { ErrorNegocio } from "@/lib/acciones";

export const ROLES = ["admin", "editor"] as const;
export type Rol = (typeof ROLES)[number];

export type Accion = "ver" | "editar" | "aprobar" | "borrar" | "configurar";

const PERMISOS: Record<Rol, ReadonlySet<Accion>> = {
  admin: new Set(["ver", "editar", "aprobar", "borrar", "configurar"]),
  editor: new Set(["ver", "editar"]),
};

export function esRol(valor: string): valor is Rol {
  return (ROLES as readonly string[]).includes(valor);
}

export function can(rol: string, accion: Accion): boolean {
  return esRol(rol) && PERMISOS[rol].has(accion);
}

/** El rol no tiene permiso para la acción (equivale a un 403). */
export class ErrorPermiso extends ErrorNegocio {
  constructor() {
    super("No tenés permiso para hacer esto");
  }
}

/** Quien ejecuta una acción. */
export type Actor = { id: string; role: string };

export function exigir(actor: Actor, accion: Accion): void {
  if (!can(actor.role, accion)) throw new ErrorPermiso();
}
