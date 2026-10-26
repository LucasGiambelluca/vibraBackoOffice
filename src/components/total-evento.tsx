import { desdeBob, formatearMonto, MONEDAS, type TiposCambio, type TotalBob } from "@/lib/money";

/** El total aprobado del evento en BOB, con su equivalente en las otras monedas y el avance. */
export function TotalEventoCard({
  total,
  tipos,
  aprobados,
  rubros,
}: {
  total: TotalBob;
  tipos: TiposCambio;
  aprobados: number;
  rubros: number;
}) {
  const bob = total.bob;
  const avance = rubros ? aprobados / rubros : 0;
  const otras = MONEDAS.filter((m) => m !== "BOB");

  return (
    <section className="flex flex-col justify-between gap-6 rounded-3xl bg-[#0a0a0a] p-6 text-white md:p-8">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-sans text-[0.9375rem] font-medium text-white/80">Total aprobado del evento</h2>
        <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-marca-suave px-3 text-xs font-semibold text-marca-tinta max-sm:hidden">
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {aprobados} de {rubros} rubros
        </span>
      </div>
      {bob === null ? (
        <p className="text-[0.9375rem] text-[#ff9b8a]">
          Falta el tipo de cambio de {total.faltan.join(", ")}. Un admin lo carga en Configuración → Tipos de cambio.
        </p>
      ) : (
        <div>
          <p className="font-display text-[2.25rem] leading-none font-extrabold tracking-[-0.04em] tabular-nums sm:text-[2.75rem] md:text-[3.5rem]">
            {formatearMonto(bob, "BOB")}
          </p>
          <p className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[0.9375rem] text-white/60 tabular-nums">
            {otras.map((moneda) => {
              const monto = desdeBob(bob, moneda, tipos);
              return (
                <span key={moneda}>
                  {monto === null ? `${moneda} sin tipo de cambio` : formatearMonto(monto, moneda)}
                </span>
              );
            })}
          </p>
        </div>
      )}
      <div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-white/15"
          role="progressbar"
          aria-valuenow={Math.round(avance * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Rubros con cotización aprobada"
        >
          <div className="h-full rounded-full bg-marca" style={{ width: `${avance * 100}%` }} />
        </div>
        <p className="mt-3 text-sm text-white/55">
          <span className="sm:hidden">
            {aprobados} de {rubros} rubros aprobados
          </span>
          <span className="max-sm:hidden">{Math.round(avance * 100)}% de los rubros con cotización aprobada</span>
        </p>
      </div>
    </section>
  );
}
