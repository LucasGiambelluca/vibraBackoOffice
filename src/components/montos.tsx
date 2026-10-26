import { Pastilla } from "@/components/pastilla";
import { desdeArs, formatearCompacto, formatearMonto, type TiposCambio, type TotalArs } from "@/lib/money";

/** "ARS 18.900.000,00", o qué tipo de cambio falta para poder sumar. */
export function textoTotal(total: TotalArs): string {
  return total.ars === null ? `Falta el tipo de cambio de ${total.faltan.join(", ")}` : formatearMonto(total.ars, "ARS");
}

/** "ARS 3,6 M", o "Falta tipo de cambio" corto: para resúmenes chicos. */
export function textoTotalCompacto(total: TotalArs): string {
  return total.ars === null ? "Falta tipo de cambio" : formatearCompacto(total.ars, "ARS");
}

/** "≈ USD 13.500,00", o null si no hay monto o falta el tipo del USD. */
export function textoUsd(ars: number | null, tipos: TiposCambio): string | null {
  if (ars === null) return null;
  const usd = desdeArs(ars, "USD", tipos);
  return usd === null ? null : `≈ ${formatearMonto(usd, "USD")}`;
}

/** Desvío contra el presupuesto: rojo si se pasó, verde si ahorró. */
export function Desvio({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-tinta-3">—</span>;
  const porcentaje = Math.round(valor * 100);
  if (porcentaje === 0) return <Pastilla punto={false}>0 %</Pastilla>;
  return (
    <Pastilla tono={porcentaje > 0 ? "peligro" : "ok"} punto={false}>
      {porcentaje > 0 ? "+" : "−"}
      {Math.abs(porcentaje)} %
    </Pastilla>
  );
}
