import type { z } from "zod";

/** Lo que devuelve toda server action: los casos esperados nunca lanzan. */
export type Resultado = { ok: true } | { ok: false; error: string };

/** Error esperado (permiso, validación, regla de negocio): su mensaje se muestra al usuario. */
export class ErrorNegocio extends Error {}

/** Corre `fn` y traduce los ErrorNegocio a `{ ok: false }`; el resto sigue siendo un error real. */
export async function intentar(fn: () => Promise<unknown>): Promise<Resultado> {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    if (error instanceof ErrorNegocio) return { ok: false, error: error.message };
    throw error;
  }
}

/** Valida con zod; si falla lanza ErrorNegocio con el primer mensaje. */
export function validar<T extends z.ZodType>(schema: T, datos: unknown): z.output<T> {
  const parsed = schema.safeParse(datos);
  if (!parsed.success) throw new ErrorNegocio(parsed.error.issues[0].message);
  return parsed.data;
}
