import { z } from "zod";

/** Id `integer` de Postgres escrito en un formulario o una URL (fuera de rango la base tira un error). */
export const MAX_ENTERO = 2_147_483_647;
export function idEntero(mensaje: string) {
  return z.coerce.number(mensaje).int(mensaje).positive(mensaje).max(MAX_ENTERO, mensaje);
}

/** Texto opcional de formulario: vacío o ausente se guarda como null. */
export function textoOpcional(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((valor) => valor || null);
}

/**
 * Decimal no negativo escrito en un formulario. Acepta coma o punto decimal (sin
 * separador de miles) y lo devuelve como string con punto, listo para `numeric`.
 * `enteros` y `decimales` siguen a la columna: `numeric(14,2)` → 12 enteros y 2 decimales.
 */
export function decimal(
  mensaje: string,
  { enteros, decimales, demasiadoGrande = mensaje }: { enteros: number; decimales: number; demasiadoGrande?: string },
) {
  const patron = new RegExp(`^\\d+(\\.\\d{1,${decimales}})?$`);
  return z
    .string(mensaje)
    .trim()
    .transform((valor) => valor.replace(",", "."))
    .pipe(
      z
        .string()
        .regex(patron, mensaje)
        .refine((valor) => valor.split(".")[0].replace(/^0+/, "").length <= enteros, demasiadoGrande),
    );
}

/** Fecha "YYYY-MM-DD" que existe (rechaza 2027-02-30: al normalizarla cambia). */
export const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
  }, "Fecha inválida");

/** Fecha opcional de formulario: vacía o ausente se guarda como null. */
export function fechaOpcional() {
  return z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(fechaSchema.nullable());
}
