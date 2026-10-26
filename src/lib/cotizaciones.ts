import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { cotizacion, evento, eventoRubro, eventoTipoCambio, proveedor, rubro, user } from "@/db/schema";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";
import { borrarPdf } from "@/lib/adjuntos";
import { asegurarEventoAbierto } from "@/lib/eventos";
import { aArs, ahorroCotizacion, MONEDAS, totalCotizacion, type Moneda, type TiposCambio } from "@/lib/money";
import type { Tx } from "@/lib/recordatorios";
import { decimal } from "@/lib/validacion";

export const ESTADOS = ["pendiente", "aprobada", "descartada"] as const;
export type Estado = (typeof ESTADOS)[number];

const DESCUENTO_FUERA_DE_RANGO = "El descuento debe estar entre 0 y 100";

/** Campos editables. El rubro del evento se elige al crear y no cambia. */
export const cotizacionSchema = z.object({
  proveedorId: z.string("Elegí un proveedor").min(1, "Elegí un proveedor"),
  descripcion: z
    .string("Falta la descripción")
    .trim()
    .min(2, "La descripción es muy corta")
    .max(2000, "La descripción es muy larga"),
  moneda: z.enum(MONEDAS, "Moneda inválida"),
  precioDia: decimal("Precio inválido: usá solo números, ej. 1500.50", {
    enteros: 12,
    decimales: 2,
    demasiadoGrande: "El precio es demasiado grande",
  }).refine(
    (valor) => Number(valor) > 0,
    "El precio debe ser mayor a 0",
  ),
  descuento2Dias: z
    .preprocess(
      (valor) => (valor === undefined || valor === "" ? "0" : valor),
      decimal("Descuento inválido", { enteros: 3, decimales: 2, demasiadoGrande: DESCUENTO_FUERA_DE_RANGO }),
    )
    .refine((valor) => Number(valor) <= 100, DESCUENTO_FUERA_DE_RANGO),
});

export const nuevaCotizacionSchema = cotizacionSchema.extend({
  eventoRubroId: z.string("Rubro inválido").min(1, "Rubro inválido"),
});

export type DatosCotizacion = z.infer<typeof cotizacionSchema>;
export type NuevaCotizacion = z.infer<typeof nuevaCotizacionSchema>;

/** Falla si el rubro del evento no existe o su evento está cerrado. */
async function asegurarRubroAbierto(tx: Tx, eventoRubroId: string): Promise<void> {
  const [fila] = await tx
    .select({ eventoId: eventoRubro.eventoId })
    .from(eventoRubro)
    .where(eq(eventoRubro.id, eventoRubroId));
  if (!fila) throw new ErrorNegocio("Rubro inválido");
  await asegurarEventoAbierto(tx, fila.eventoId);
}

/** La cotización con su rubro del evento; falla si no existe o el evento está cerrado. */
async function cotizacionAbierta(tx: Tx, id: string) {
  const [fila] = await tx
    .select({ eventoRubroId: cotizacion.eventoRubroId, adjunto: cotizacion.adjunto })
    .from(cotizacion)
    .where(eq(cotizacion.id, id));
  if (!fila) throw new ErrorNegocio("La cotización no existe");
  await asegurarRubroAbierto(tx, fila.eventoRubroId);
  return fila;
}

export async function crearCotizacion(
  db: Db,
  datos: NuevaCotizacion,
  creadoPor: string | null,
  adjunto: string | null = null,
): Promise<string> {
  return conRestricciones(
    () =>
      db.transaction(async (tx) => {
        await asegurarRubroAbierto(tx, datos.eventoRubroId);
        const [fila] = await tx
          .insert(cotizacion)
          .values({ ...datos, creadoPor, adjunto })
          .returning({ id: cotizacion.id });
        return fila.id;
      }),
    { fk: "Rubro o proveedor inválido" },
  );
}

const SIN_APROBACION = { aprobadaPor: null, aprobadaAt: null };

