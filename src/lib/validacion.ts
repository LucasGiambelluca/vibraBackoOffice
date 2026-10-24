import { z } from "zod";

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
 */
export function decimal(mensaje: string, decimales: number) {
  const patron = new RegExp(`^\\d+(\\.\\d{1,${decimales}})?$`);
  return z
    .string(mensaje)
    .trim()
    .transform((valor) => valor.replace(",", "."))
    .pipe(z.string().regex(patron, mensaje));
}
