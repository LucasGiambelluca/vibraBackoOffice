import { Segmentos } from "@/components/segmentos";

export type SeccionEvento = "presupuesto" | "tareas" | "ajustes";

/** Las secciones de un evento. Ajustes es solo para admins. */
export function PestanasEvento({
  eventoId,
  activa,
  esAdmin,
  className,
}: {
  eventoId: string;
  activa: SeccionEvento;
  esAdmin: boolean;
  className?: string;
}) {
  const items = [
    { href: `/eventos/${eventoId}`, texto: "Presupuesto", activo: activa === "presupuesto" },
    { href: `/eventos/${eventoId}/tareas`, texto: "Tareas", activo: activa === "tareas" },
    ...(esAdmin ? [{ href: `/eventos/${eventoId}/ajustes`, texto: "Ajustes", activo: activa === "ajustes" }] : []),
  ];
  return <Segmentos etiqueta="Secciones del evento" items={items} className={className} />;
}
