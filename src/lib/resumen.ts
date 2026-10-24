import type { Db } from "@/db/client";
import { listarCotizaciones, type CotizacionListada } from "@/lib/cotizaciones";
import { totalEvento } from "@/lib/money";
import { listarAreas, listarRubros } from "@/lib/rubros";
import { obtenerTiposCambio } from "@/lib/tipos-cambio";

/** Rubros agrupados por área con su cotización aprobada, y el total aprobado del evento. */
export async function resumenPresupuesto(db: Db) {
  const [areas, rubros, cotizaciones, tipos] = await Promise.all([
    listarAreas(db),
    listarRubros(db),
    listarCotizaciones(db),
    obtenerTiposCambio(db),
  ]);

  const cantidad = new Map<string, number>();
  const aprobadas = new Map<string, CotizacionListada>();
  for (const c of cotizaciones) {
    cantidad.set(c.rubroId, (cantidad.get(c.rubroId) ?? 0) + 1);
    if (c.estado === "aprobada") aprobadas.set(c.rubroId, c);
  }

  const filas = rubros.map((r) => ({
    ...r,
    cotizaciones: cantidad.get(r.id) ?? 0,
    aprobada: aprobadas.get(r.id) ?? null,
  }));

  return {
    areas: areas.map((a) => ({ ...a, rubros: filas.filter((r) => r.areaId === a.id) })),
    total: totalEvento(
      [...aprobadas.values()].map((c) => ({ monto: c.total, moneda: c.moneda })),
      tipos,
    ),
    tipos,
  };
}
