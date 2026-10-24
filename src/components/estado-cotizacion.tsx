import { Badge } from "@/components/ui/badge";
import type { Estado } from "@/lib/cotizaciones";

const VARIANTE = { aprobada: "default", pendiente: "outline", descartada: "secondary" } as const;
const TEXTO: Record<Estado, string> = { aprobada: "Aprobada", pendiente: "Pendiente", descartada: "Descartada" };

export function EstadoCotizacion({ estado }: { estado: Estado }) {
  return <Badge variant={VARIANTE[estado]}>{TEXTO[estado]}</Badge>;
}
