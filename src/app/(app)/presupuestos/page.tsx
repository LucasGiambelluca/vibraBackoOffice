import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { Pastilla } from "@/components/pastilla";
import { Segmentos } from "@/components/segmentos";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { desdeBob, formatearMonto } from "@/lib/money";
import { resumenPresupuesto } from "@/lib/resumen";
import { usuarioActual } from "@/lib/session";
import { cn } from "@/lib/utils";

/** "Técnica, Escenario y Backline" → "Técnica": el nombre corto para las pestañas. */
const nombreCorto = (nombre: string) => nombre.split(/[ ,]/)[0];

export default async function PresupuestosPage({ searchParams }: PageProps<"/presupuestos">) {
  await usuarioActual();
  const { area } = await searchParams;
  const { areas, total, tipos } = await resumenPresupuesto(db);

  const conRubros = areas.filter((a) => a.rubros.length > 0);
  const elegida = conRubros.find((a) => String(a.id) === area);
  const rubros = (elegida ? [elegida] : conRubros).flatMap((a) => a.rubros.map((r) => ({ ...r, area: a.nombre })));
  const todos = conRubros.flatMap((a) => a.rubros);
  const sinAprobar = todos.filter((r) => !r.aprobada).length;

  const bob = total.bob;
  const cifras = [
    { titulo: "Total aprobado", valor: bob === null ? "Falta tipo de cambio" : formatearMonto(bob, "BOB") },
    ...(["USD", "ARS"] as const).map((moneda) => {
      const monto = bob === null ? null : desdeBob(bob, moneda, tipos);
      return { titulo: `En ${moneda}`, valor: monto === null ? "—" : formatearMonto(monto, moneda) };
    }),
  ];

  return (
    <div>
      <Encabezado
        titulo="Presupuestos"
        bajada="Rubros del evento por área. Entrá a un rubro para comparar cotizaciones."
      />

      <section className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border lg:grid-cols-4">
        {cifras.map((c, i) => (
          <div key={c.titulo} className={cn("bg-card px-5 py-4 md:px-6 md:py-5", i === 0 && "max-lg:col-span-2")}>
            <p className="text-xs text-tinta-3">{c.titulo}</p>
            <p className="mt-1 truncate font-display text-lg font-bold tracking-tight tabular-nums md:text-xl">
              {c.valor}
            </p>
          </div>
        ))}
        <div className="bg-card px-5 py-4 md:px-6 md:py-5">
          <p className="text-xs text-tinta-3">Rubros sin aprobar</p>
          <p className="mt-1 font-display text-lg font-bold tracking-tight text-marca-tinta md:text-xl">
            {sinAprobar} de {todos.length}
          </p>
        </div>
      </section>

      <Segmentos
        etiqueta="Áreas"
        className="mb-5"
        items={[
          { href: "/presupuestos", texto: "Todas", activo: !elegida },
          ...conRubros.map((a) => ({
            href: `/presupuestos?area=${a.id}`,
            texto: nombreCorto(a.nombre),
            activo: a.id === elegida?.id,
          })),
        ]}
      />

      {rubros.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay rubros. Un admin los carga en Rubros.</p>
      ) : (
        <div className="rounded-2xl bg-card px-1 py-2 ring-1 ring-border md:px-3">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Rubro</TableHead>
                <TableHead className="max-md:hidden">Área</TableHead>
                <TableHead className="max-md:hidden">Días</TableHead>
                <TableHead className="max-md:hidden">Cotizaciones</TableHead>
                <TableHead>Aprobada</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rubros.map((r) => (
                <TableRow key={r.id} className="relative">
                  <TableCell className="whitespace-normal">
                    <Link
                      href={`/presupuestos/${r.id}`}
                      className="font-semibold after:absolute after:inset-0 hover:underline"
                    >
                      {r.nombre}
                    </Link>
                    <span className="block text-xs text-tinta-3 md:hidden">
                      {r.dias === 1 ? "1 día" : "2 días"} · {r.cotizaciones}{" "}
                      {r.cotizaciones === 1 ? "cotización" : "cotizaciones"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-md:hidden">{r.area}</TableCell>
                  <TableCell className="tabular-nums max-md:hidden">{r.dias}</TableCell>
                  <TableCell className="tabular-nums max-md:hidden">{r.cotizaciones}</TableCell>
                  <TableCell>
                    {r.aprobada ? (
                      <span className="leading-tight">
                        <span className="block font-medium">{r.aprobada.proveedor}</span>
                        <span className="block text-xs text-tinta-3 tabular-nums">
                          {formatearMonto(r.aprobada.total, r.aprobada.moneda)}
                        </span>
                      </span>
                    ) : (
                      <Pastilla tono="aviso">Sin aprobar</Pastilla>
                    )}
                  </TableCell>
                  <TableCell className="pl-0 text-right">
                    <ChevronRight className="ml-auto size-4 text-tinta-3" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
