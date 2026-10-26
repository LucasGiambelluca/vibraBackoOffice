import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAccion } from "@/components/form-accion";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { obtenerCotizacion } from "@/lib/cotizaciones";
import { can } from "@/lib/permissions";
import { listarProveedores } from "@/lib/proveedores";
import { obtenerRubro } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import { editarCotizacionAction } from "../../actions";
import { CotizacionCampos } from "../../cotizacion-campos";

export default async function EditarCotizacionPage({
  params,
}: PageProps<"/presupuestos/[rubroId]/[cotizacionId]">) {
  const usuario = await usuarioActual();
  const { rubroId, cotizacionId } = await params;
  const [cotizacion, rubro, proveedores] = await Promise.all([
    obtenerCotizacion(db, cotizacionId),
    obtenerRubro(db, rubroId),
    listarProveedores(db),
  ]);
  if (!cotizacion || !rubro || cotizacion.rubroId !== rubroId) notFound();

  const volver = `/presupuestos/${rubroId}`;
  const pierdeAprobacion = cotizacion.estado === "aprobada" && !can(usuario.role, "aprobar");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={volver} className="text-sm text-muted-foreground hover:underline">
          ← {rubro.nombre}
        </Link>
        <h1 className="text-2xl font-semibold">Editar cotización</h1>
      </div>

      {pierdeAprobacion && (
        <p className="text-sm text-destructive">
          Esta cotización está aprobada. Si guardás cambios vuelve a pendiente y un admin la tiene que aprobar de
          nuevo.
        </p>
      )}

      <Card>
        <CardContent>
          <FormAccion
            accion={editarCotizacionAction}
            enviar="Guardar cambios"
            enviando="Guardando…"
            redirigir={volver}
            className="space-y-4"
          >
            <input type="hidden" name="cotizacionId" value={cotizacion.id} />
            <CotizacionCampos proveedores={proveedores} dias={rubro.dias} valores={cotizacion} />
            {cotizacion.adjunto && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="quitarAdjunto" />
                Quitar el PDF actual (
                <a href={`/api/adjuntos/${cotizacion.adjunto}`} target="_blank" rel="noreferrer" className="underline">
                  ver
                </a>
                ). Si subís uno nuevo, reemplaza al actual.
              </label>
            )}
          </FormAccion>
        </CardContent>
      </Card>
    </div>
  );
}
