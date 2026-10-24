/** Códigos SQLSTATE de Postgres; drizzle los envuelve en `cause` según el driver. */
function tieneCodigo(error: unknown, codigo: string): boolean {
  for (let e = error; e instanceof Object; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === codigo) return true;
  }
  return false;
}

export const esViolacionUnica = (error: unknown) => tieneCodigo(error, "23505");
export const esViolacionFk = (error: unknown) => tieneCodigo(error, "23503");
