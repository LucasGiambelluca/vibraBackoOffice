import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { eventoRubro, rubro } from "@/db/schema";
import { listarCotizaciones, type CotizacionListada } from "@/lib/cotizaciones";
import { obtenerTiposCambio } from "@/lib/eventos";
import { listarGrupos } from "@/lib/grupos";
import { aArs, totalEnArs, type Moneda, type TiposCambio } from "@/lib/money";

export type Monto = { monto: number; moneda: Moneda };

/** Monto guardado como numeric + moneda, o null si no se cargó. */
function monto(valor: string | null, moneda: string | null): Monto | null {
  return valor === null || moneda === null ? null : { monto: Number(valor), moneda: moneda as Moneda };
}

/**
 * Cuánto se apartó lo real (pagado, o aprobado si todavía no se pagó) del presupuesto:
 * 0.1 = 10 % más caro, -0.05 = 5 % más barato. null si falta algún dato para comparar.
 */
export function desvio(presupuesto: Monto | null, real: Monto | null, tipos: TiposCambio): number | null {
  if (!presupuesto || !real) return null;
  const base = aArs(presupuesto.monto, presupuesto.moneda, tipos);
  const final = aArs(real.monto, real.moneda, tipos);
  if (base === null || final === null || base === 0) return null;
  return (final - base) / base;
}

/**
 * Los rubros del evento agrupados, cada uno con su presupuesto, su cotización aprobada y lo
 * pagado; y los tres totales del evento en ARS.
 */
export async function resumenEvento(db: Db, eventoId: string) {
  const [grupos, rubros, cotizaciones, tipos] = await Promise.all([
    listarGrupos(db),
    db
      .select({
        id: eventoRubro.id,
        rubroId: eventoRubro.rubroId,
        nombre: rubro.nombre,
        grupoId: rubro.grupoId,
        dias: eventoRubro.dias,
        presupuesto: eventoRubro.presupuesto,
        presupuestoMoneda: eventoRubro.presupuestoMoneda,
        pagado: eventoRubro.pagado,
        pagadoMoneda: eventoRubro.pagadoMoneda,
      })
      .from(eventoRubro)
      .innerJoin(rubro, eq(eventoRubro.rubroId, rubro.id))
      .where(eq(eventoRubro.eventoId, eventoId))
      .orderBy(asc(rubro.nombre)),
    listarCotizaciones(db, { eventoId }),
    obtenerTiposCambio(db, eventoId),
  ]);

  const cantidad = new Map<string, number>();
  const aprobadas = new Map<string, CotizacionListada>();
  for (const c of cotizaciones) {
    cantidad.set(c.eventoRubroId, (cantidad.get(c.eventoRubroId) ?? 0) + 1);
    if (c.estado === "aprobada") aprobadas.set(c.eventoRubroId, c);
  }

  const filas = rubros.map((r) => ({
    id: r.id,
    rubroId: r.rubroId,
    nombre: r.nombre,
    grupoId: r.grupoId,
    dias: r.dias,
    cotizaciones: cantidad.get(r.id) ?? 0,
    aprobada: aprobadas.get(r.id) ?? null,
    presupuesto: monto(r.presupuesto, r.presupuestoMoneda),
    pagado: monto(r.pagado, r.pagadoMoneda),
  }));
  const cargados = (montos: (Monto | null)[]) => montos.filter((m): m is Monto => m !== null);

  return {
    grupos: grupos.map((g) => ({ ...g, rubros: filas.filter((r) => r.grupoId === g.id) })),
    totales: {
      presupuesto: totalEnArs(cargados(filas.map((r) => r.presupuesto)), tipos),
      aprobado: totalEnArs(
        [...aprobadas.values()].map((c) => ({ monto: c.total, moneda: c.moneda })),
        tipos,
      ),
      pagado: totalEnArs(cargados(filas.map((r) => r.pagado)), tipos),
    },
    tipos,
  };
}

export type ResumenEvento = Awaited<ReturnType<typeof resumenEvento>>;
export type RubroResumen = ResumenEvento["grupos"][number]["rubros"][number];