/**
 * `adjunto`: undefined = se conserva el actual; null = se quita; string = se reemplaza.
 * El archivo anterior se borra del disco después de actualizar la fila.
 * Si estaba aprobada vuelve a pendiente (el admin la tiene que aprobar de nuevo),
 * salvo con `conservarAprobacion`, que es cuando la edita el propio admin.
 */
export async function editarCotizacion(
  db: Db,
  id: string,
  datos: DatosCotizacion,
  adjunto?: string | null,
  conservarAprobacion = false,
): Promise<void> {
  const cambios = {
    ...datos,
    ...(adjunto === undefined ? {} : { adjunto }),
    // En el mismo UPDATE, para no pisar una aprobación o reversión simultánea.
    ...(conservarAprobacion
      ? {}
      : {
          estado: sql`case when ${cotizacion.estado} = 'aprobada' then 'pendiente' else ${cotizacion.estado} end`,
          aprobadaPor: sql`case when ${cotizacion.estado} = 'aprobada' then null else ${cotizacion.aprobadaPor} end`,
          aprobadaAt: sql`case when ${cotizacion.estado} = 'aprobada' then null else ${cotizacion.aprobadaAt} end`,
        }),
  };
  const anterior = await conRestricciones(
    () =>
      db.transaction(async (tx) => {
        const actual = await cotizacionAbierta(tx, id);
        const filas = await tx
          .update(cotizacion)
          .set(cambios)
          .where(eq(cotizacion.id, id))
          .returning({ id: cotizacion.id });
        // Se pudo borrar entre la lectura y la actualización.
        if (filas.length === 0) throw new ErrorNegocio("La cotización no existe");
        return actual.adjunto;
      }),
    { fk: "Proveedor inválido" },
  );
  if (adjunto !== undefined && anterior !== adjunto) await borrarPdf(anterior);
}

/**
 * Aprueba y pasa a descartada el resto de las cotizaciones del rubro del evento, en una
 * transacción. Se bloquea la fila del rubro del evento para que dos aprobaciones del mismo
 * rubro se hagan de a una.
 */
export async function aprobarCotizacion(db: Db, id: string, aprobadaPor: string | null = null): Promise<void> {
  await conRestricciones(
    () =>
      db.transaction(async (tx) => {
        const previa = await cotizacionAbierta(tx, id);
        await tx
          .select({ id: eventoRubro.id })
          .from(eventoRubro)
          .where(eq(eventoRubro.id, previa.eventoRubroId))
          .for("update");
        // Pudo borrarse mientras se esperaba el bloqueo (el rubro no cambia: no es editable).
        const [fila] = await tx.select({ id: cotizacion.id }).from(cotizacion).where(eq(cotizacion.id, id));
        if (!fila) throw new ErrorNegocio("La cotización no existe");

        // Primero se descartan las demás para no chocar con el índice de una aprobada por rubro.
        await tx
          .update(cotizacion)
          .set({ estado: "descartada", ...SIN_APROBACION })
          .where(and(eq(cotizacion.eventoRubroId, previa.eventoRubroId), ne(cotizacion.id, id)));
        await tx
          .update(cotizacion)
          .set({ estado: "aprobada", aprobadaPor, aprobadaAt: new Date() })
          .where(eq(cotizacion.id, id));
      }),
    { unico: "Otra cotización del rubro se aprobó al mismo tiempo. Recargá la página." },
  );
}

export async function revertirAprobacion(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await cotizacionAbierta(tx, id);
    const filas = await tx
      .update(cotizacion)
      .set({ estado: "pendiente", ...SIN_APROBACION })
      .where(and(eq(cotizacion.id, id), eq(cotizacion.estado, "aprobada")))
      .returning({ id: cotizacion.id });
    if (filas.length === 0) throw new ErrorNegocio("La cotización no está aprobada");
  });
}

export async function borrarCotizacion(db: Db, id: string): Promise<void> {
  const adjunto = await db.transaction(async (tx) => {
    await cotizacionAbierta(tx, id);
    const [fila] = await tx.delete(cotizacion).where(eq(cotizacion.id, id)).returning({ adjunto: cotizacion.adjunto });
    if (!fila) throw new ErrorNegocio("La cotización no existe");
    return fila.adjunto;
  });
  await borrarPdf(adjunto);
}

