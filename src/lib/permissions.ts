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
