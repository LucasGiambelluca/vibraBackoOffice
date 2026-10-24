import { BotonAccion } from "@/components/form-accion";
import type { EstadoTarea } from "@/lib/tareas";
import { cambiarEstadoTareaAction } from "./actions";

// Cambio de estado en un clic: los pasos que tienen sentido desde cada estado.
const SIGUIENTES: Record<EstadoTarea, { estado: EstadoTarea; texto: string }[]> = {
  pendiente: [
    { estado: "en_curso", texto: "Empezar" },
    { estado: "hecha", texto: "Hecha" },
  ],
  en_curso: [{ estado: "hecha", texto: "Hecha" }],
  hecha: [{ estado: "pendiente", texto: "Reabrir" }],
};

export function AccionesEstado({ tareaId, estado }: { tareaId: string; estado: EstadoTarea }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {SIGUIENTES[estado].map((s) => (
        <BotonAccion
          key={s.estado}
          accion={cambiarEstadoTareaAction}
          campos={{ tareaId, estado: s.estado }}
          texto={s.texto}
          enviando="…"
          variant={s.estado === "hecha" ? "default" : "outline"}
        />
      ))}
    </div>
  );
}
