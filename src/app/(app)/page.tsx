import { CalendarClock, ChevronRight, Circle, CircleAlert, Plus } from "lucide-react";
import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { datosEvento } from "@/components/encabezado-evento";
import { Pastilla } from "@/components/pastilla";
import { TotalEventoCard } from "@/components/total-evento";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { cuandoVence, fechaLarga, hoyEnLaPaz } from "@/lib/reminders";
import { eventosDelRequest } from "@/lib/evento-actual";
import { can } from "@/lib/permissions";
import { resumenEvento } from "@/lib/resumen";
import { usuarioActual } from "@/lib/session";
import { resumenTareas, type TareaListada } from "@/lib/tareas";
import { cn } from "@/lib/utils";

const MAX_PROXIMAS = 6;

export default async function TableroPage() {
  const usuario = await usuarioActual();
  const activos = (await eventosDelRequest()).filter((e) => e.estado === "activo");
  const [resumenes, tareas] = await Promise.all([
    Promise.all(activos.map((e) => resumenEvento(db, e.id))),
    resumenTareas(
      db,
      activos.map((e) => e.id),
    ),
  ]);
  const ahora = new Date();
  const hoy = hoyEnLaPaz(ahora);
  const proximas = [...tareas.vencidas, ...tareas.proximas];
  const varios = activos.length > 1;

  return (
    <div>
      <Encabezado
        antetitulo={fechaLarga(ahora)}
        titulo={`Hola, ${usuario.name.split(" ")[0]}`}
        bajada={
          <span className="max-md:hidden">
            {activos.length === 0
              ? "No hay eventos en marcha."
              : `Así van ${varios ? `los ${activos.length} eventos en marcha` : activos[0].nombre}.`}
          </span>
        }
        acciones={
          activos.length > 0 && (
            <Link href="/tareas?nueva=1" className={cn(buttonVariants(), "max-md:hidden")}>
              <Plus />
              Nueva tarea
            </Link>
          )
        }
      />

      {activos.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
          <p className="font-display text-lg font-bold">No hay eventos en marcha</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {can(usuario.role, "configurar") ? (
              <Link href="/eventos/nuevo" className="font-medium text-foreground underline">
                Crear un evento
              </Link>
            ) : (
              "Un admin los crea en Eventos."
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:gap-5 xl:grid-cols-[1fr_22rem]">
            <div className={cn("grid gap-4 md:gap-5", varios && "lg:grid-cols-2")}>
              {activos.map((e, i) => {
                const rubros = resumenes[i].grupos.flatMap((g) => g.rubros);
                return (
                  <TotalEventoCard
                    key={e.id}
                    id={e.id}
                    nombre={e.nombre}
                    datos={datosEvento(e)}
                    totales={resumenes[i].totales}
                    tipos={resumenes[i].tipos}
                    aprobados={rubros.filter((r) => r.aprobada).length}
                    rubros={rubros.length}
                    vencidas={tareas.vencidas.filter((t) => t.eventoId === e.id).length}
                    destacado={i === 0}
                  />
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-4 self-start md:gap-5 xl:grid-cols-1">
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

          <Card className="mt-4 md:mt-5">
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
                    <ItemTarea key={t.id} tarea={t} hoy={hoy} conEvento={varios} />
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </>
      )}
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

function ItemTarea({
  tarea,
  hoy,
  conEvento,
}: {
  tarea: TareaListada & { fechaLimite: string };
  hoy: string;
  conEvento: boolean;
}) {
  const vencida = tarea.fechaLimite < hoy;
  const cuando = cuandoVence(tarea.fechaLimite, hoy);
  return (
    <li>
      <Link href={`/eventos/${tarea.eventoId}/tareas/${tarea.id}`} className="group flex items-center gap-3.5 py-3.5">
        <Circle className={cn("size-5 shrink-0", vencida ? "text-peligro" : "text-tinta-3")} strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium group-hover:underline">{tarea.titulo}</span>
          <span className={cn("block truncate text-sm text-tinta-3", vencida && "max-sm:text-peligro")}>
            <span className="sm:hidden">{cuando} · </span>
            {conEvento && `${tarea.evento} · `}
            {tarea.grupo}
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
