"use client";

import { ChevronDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type EventoOpcion = { id: string; nombre: string; estado: string };

/** Cambia de evento quedándose en la misma sección (presupuesto, tareas o ajustes). */
export function SelectorEvento({
  eventos,
  actual,
  oscuro = false,
  className,
}: {
  eventos: EventoOpcion[];
  actual: string | null;
  oscuro?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function cambiar(id: string) {
    const seccion = actual ? pathname.match(new RegExp(`^/eventos/${actual}/(tareas|ajustes)`))?.[1] : undefined;
    router.push(seccion ? `/eventos/${id}/${seccion}` : `/eventos/${id}`);
  }

  const grupos = [
    { titulo: "Activos", items: eventos.filter((e) => e.estado === "activo") },
    { titulo: "Cerrados", items: eventos.filter((e) => e.estado === "cerrado") },
  ].filter((g) => g.items.length > 0);

  return (
    <div className={cn("relative", className)}>
      <label htmlFor={`selector-evento${oscuro ? "-lateral" : ""}`} className="sr-only">
        Evento
      </label>
      <select
        id={`selector-evento${oscuro ? "-lateral" : ""}`}
        value={actual ?? ""}
        onChange={(e) => cambiar(e.target.value)}
        className={cn(
          "h-11 w-full cursor-pointer appearance-none truncate rounded-xl pr-9 pl-3.5 text-[0.9375rem] font-semibold outline-none focus-visible:ring-3 focus-visible:ring-marca/40",
          oscuro ? "bg-white/[0.08] text-white [&>optgroup]:text-black [&>option]:text-black" : "border border-input bg-card",
        )}
      >
        {!actual && (
          <option value="" disabled>
            Elegí un evento
          </option>
        )}
        {grupos.map((g) => (
          <optgroup key={g.titulo} label={g.titulo}>
            {g.items.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2",
          oscuro ? "text-white/60" : "text-muted-foreground",
        )}
      />
    </div>
  );
}
