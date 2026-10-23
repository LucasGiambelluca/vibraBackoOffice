/** Producción real: excluye `next build`, que importa módulos sin servir requests. */
export function esProduccion(): boolean {
  return process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";
}
