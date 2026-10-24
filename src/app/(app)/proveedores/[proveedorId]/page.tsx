import Link from "next/link";
import { notFound } from "next/navigation";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/proveedores" className="text-sm text-muted-foreground hover:underline">
            ← Proveedores
          </Link>
          <h1 className="text-2xl font-semibold">{proveedor.nombre}</h1>
        </div>
        {can(usuario.role, "borrar") && (
          <BotonAccion
            accion={borrarProveedorAction}
            campos={{ proveedorId }}
            texto="Borrar proveedor"
            enviando="Borrando…"
            variant="destructive"
            confirmar
          />
        )}
      </div>

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
            className="space-y-4"
          >
            <input type="hidden" name="proveedorId" value={proveedorId} />
            <ProveedorCampos valores={proveedor} />
          </FormAccion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cotizaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {cotizaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este proveedor todavía no tiene cotizaciones.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rubro</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cotizaciones.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/presupuestos/${c.rubroId}`} className="hover:underline">
                        {c.rubro}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{c.descripcion}</TableCell>
                    <TableCell className="text-right">{formatearMonto(c.total, c.moneda)}</TableCell>
                    <TableCell>
                      <EstadoCotizacion estado={c.estado} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
