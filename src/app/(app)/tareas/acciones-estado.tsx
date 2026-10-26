import { Check, Play, RotateCcw } from "lucide-react";
import { BotonAccion } from "@/components/form-accion";
import type { EstadoTarea } from "@/lib/tareas";
import { cambiarEstadoTareaAction } from "./actions";

// Cambio de estado en un clic: los pasos que tienen sentido desde cada estado.
const SIGUIENTES: Record<EstadoTarea, { estado: EstadoTarea; texto: string }[]> = {
  pendiente: [
    { estado: "en_curso", texto: "Empezar" },
    { estado: "hecha", texto: "Marcar hecha" },
  ],
  en_curso: [{ estado: "hecha", texto: "Marcar hecha" }],
  hecha: [{ estado: "pendiente", texto: "Reabrir" }],
};

const ICONO: Record<EstadoTarea, React.ReactNode> = {
  en_curso: <Play />,
  hecha: <Check />,
  pendiente: <RotateCcw />,
};

/** Con `compacto` (en listas) muestra solo el paso más probable. */
export function AccionesEstado({
  tareaId,
  estado,
  compacto = false,
}: {
  tareaId: string;
  estado: EstadoTarea;
  compacto?: boolean;
}) {
  const pasos = compacto ? SIGUIENTES[estado].slice(0, 1) : SIGUIENTES[estado];
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {pasos.map((s) => (
        <BotonAccion
          key={s.estado}
          accion={cambiarEstadoTareaAction}
          campos={{ tareaId, estado: s.estado }}
          texto={s.texto}
          enviando="…"
          icono={compacto ? undefined : ICONO[s.estado]}
          className={compacto ? undefined : "h-10 px-4"}
        />
      ))}
    </div>
  );
}
