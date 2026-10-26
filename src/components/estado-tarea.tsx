import { Pastilla } from "@/components/pastilla";
import type { EstadoTarea } from "@/lib/tareas";

const TONO = { pendiente: "aviso", en_curso: "info", hecha: "ok" } as const;
export const TEXTO_ESTADO_TAREA: Record<EstadoTarea, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  hecha: "Hecha",
};

export function EstadoTareaBadge({ estado }: { estado: EstadoTarea }) {
  return <Pastilla tono={TONO[estado]}>{TEXTO_ESTADO_TAREA[estado]}</Pastilla>;
}
