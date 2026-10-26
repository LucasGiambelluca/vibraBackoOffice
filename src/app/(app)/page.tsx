import { CalendarClock, ChevronRight, Circle, CircleAlert, Plus } from "lucide-react";
import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { Pastilla } from "@/components/pastilla";
import { TotalEventoCard } from "@/components/total-evento";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { cuandoVence, fechaLarga, hoyEnLaPaz } from "@/lib/reminders";
import { resumenPresupuesto } from "@/lib/resumen";
import { usuarioActual } from "@/lib/session";
import { resumenTareas, type TareaListada } from "@/lib/tareas";
import { cn } from "@/lib/utils";

const MAX_PROXIMAS = 6;

export default async function TableroPage() {
  const usuario = await usuarioActual();
  const [{ areas, total, tipos }, tareas] = await Promise.all([resumenPresupuesto(db), resumenTareas(db)]);
  const ahora = new Date();
  const hoy = hoyEnLaPaz(ahora);
  const rubros = areas.flatMap((a) => a.rubros);
  const aprobados = rubros.filter((r) => r.aprobada).length;
  const proximas = [...tareas.vencidas, ...tareas.proximas];

  return (
    <div>
      <Encabezado
        antetitulo={fechaLarga(ahora)}
        titulo={`Hola, ${usuario.name.split(" ")[0]}`}
        bajada={<span className="max-md:hidden">Así va la producción de Vibra Bolivia 2027.</span>}
        acciones={
          <Link href="/tareas?nueva=1" className={cn(buttonVariants(), "max-md:hidden")}>
            <Plus />
            Nueva tarea
          </Link>
        }
      />

      <div className="grid gap-4 md:gap-5 xl:grid-cols-[1fr_22rem]">
        <TotalEventoCard total={total} tipos={tipos} aprobados={aprobados} rubros={rubros.length} />
        <div className="grid grid-cols-2 gap-4 md:gap-5 xl:grid-cols-1">
          <Indicador
            icono={<CircleAlert className="size-[1.125rem] text-peligro" />}
            titulo="Tareas vencidas"
            corto="Vencidas"
            valor={tareas.vencidas.length}
            nota={tareas.vencidas.length ? "Revisalas hoy" : "Nada vencido"}
            alerta={tareas.vencidas.length > 0}
          />
          <Indicador
            icono={<CalendarClock className="size-[1.125rem]" />}
            titulo="Vencen esta semana"
            corto="Esta semana"
            valor={tareas.proximas.length}
            nota="En los próximos 7 días"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:mt-5 md:gap-5 lg:grid-cols-2">
        <Card className="max-lg:order-2">
          <div className="flex items-baseline justify-between gap-4 px-(--card-spacing)">
            <h2 className="text-lg font-bold tracking-tight">Avance por área</h2>
            <span className="text-xs text-tinta-3">Rubros aprobados</span>
          </div>
          <ul className="space-y-4 px-(--card-spacing)">
            {areas.map((a) => {
              const listos = a.rubros.filter((r) => r.aprobada).length;
              const cantidad = a.rubros.length;
              const avance = cantidad ? listos / cantidad : 0;
              const t = tareas.porArea.get(a.id);
              return (
                <li key={a.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[1fr_8rem_3rem]">
                  <div className="min-w-0">
                    <p className="truncate text-[0.9375rem]">{a.nombre}</p>
                    <p className="text-xs text-tinta-3">
                      {t?.hechas ?? 0} / {t?.total ?? 0} tareas hechas
                    </p>
                  </div>
                  <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted sm:col-span-1 sm:col-start-2 sm:row-start-1">
                    <div
                      className={cn("h-full rounded-full", avance === 1 ? "bg-ok" : "bg-foreground")}
                      style={{ width: `${Math.max(avance * 100, cantidad ? 2 : 0)}%` }}
                    />
                  </div>
                  <span className="col-start-2 row-start-1 text-right text-sm font-semibold tabular-nums sm:col-start-3">
                    {listos} / {cantidad}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <div className="flex items-baseline justify-between gap-4 px-(--card-spacing)">
            <h2 className="text-lg font-bold tracking-tight">Próximas tareas</h2>
            <Link href="/tareas" className="text-sm font-semibold text-marca-tinta hover:underline">
              Ver todas
            </Link>
          </div>
          <div className="px-(--card-spacing)">
            {proximas.length === 0 ? (
              <p className="border-t py-6 text-sm text-muted-foreground">Nada vencido ni por vencer esta semana.</p>
            ) : (
              <ul className="divide-y border-t">
                {proximas.slice(0, MAX_PROXIMAS).map((t) => (
                  <ItemTarea key={t.id} tarea={t} hoy={hoy} />
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Indicador({
  icono,
  titulo,
  corto,
  valor,
  nota,
  alerta = false,
}: {
  icono: React.ReactNode;
  titulo: string;
  corto: string;
  valor: number;
  nota: string;
  alerta?: boolean;
}) {
  return (
    <Card>
      <div className="space-y-2 px-(--card-spacing)">
        <p className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
          {icono}
          <span className="sm:hidden">{corto}</span>
          <span className="max-sm:hidden">{titulo}</span>
        </p>
        <p className={cn("font-display text-4xl font-extrabold tracking-tight", alerta && "text-peligro")}>{valor}</p>
        <p className="text-sm text-tinta-3 max-sm:hidden">{nota}</p>
      </div>
    </Card>
  );
}

function ItemTarea({ tarea, hoy }: { tarea: TareaListada & { fechaLimite: string }; hoy: string }) {
  const vencida = tarea.fechaLimite < hoy;
  const cuando = cuandoVence(tarea.fechaLimite, hoy);
  return (
    <li>
      <Link href={`/tareas/${tarea.id}`} className="group flex items-center gap-3.5 py-3.5">
        <Circle className={cn("size-5 shrink-0", vencida ? "text-peligro" : "text-tinta-3")} strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium group-hover:underline">{tarea.titulo}</span>
          <span className={cn("block truncate text-sm text-tinta-3", vencida && "max-sm:text-peligro")}>
            <span className="sm:hidden">{cuando} · </span>
            {tarea.area}
            {tarea.responsable && ` · ${tarea.responsable}`}
          </span>
        </span>
        {vencida ? (
          <Pastilla tono="peligro" className="max-sm:hidden">
            {cuando}
          </Pastilla>
        ) : (
          <span className="text-sm text-muted-foreground max-sm:hidden">{cuando}</span>
        )}
        <ChevronRight className="size-4 text-tinta-3 sm:hidden" />
      </Link>
    </li>
  );
}
