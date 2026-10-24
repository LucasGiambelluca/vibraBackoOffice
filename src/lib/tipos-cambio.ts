import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { tipoCambio, user } from "@/db/schema";
import { MONEDAS_EXTRANJERAS, type TiposCambio } from "@/lib/money";
import { decimal } from "@/lib/validacion";

export const tipoCambioSchema = z.object({
  moneda: z.enum(MONEDAS_EXTRANJERAS, "Moneda inválida"),
  valorBob: decimal("Valor inválido: usá solo números, ej. 6.96", 6).refine(
    (valor) => Number(valor) > 0,
    "El valor debe ser mayor a 0",
  ),
});

export type DatosTipoCambio = z.infer<typeof tipoCambioSchema>;

/** Tipos de cambio cargados, listos para `money.ts`. */
export async function obtenerTiposCambio(db: Db): Promise<TiposCambio> {
  const filas = await db.select({ moneda: tipoCambio.moneda, valorBob: tipoCambio.valorBob }).from(tipoCambio);
  return Object.fromEntries(filas.map((f) => [f.moneda, Number(f.valorBob)]));
}

/** Para la pantalla de configuración: valor, fecha y quién lo actualizó. */
export function listarTiposCambio(db: Db) {
  return db
    .select({
      moneda: tipoCambio.moneda,
      valorBob: tipoCambio.valorBob,
      updatedAt: tipoCambio.updatedAt,
      actualizadoPor: user.name,
    })
    .from(tipoCambio)
    .leftJoin(user, eq(tipoCambio.actualizadoPor, user.id))
    .orderBy(asc(tipoCambio.moneda));
}

export async function guardarTipoCambio(db: Db, datos: DatosTipoCambio, actorId: string | null): Promise<void> {
  await db
    .insert(tipoCambio)
    .values({ ...datos, actualizadoPor: actorId })
    .onConflictDoUpdate({
      target: tipoCambio.moneda,
      set: { valorBob: datos.valorBob, actualizadoPor: actorId, updatedAt: new Date() },
    });
}
