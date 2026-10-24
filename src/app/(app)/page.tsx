import Link from "next/link";
import { TotalEventoCard } from "@/components/total-evento";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { resumenPresupuesto } from "@/lib/resumen";
import { usuarioActual } from "@/lib/session";

export default async function TableroPage() {
  const usuario = await usuarioActual();
  const { areas, total, tipos } = await resumenPresupuesto(db);
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
                  <span className="shrink-0 text-muted-foreground">
                    {a.rubros.filter((r) => r.aprobada).length} / {a.rubros.length} rubros aprobados
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
    </div>
  );
}
