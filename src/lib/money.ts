// Funciones puras de plata: sin DB ni Next, se usan en servidor y cliente.

export const MONEDAS = ["BOB", "USD", "ARS"] as const;
export type Moneda = (typeof MONEDAS)[number];

export const MONEDAS_EXTRANJERAS = ["USD", "ARS"] as const;
export type MonedaExtranjera = (typeof MONEDAS_EXTRANJERAS)[number];

/** Cuántos BOB vale 1 unidad de cada moneda. BOB siempre vale 1 y no se incluye. */
export type TiposCambio = Partial<Record<MonedaExtranjera, number>>;

export type Precio = { precioDia: number; descuento2Dias: number; dias: number };

/** Total en BOB del evento; `null` si falta el tipo de cambio de alguna moneda usada. */
export type TotalBob = { bob: number; faltan: [] } | { bob: null; faltan: Moneda[] };

export function esMoneda(valor: string): valor is Moneda {
  return (MONEDAS as readonly string[]).includes(valor);
}

export function redondear(monto: number): number {
  return Math.round((monto + Number.EPSILON) * 100) / 100;
}

export function totalCotizacion({ precioDia, descuento2Dias, dias }: Precio): number {
  if (dias === 1) return redondear(precioDia);
  return redondear(precioDia * 2 * (1 - descuento2Dias / 100));
}

export function ahorroCotizacion({ precioDia, descuento2Dias, dias }: Precio): number {
  if (dias === 1) return 0;
  return redondear((precioDia * 2 * descuento2Dias) / 100);
}

function valorEnBob(moneda: Moneda, tipos: TiposCambio): number | null {
  return moneda === "BOB" ? 1 : (tipos[moneda] ?? null);
}

export function aBob(monto: number, moneda: Moneda, tipos: TiposCambio): number | null {
  const valor = valorEnBob(moneda, tipos);
  return valor === null ? null : redondear(monto * valor);
}

export function desdeBob(montoBob: number, moneda: Moneda, tipos: TiposCambio): number | null {
  const valor = valorEnBob(moneda, tipos);
  return valor === null ? null : redondear(montoBob / valor);
}

export function totalEvento(montos: { monto: number; moneda: Moneda }[], tipos: TiposCambio): TotalBob {
  const faltan = [...new Set(montos.map((m) => m.moneda))].filter((m) => valorEnBob(m, tipos) === null).sort();
  if (faltan.length > 0) return { bob: null, faltan };
  const suma = montos.reduce((total, m) => total + aBob(m.monto, m.moneda, tipos)!, 0);
  return { bob: redondear(suma), faltan: [] };
}

const FORMATO = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatearMonto(monto: number, moneda: Moneda): string {
  return `${moneda} ${FORMATO.format(monto)}`;
}
