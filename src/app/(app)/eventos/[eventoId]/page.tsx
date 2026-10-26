import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { EncabezadoEvento } from "@/components/encabezado-evento";
import { Desvio, textoTotal, textoUsd } from "@/components/montos";
import { Pastilla } from "@/components/pastilla";
import { Segmentos } from "@/components/segmentos";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { formatearMonto } from "@/lib/money";
import { can } from "@/lib/permissions";
import { desvio, resumenEvento, type Monto } from "@/lib/resumen";
import { usuarioActual } from "@/lib/session";
import { cn } from "@/lib/utils";
import { cargarEvento } from "./evento";

/** "Técnica, Escenario y Backline" → "Técnica": el nombre corto para las pestañas. */
const nombreCorto = (nombre: string) => nombre.split(/[ ,]/)[0];

const texto = (m: Monto | null) => (m ? formatearMonto(m.monto, m.moneda) : null);

export default async function EventoPage({ params, searchParams }: PageProps<"/eventos/[eventoId]">) {
  const usuario = await usuarioActual();
  const { eventoId } = await params;
  const { grupo } = await searchParams;
  const evento = await cargarEvento(eventoId);
  const { grupos, totales, tipos } = await resumenEvento(db, eventoId);
  const esAdmin = can(usuario.role, "configurar");

  const conRubros = grupos.filter((g) => g.rubros.length > 0);
  const elegido = conRubros.find((g) => String(g.id) === grupo);
  const rubros = (elegido ? [elegido] : conRubros).flatMap((g) => g.rubros.map((r) => ({ ...r, grupo: g.nombre })));
  const todos = conRubros.flatMap((g) => g.rubros);
  const sinAprobar = todos.filter((r) => !r.aprobada).length;

  const cifras = [
    { titulo: "Presupuestado", total: totales.presupuesto },
    { titulo: "Aprobado", total: totales.aprobado },
    { titulo: "Pagado", total: totales.pagado },
  ];
  const base = `/eventos/${eventoId}`;

  return (
    <div>
      <EncabezadoEvento evento={evento} seccion="presupuesto" esAdmin={esAdmin} />

      <section className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border lg:grid-cols-4">
        {cifras.map((c, i) => (
          <div key={c.titulo} className={cn("min-w-0 bg-card px-5 py-4 md:px-6 md:py-5", i === 0 && "max-lg:col-span-2")}>
            <p className="text-xs text-tinta-3">{c.titulo}</p>
            <p
              className={cn(
                "mt-1 font-display font-bold tracking-tight break-words tabular-nums",
                c.total.ars === null ? "text-sm text-peligro" : "text-base sm:text-lg md:text-xl",
              )}
            >
              {textoTotal(c.total)}
            </p>
            <p className="text-xs text-tinta-3 tabular-nums">{textoUsd(c.total.ars, tipos) ?? " "}</p>
          </div>
        ))}
        <div className="bg-card px-5 py-4 max-lg:col-span-2 md:px-6 md:py-5">
          <p className="text-xs text-tinta-3">Rubros sin aprobar</p>
          <p className="mt-1 font-display text-lg font-bold tracking-tight text-marca-tinta md:text-xl">
            {sinAprobar} de {todos.length}
          </p>
        </div>
      </section>

      {conRubros.length > 1 && (
        <Segmentos
          etiqueta="Grupos"
          className="mb-5"
          items={[
            { href: base, texto: "Todos", activo: !elegido },
            ...conRubros.map((g) => ({
              href: `${base}?grupo=${g.id}`,
              texto: nombreCorto(g.nombre),
              activo: g.id === elegido?.id,
            })),
          ]}
        />
      )}

      {rubros.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
          <p className="font-display text-lg font-bold">El evento no tiene rubros</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {esAdmin ? (
              <>
                Agregalos en{" "}
                <Link href={`${base}/ajustes`} className="font-medium text-foreground underline">
                  Ajustes
                </Link>
                .
              </>
            ) : (
              "Un admin los agrega en los ajustes del evento."
            )}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-card px-1 py-2 ring-1 ring-border md:px-3">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Rubro</TableHead>
                <TableHead className="text-right max-lg:hidden">Presupuesto</TableHead>
                <TableHead>Aprobado</TableHead>
                <TableHead className="text-right max-md:hidden">Pagado</TableHead>
                <TableHead className="max-sm:hidden">Desvío</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rubros.map((r) => {
                const aprobado = r.aprobada ? { monto: r.aprobada.total, moneda: r.aprobada.moneda } : null;
                return (
                  <TableRow key={r.id} className="relative">
                    <TableCell className="whitespace-normal">
                      <Link href={`${base}/rubros/${r.id}`} className="font-semibold after:absolute after:inset-0 hover:underline">
                        {r.nombre}
                      </Link>
                      <span className="block text-xs text-tinta-3">
                        <span className="max-lg:hidden">{r.grupo} · </span>
                        {r.dias === 1 ? "1 día" : "2 días"} · {r.cotizaciones}{" "}
                        {r.cotizaciones === 1 ? "cotización" : "cotizaciones"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums max-lg:hidden">
                      {texto(r.presupuesto) ?? <span className="text-tinta-3">—</span>}
                    </TableCell>
                    <TableCell>
                      {r.aprobada ? (
                        <span className="leading-tight">
                          <span className="block font-medium">{r.aprobada.proveedor}</span>
                          <span className="block text-xs text-tinta-3 tabular-nums">{texto(aprobado)}</span>
                        </span>
                      ) : (
                        <Pastilla tono="aviso">Sin aprobar</Pastilla>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums max-md:hidden">
                      {texto(r.pagado) ?? <span className="text-tinta-3">—</span>}
                    </TableCell>
                    <TableCell className="max-sm:hidden">
                      <Desvio valor={desvio(r.presupuesto, r.pagado ?? aprobado, tipos)} />
                    </TableCell>
                    <TableCell className="pl-0 text-right">
                      <ChevronRight className="ml-auto size-4 text-tinta-3" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="mt-3 text-xs text-tinta-3">
        Desvío: lo pagado (o lo aprobado, si todavía no se pagó) contra el presupuesto, en ARS con los tipos de
        cambio del evento.
      </p>
    </div>
  );
}
