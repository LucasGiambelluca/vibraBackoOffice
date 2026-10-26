import Link from "next/link";
import { textoTotal, textoUsd } from "@/components/montos";
import type { TiposCambio } from "@/lib/money";
import type { ResumenEvento } from "@/lib/resumen";
import { cn } from "@/lib/utils";

/** Un evento en marcha en el tablero: lo aprobado en ARS (≈ USD), presupuesto, pagado y avance. */
export function TotalEventoCard({
  id,
  nombre,
  datos,
  totales,
  tipos,
  aprobados,
  rubros,
  vencidas,
  destacado = false,
}: {
  id: string;
  nombre: string;
  datos: string;
  totales: ResumenEvento["totales"];
  tipos: TiposCambio;
  aprobados: number;
  rubros: number;
  vencidas: number;
  destacado?: boolean;
}) {
  const avance = rubros ? aprobados / rubros : 0;
  const aprobado = totales.aprobado;

  return (
    <section
      className={cn(
        "group relative flex flex-col justify-between gap-6 rounded-3xl p-6 transition-shadow md:p-8",
        destacado ? "bg-[#0a0a0a] text-white" : "bg-card ring-1 ring-border hover:shadow-[0_8px_24px_rgb(0_0_0/0.08)]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* Toda la tarjeta lleva al evento, pero el nombre accesible es solo el del evento. */}
          <h2 className="truncate font-display text-xl font-bold tracking-tight group-hover:underline">
            <Link href={`/eventos/${id}`} className="after:absolute after:inset-0">
              {nombre}
            </Link>
          </h2>
          {datos && <p className={cn("mt-0.5 text-sm", destacado ? "text-white/55" : "text-tinta-3")}>{datos}</p>}
        </div>
        <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-marca-suave px-3 text-xs font-semibold text-marca-tinta max-sm:hidden">
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {aprobados} de {rubros} rubros
        </span>
      </div>

      <div>
        <p className={cn("text-sm", destacado ? "text-white/70" : "text-muted-foreground")}>Total aprobado</p>
        {aprobado.ars === null ? (
          <p className={cn("text-[0.9375rem]", destacado ? "text-[#ff9b8a]" : "text-peligro")}>
            {textoTotal(aprobado)}. Cargalo en los ajustes del evento.
          </p>
        ) : (
          <>
            <p
              className={cn(
                "font-display leading-none font-extrabold tracking-[-0.04em] tabular-nums",
                destacado ? "text-[2.25rem] sm:text-[2.75rem] md:text-[3.25rem]" : "text-[2rem]",
              )}
            >
              {textoTotal(aprobado)}
            </p>
            <p className={cn("mt-2 text-[0.9375rem] tabular-nums", destacado ? "text-white/60" : "text-tinta-3")}>
              {textoUsd(aprobado.ars, tipos) ?? "USD sin tipo de cambio"}
            </p>
          </>
        )}
        <dl
          className={cn(
            "mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-sm",
            destacado ? "border-white/15" : "border-border",
          )}
        >
          {[
            { titulo: "Presupuestado", valor: textoTotal(totales.presupuesto) },
            { titulo: "Pagado", valor: textoTotal(totales.pagado) },
            { titulo: "Tareas vencidas", valor: String(vencidas) },
          ].map((c) => (
            <div key={c.titulo} className="min-w-0">
              <dt className={cn("text-xs", destacado ? "text-white/55" : "text-tinta-3")}>{c.titulo}</dt>
              <dd
                className={cn(
                  "truncate font-semibold tabular-nums",
                  c.titulo === "Tareas vencidas" && vencidas > 0 && (destacado ? "text-[#ff9b8a]" : "text-peligro"),
                )}
              >
                {c.valor}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <div
          className={cn("h-1.5 overflow-hidden rounded-full", destacado ? "bg-white/15" : "bg-muted")}
          role="progressbar"
          aria-valuenow={Math.round(avance * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Rubros con cotización aprobada"
        >
          <div className="h-full rounded-full bg-marca" style={{ width: `${avance * 100}%` }} />
        </div>
        <p className={cn("mt-3 text-sm", destacado ? "text-white/55" : "text-tinta-3")}>
          {Math.round(avance * 100)}% de los rubros con cotización aprobada
        </p>
      </div>
    </section>
  );
}
