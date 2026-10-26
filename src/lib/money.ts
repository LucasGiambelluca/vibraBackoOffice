// Funciones puras de plata: sin DB ni Next, se usan en servidor y cliente.

export const MONEDAS = ["ARS", "USD", "BOB"] as const;
export type Moneda = (typeof MONEDAS)[number];

/** La moneda base es ARS: las demás necesitan tipo de cambio (uno por evento). */
export const MONEDAS_CAMBIO = ["USD", "BOB"] as const;
export type MonedaCambio = (typeof MONEDAS_CAMBIO)[number];

/** Cuántos ARS vale 1 unidad de cada moneda. ARS siempre vale 1 y no se incluye. */
export type TiposCambio = Partial<Record<MonedaCambio, number>>;

export type Precio = { precioDia: number; descuento2Dias: number; dias: number };

/** Total en ARS; `null` si falta el tipo de cambio de alguna moneda usada. */
export type TotalArs = { ars: number; faltan: [] } | { ars: null; faltan: Moneda[] };

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

/** Tipo de cambio en millonésimas de ARS, o null si no está cargado. */
function valorEnArs(moneda: Moneda, tipos: TiposCambio): bigint | null {
  if (moneda === "ARS") return MILLONESIMAS;
  const valor = tipos[moneda];
  return valor === undefined ? null : aEntero(valor, 1e6);
}

function aArsCentavos(monto: number, valor: bigint): bigint {
  return dividir(aCentavos(monto) * valor, MILLONESIMAS);
}

export function aArs(monto: number, moneda: Moneda, tipos: TiposCambio): number | null {
  const valor = valorEnArs(moneda, tipos);
  return valor === null ? null : desdeCentavos(aArsCentavos(monto, valor));
}

export function desdeArs(montoArs: number, moneda: Moneda, tipos: TiposCambio): number | null {
  const valor = valorEnArs(moneda, tipos);
  return valor === null ? null : desdeCentavos(dividir(aCentavos(montoArs) * MILLONESIMAS, valor));
}

export function totalEnArs(montos: { monto: number; moneda: Moneda }[], tipos: TiposCambio): TotalArs {
  const faltan = [...new Set(montos.map((m) => m.moneda))].filter((m) => valorEnArs(m, tipos) === null).sort();
  if (faltan.length > 0) return { ars: null, faltan };
  const suma = montos.reduce((total, m) => total + aArsCentavos(m.monto, valorEnArs(m.moneda, tipos)!), BigInt(0));
  return { ars: desdeCentavos(suma), faltan: [] };
}

const FORMATO = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COMPACTO = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });

/** "ARS 3,6 M": para resúmenes donde no entra el monto completo. */
export function formatearCompacto(monto: number, moneda: Moneda): string {
  return `${moneda} ${COMPACTO.format(monto)}`;
}

export function formatearMonto(monto: number, moneda: Moneda): string {
  return `${moneda} ${FORMATO.format(monto)}`;
}
