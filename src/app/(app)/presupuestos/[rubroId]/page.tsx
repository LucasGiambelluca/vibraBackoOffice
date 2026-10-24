import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoCotizacion } from "@/components/estado-cotizacion";
import { BotonAccion, FormAccion } from "@/components/form-accion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { idMasBarata, listarCotizaciones } from "@/lib/cotizaciones";
import { formatearMonto } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listarProveedores } from "@/lib/proveedores";
import { obtenerRubro } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  aprobarCotizacionAction,
  borrarCotizacionAction,
  crearCotizacionAction,
  revertirAprobacionAction,
} from "../actions";
import { CotizacionCampos } from "../cotizacion-campos";

export default async function RubroPage({ params }: PageProps<"/presupuestos/[rubroId]">) {
  const usuario = await usuarioActual();
  const { rubroId } = await params;
  const rubro = await obtenerRubro(db, rubroId);
  if (!rubro) notFound();

  const [cotizaciones, proveedores] = await Promise.all([
    listarCotizaciones(db, { rubroId }),
    listarProveedores(db),
  ]);
  const masBarata = idMasBarata(cotizaciones);
  const puedeAprobar = can(usuario.role, "aprobar");
  const puedeBorrar = can(usuario.role, "borrar");
  const faltaCambio = cotizaciones.some((c) => c.totalBob === null);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/presupuestos" className="text-sm text-muted-foreground hover:underline">
          ← Presupuestos
        </Link>
        <h1 className="text-2xl font-semibold">{rubro.nombre}</h1>
        <p className="text-muted-foreground">
          {rubro.area} · {rubro.dias === 1 ? "1 día" : "2 días"}
        </p>
      </div>

      {faltaCambio && (
        <p className="text-sm text-destructive">
          Hay cotizaciones en monedas sin tipo de cambio: no se pueden comparar en BOB.
        </p>
      )}

      {cotizaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay cotizaciones para este rubro.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proveedor</TableHead>
              <TableHead>Qué incluye</TableHead>
              <TableHead className="text-right">Precio/día</TableHead>
              {rubro.dias === 2 && <TableHead className="text-right">Desc.</TableHead>}
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Total BOB</TableHead>
              {rubro.dias === 2 && <TableHead className="text-right">Ahorro</TableHead>}
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cotizaciones.map((c) => (
              <TableRow key={c.id} className={cn(c.id === masBarata && "bg-green-50 dark:bg-green-950/30")}>
                <TableCell className="font-medium">
                  <Link href={`/proveedores/${c.proveedorId}`} className="hover:underline">
                    {c.proveedor}
                  </Link>
                  {c.id === masBarata && (
                    <Badge variant="secondary" className="ml-2">
                      Más barata
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal">
                  {c.descripcion}
                  {c.adjunto && (
                    <a
                      href={`/api/adjuntos/${c.adjunto}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 text-sm underline"
                    >
                      PDF
                    </a>
                  )}
                </TableCell>
                <TableCell className="text-right">{formatearMonto(c.precioDia, c.moneda)}</TableCell>
                {rubro.dias === 2 && <TableCell className="text-right">{c.descuento2Dias} %</TableCell>}
                <TableCell className="text-right">{formatearMonto(c.total, c.moneda)}</TableCell>
                <TableCell className="text-right">
                  {c.totalBob === null ? "—" : formatearMonto(c.totalBob, "BOB")}
                </TableCell>
                {rubro.dias === 2 && (
                  <TableCell className="text-right">{formatearMonto(c.ahorro, c.moneda)}</TableCell>
                )}
                <TableCell>
                  <EstadoCotizacion estado={c.estado} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Link
                      href={`/presupuestos/${rubroId}/${c.id}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Editar
                    </Link>
                    {puedeAprobar && c.estado !== "aprobada" && (
                      <BotonAccion
                        accion={aprobarCotizacionAction}
                        campos={{ cotizacionId: c.id }}
                        texto="Aprobar"
                        enviando="Aprobando…"
                        variant="default"
                      />
                    )}
                    {puedeAprobar && c.estado === "aprobada" && (
                      <BotonAccion
                        accion={revertirAprobacionAction}
                        campos={{ cotizacionId: c.id }}
                        texto="Revertir"
                        enviando="Revirtiendo…"
                        confirmar
                      />
                    )}
                    {puedeBorrar && (
                      <BotonAccion
                        accion={borrarCotizacionAction}
                        campos={{ cotizacionId: c.id }}
                        texto="Borrar"
                        enviando="Borrando…"
                        variant="ghost"
                        confirmar
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nueva cotización</CardTitle>
        </CardHeader>
        <CardContent>
          {proveedores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Primero cargá al menos un proveedor en{" "}
              <Link href="/proveedores" className="underline">
                Proveedores
              </Link>
              .
            </p>
          ) : (
            <FormAccion
              accion={crearCotizacionAction}
              enviar="Agregar cotización"
              enviando="Guardando…"
              exito="Cotización agregada"
              limpiar
              className="space-y-4"
            >
              <input type="hidden" name="rubroId" value={rubroId} />
              <CotizacionCampos proveedores={proveedores} dias={rubro.dias} />
            </FormAccion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
