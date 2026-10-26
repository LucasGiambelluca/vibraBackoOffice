import { Pastilla } from "@/components/pastilla";
import type { Estado } from "@/lib/cotizaciones";

const TONO = { aprobada: "ok", pendiente: "aviso", descartada: "neutro" } as const;
const TEXTO: Record<Estado, string> = { aprobada: "Aprobada", pendiente: "Pendiente", descartada: "Descartada" };

export function EstadoCotizacion({ estado }: { estado: Estado }) {
  return <Pastilla tono={TONO[estado]}>{TEXTO[estado]}</Pastilla>;
}
