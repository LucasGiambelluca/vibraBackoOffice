import { Badge } from "@/components/ui/badge";
import type { EstadoTarea } from "@/lib/tareas";

const VARIANTE = { pendiente: "outline", en_curso: "secondary", hecha: "default" } as const;
export const TEXTO_ESTADO_TAREA: Record<EstadoTarea, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  hecha: "Hecha",
};

export function EstadoTareaBadge({ estado }: { estado: EstadoTarea }) {
  return <Badge variant={VARIANTE[estado]}>{TEXTO_ESTADO_TAREA[estado]}</Badge>;
}