/** Fila cruda, para precargar el formulario de edición. */
export async function obtenerCotizacion(db: Db, id: string) {
  const [fila] = await db.select().from(cotizacion).where(eq(cotizacion.id, id));
  return fila;
}

export type FiltroCotizaciones = {
  eventoId?: string;
  eventoRubroId?: string;
  proveedorId?: string;
  estado?: Estado;
};

/** Tipos de cambio de cada evento (son pocas filas: dos por evento). */
export async function tiposPorEvento(db: Db): Promise<Map<string, TiposCambio>> {
  const filas = await db.select().from(eventoTipoCambio);
  const tipos = new Map<string, TiposCambio>();
  for (const f of filas) tipos.set(f.eventoId, { ...tipos.get(f.eventoId), [f.moneda]: Number(f.valorArs) });
  return tipos;
}

/** Cotizaciones con evento, rubro, proveedor y totales (en su moneda y en ARS con los tipos de su evento). */
export async function listarCotizaciones(db: Db, filtro: FiltroCotizaciones = {}) {
  const [filas, tipos] = await Promise.all([
    db
      .select({
        id: cotizacion.id,
        eventoRubroId: cotizacion.eventoRubroId,
        eventoId: eventoRubro.eventoId,
        evento: evento.nombre,
        rubro: rubro.nombre,
        dias: eventoRubro.dias,
        proveedorId: cotizacion.proveedorId,
        proveedor: proveedor.nombre,
        descripcion: cotizacion.descripcion,
        moneda: cotizacion.moneda,
        precioDia: cotizacion.precioDia,
        descuento2Dias: cotizacion.descuento2Dias,
        adjunto: cotizacion.adjunto,
        estado: cotizacion.estado,
        aprobador: user.name,
        aprobadaAt: cotizacion.aprobadaAt,
        createdAt: cotizacion.createdAt,
      })
      .from(cotizacion)
      .innerJoin(eventoRubro, eq(cotizacion.eventoRubroId, eventoRubro.id))
      .innerJoin(evento, eq(eventoRubro.eventoId, evento.id))
      .innerJoin(rubro, eq(eventoRubro.rubroId, rubro.id))
      .innerJoin(proveedor, eq(cotizacion.proveedorId, proveedor.id))
      .leftJoin(user, eq(cotizacion.aprobadaPor, user.id))
      .where(
        and(
          filtro.eventoId ? eq(eventoRubro.eventoId, filtro.eventoId) : undefined,
          filtro.eventoRubroId ? eq(cotizacion.eventoRubroId, filtro.eventoRubroId) : undefined,
          filtro.proveedorId ? eq(cotizacion.proveedorId, filtro.proveedorId) : undefined,
          filtro.estado ? eq(cotizacion.estado, filtro.estado) : undefined,
        ),
      )
      .orderBy(asc(cotizacion.createdAt)),
    tiposPorEvento(db),
  ]);

  return filas.map((fila) => {
    const precio = { precioDia: Number(fila.precioDia), descuento2Dias: Number(fila.descuento2Dias), dias: fila.dias };
    const moneda = fila.moneda as Moneda;
    const total = totalCotizacion(precio);
    return {
      ...fila,
      ...precio,
      moneda,
      estado: fila.estado as Estado,
      total,
      ahorro: ahorroCotizacion(precio),
      totalArs: aArs(total, moneda, tipos.get(fila.eventoId) ?? {}),
    };
  });
}

export type CotizacionListada = Awaited<ReturnType<typeof listarCotizaciones>>[number];

/** La más barata en ARS entre las no descartadas con tipo de cambio conocido. */
export function idMasBarata(cotizaciones: CotizacionListada[]): string | null {
  let mejor: CotizacionListada | null = null;
  for (const c of cotizaciones) {
    if (c.estado === "descartada" || c.totalArs === null) continue;
    if (!mejor || c.totalArs < mejor.totalArs!) mejor = c;
  }
  return mejor?.id ?? null;
}
