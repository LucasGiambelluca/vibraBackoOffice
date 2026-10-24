import Link from "next/link";
import { TotalEventoCard } from "@/components/total-evento";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { formatearFecha } from "@/lib/reminders";
import { resumenPresupuesto } from "@/lib/resumen";
import { usuarioActual } from "@/lib/session";
import { resumenTareas, type TareaListada } from "@/lib/tareas";
import { cn } from "@/lib/utils";

export default async function TableroPage() {
  const usuario = await usuarioActual();
  const [{ areas, total, tipos }, tareas] = await Promise.all([resumenPresupuesto(db), resumenTareas(db)]);
  const sinAprobar = areas.flatMap((a) => a.rubros).filter((r) => !r.aprobada);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Hola, {usuario.name}</h1>
        <p className="text-muted-foreground">Vibra Bolivia 2027 — back office de producción.</p>
      </div>

      <TotalEventoCard total={total} tipos={tipos} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Avance por área</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {areas.map((a) => (
                <li key={a.id} className="flex justify-between gap-4 text-sm">
                  <span>{a.nombre}</span>
                  <span className="shrink-0 text-right text-muted-foreground">
                    {a.rubros.filter((r) => r.aprobada).length} / {a.rubros.length} rubros aprobados
                    <br />
                    {tareas.porArea.get(a.id)?.hechas ?? 0} / {tareas.porArea.get(a.id)?.total ?? 0} tareas hechas
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rubros sin cotización aprobada</CardTitle>
          </CardHeader>
          <CardContent>
            {sinAprobar.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todos los rubros tienen una cotización aprobada.</p>
            ) : (
              <ul className="space-y-1">
                {sinAprobar.map((r) => (
                  <li key={r.id} className="text-sm">
                    <Link href={`/presupuestos/${r.id}`} className="font-medium hover:underline">
                      {r.nombre}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      · {r.area} · {r.cotizaciones} {r.cotizaciones === 1 ? "cotización" : "cotizaciones"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tareas vencidas y de los próximos 7 días</CardTitle>
        </CardHeader>
        <CardContent>
          {tareas.vencidas.length + tareas.proximas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada vencido ni por vencer esta semana.</p>
          ) : (
            <ul className="space-y-1">
              {[...tareas.vencidas, ...tareas.proximas].map((t) => (
                <ItemTarea key={t.id} tarea={t} vencida={tareas.vencidas.includes(t)} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ItemTarea({ tarea, vencida }: { tarea: TareaListada; vencida: boolean }) {
  return (
    <li className="text-sm">
      <Link href={`/tareas/${tarea.id}`} className="font-medium hover:underline">
        {tarea.titulo}
      </Link>{" "}
      <span className={cn("text-muted-foreground", vencida && "text-destructive")}>
        · {vencida ? "vencida el" : "vence el"} {formatearFecha(tarea.fechaLimite!)} · {tarea.area}
        {tarea.responsable && ` · ${tarea.responsable}`}
      </span>
    </li>
  );
}
