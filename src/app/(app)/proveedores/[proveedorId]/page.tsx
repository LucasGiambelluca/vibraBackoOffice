import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash } from "lucide-react";
import { Encabezado } from "@/components/encabezado";
import { EstadoCotizacion } from "@/components/estado-cotizacion";
import { BotonAccion, FormAccion } from "@/components/form-accion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { listarCotizaciones } from "@/lib/cotizaciones";
import { formatearMonto } from "@/lib/money";
import { can } from "@/lib/permissions";
import { obtenerProveedor } from "@/lib/proveedores";
import { usuarioActual } from "@/lib/session";
import { borrarProveedorAction, editarProveedorAction } from "../actions";
import { ProveedorCampos } from "../proveedor-campos";

export default async function ProveedorPage({ params }: PageProps<"/proveedores/[proveedorId]">) {
  const usuario = await usuarioActual();
  const { proveedorId } = await params;
  const proveedor = await obtenerProveedor(db, proveedorId);
  if (!proveedor) notFound();
  const cotizaciones = await listarCotizaciones(db, { proveedorId });
  // La historia del proveedor: sus cotizaciones agrupadas por evento.
  const porEvento = [...Map.groupBy(cotizaciones, (c) => c.evento)];

  return (
    <div>
      <Encabezado
        volver={{ href: "/proveedores", texto: "Proveedores" }}
        titulo={proveedor.nombre}
        bajada={`${cotizaciones.length} ${cotizaciones.length === 1 ? "cotización" : "cotizaciones"}`}
        acciones={
          can(usuario.role, "borrar") && (
            <BotonAccion
              accion={borrarProveedorAction}
              campos={{ proveedorId }}
              texto="Borrar"
              enviando="Borrando…"
              variant="destructive"
              icono={<Trash />}
              className="h-10"
              confirmar
            />
          )
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent>
            <FormAccion
              accion={editarProveedorAction}
              enviar="Guardar cambios"
              enviando="Guardando…"
              exito="Guardado"
              className="space-y-5"
            >
              <input type="hidden" name="proveedorId" value={proveedorId} />
              <ProveedorCampos valores={proveedor} />
            </FormAccion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cotizaciones por evento</CardTitle>
          </CardHeader>
          <CardContent>
            {porEvento.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este proveedor todavía no tiene cotizaciones.</p>
            ) : (
              <div className="space-y-6">
                {porEvento.map(([evento, lista]) => (
                  <section key={evento}>
                    <h3 className="mb-1 font-sans text-xs font-semibold tracking-[0.08em] text-tinta-3 uppercase">
                      {evento}
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Rubro</TableHead>
                          <TableHead className="max-sm:hidden">Descripción</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lista.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <Link
                                href={`/eventos/${c.eventoId}/rubros/${c.eventoRubroId}`}
                                className="font-semibold hover:underline"
                              >
                                {c.rubro}
                              </Link>
                            </TableCell>
                            <TableCell className="max-w-48 truncate text-muted-foreground max-sm:hidden">
                              {c.descripcion}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatearMonto(c.total, c.moneda)}</TableCell>
                            <TableCell>
                              <EstadoCotizacion estado={c.estado} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
