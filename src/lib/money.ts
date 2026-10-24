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

// Las cuentas se hacen en enteros (centavos, puntos básicos, millonésimas) con BigInt
// para no arrastrar error de punto flotante ni pasarse de 2^53.
const PUNTOS_BASICOS = BigInt(10000);
const MILLONESIMAS = BigInt(1000000);

/** Precios y descuentos tienen a lo sumo 2 decimales; los tipos de cambio, 6. */
const aEntero = (valor: number, escala: number) => BigInt(Math.round(valor * escala));
const aCentavos = (monto: number) => aEntero(monto, 100);
const desdeCentavos = (centavos: bigint) => Number(centavos) / 100;

/** `numerador / denominador` (ambos ≥ 0, los montos nunca son negativos) redondeado; el medio sube. */
function dividir(numerador: bigint, denominador: bigint): bigint {
  return (numerador * BigInt(2) + denominador) / (denominador * BigInt(2));
}

function totalCentavos({ precioDia, descuento2Dias, dias }: Precio): bigint {
  const precio = aCentavos(precioDia);
  if (dias === 1) return precio;
  return dividir(precio * BigInt(2) * (PUNTOS_BASICOS - aEntero(descuento2Dias, 100)), PUNTOS_BASICOS);
}

export function totalCotizacion(precio: Precio): number {
  return desdeCentavos(totalCentavos(precio));
}

/** Lo que falta al total para llegar a 2 × precio: total + ahorro es siempre exacto. */
export function ahorroCotizacion(precio: Precio): number {
  if (precio.dias === 1) return 0;
  return desdeCentavos(aCentavos(precio.precioDia) * BigInt(2) - totalCentavos(precio));
}

/** Tipo de cambio en millonésimas de BOB, o null si no está cargado. */
function valorEnBob(moneda: Moneda, tipos: TiposCambio): bigint | null {
  if (moneda === "BOB") return MILLONESIMAS;
  const valor = tipos[moneda];
  return valor === undefined ? null : aEntero(valor, 1e6);
}

function aBobCentavos(monto: number, valor: bigint): bigint {
  return dividir(aCentavos(monto) * valor, MILLONESIMAS);
}

export function aBob(monto: number, moneda: Moneda, tipos: TiposCambio): number | null {
  const valor = valorEnBob(moneda, tipos);
  return valor === null ? null : desdeCentavos(aBobCentavos(monto, valor));
}

export function desdeBob(montoBob: number, moneda: Moneda, tipos: TiposCambio): number | null {
  const valor = valorEnBob(moneda, tipos);
  return valor === null ? null : desdeCentavos(dividir(aCentavos(montoBob) * MILLONESIMAS, valor));
}

export function totalEvento(montos: { monto: number; moneda: Moneda }[], tipos: TiposCambio): TotalBob {
  const faltan = [...new Set(montos.map((m) => m.moneda))].filter((m) => valorEnBob(m, tipos) === null).sort();
  if (faltan.length > 0) return { bob: null, faltan };
  const suma = montos.reduce((total, m) => total + aBobCentavos(m.monto, valorEnBob(m.moneda, tipos)!), BigInt(0));
  return { bob: desdeCentavos(suma), faltan: [] };
}

const FORMATO = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatearMonto(monto: number, moneda: Moneda): string {
  return `${moneda} ${FORMATO.format(monto)}`;
}
