import { notFound, redirect } from "next/navigation";
import { SeccionArchivos } from "@/components/archivos/seccion-archivos";
import { Encabezado } from "@/components/encabezado";
import { FormAccion } from "@/components/form-accion";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { obtenerCotizacion } from "@/lib/cotizaciones";
import { can } from "@/lib/permissions";
import { listarProveedores } from "@/lib/proveedores";
import { obtenerEventoRubro } from "@/lib/evento-rubros";
import { usuarioActual } from "@/lib/session";
import { editarCotizacionAction } from "../../../../../presupuestos/actions";
import { CotizacionCampos } from "../../../../../presupuestos/cotizacion-campos";
import { cargarEvento } from "../../../evento";

export default async function EditarCotizacionPage({
  params,
}: PageProps<"/eventos/[eventoId]/rubros/[eventoRubroId]/[cotizacionId]">) {
  const usuario = await usuarioActual();
  const { eventoId, eventoRubroId, cotizacionId } = await params;
  const [evento, cotizacion, rubro, proveedores] = await Promise.all([
    cargarEvento(eventoId),
    obtenerCotizacion(db, cotizacionId),
    obtenerEventoRubro(db, eventoRubroId),
    listarProveedores(db),
  ]);
  if (!cotizacion || !rubro || cotizacion.eventoRubroId !== eventoRubroId || rubro.eventoId !== eventoId) notFound();

  const volver = `/eventos/${eventoId}/rubros/${eventoRubroId}`;
  // Un evento cerrado es solo lectura: no hay nada que editar.
  if (evento.cerrado) redirect(volver);
  const pierdeAprobacion = cotizacion.estado === "aprobada" && !can(usuario.role, "aprobar");

  return (
    <div className="max-w-3xl">
      <Encabezado
        volver={{ href: volver, texto: rubro.nombre }}
        titulo="Editar cotización"
        bajada={`${proveedores.find((p) => p.id === cotizacion.proveedorId)?.nombre ?? ""} · ${rubro.grupo}`}
      />

      {pierdeAprobacion && (
        <p className="mb-6 rounded-2xl bg-aviso-suave px-4 py-3 text-sm font-medium text-aviso md:px-5">
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
            className="space-y-5"
          >
            <input type="hidden" name="cotizacionId" value={cotizacion.id} />
            <CotizacionCampos proveedores={proveedores} dias={rubro.dias} valores={cotizacion} />
          </FormAccion>
        </CardContent>
      </Card>

      <SeccionArchivos
        duenio={{ tipo: "cotizacion", id: cotizacion.id }}
        actor={usuario}
        abierto
        titulo="Archivos de la cotización"
        className="mt-6"
      />
    </div>
  );
}
