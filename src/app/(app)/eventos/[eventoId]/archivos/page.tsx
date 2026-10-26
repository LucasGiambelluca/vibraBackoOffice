import { GaleriaArchivos } from "@/components/archivos/galeria-archivos";
import { paraVista, SeccionArchivos } from "@/components/archivos/seccion-archivos";
import { EncabezadoEvento } from "@/components/encabezado-evento";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { listarArchivosEvento } from "@/lib/archivos";
import { can } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";
import { cargarEvento } from "../evento";

/** Todo lo subido al evento: lo suyo (se sube acá) y lo de sus rubros, cotizaciones y tareas. */
export default async function ArchivosEventoPage({ params }: PageProps<"/eventos/[eventoId]/archivos">) {
  const usuario = await usuarioActual();
  const { eventoId } = await params;
  const evento = await cargarEvento(eventoId);
  const abierto = !evento.cerrado;
  const resto = (await listarArchivosEvento(db, eventoId)).filter((a) => a.donde !== null);

  return (
    <div>
      <EncabezadoEvento evento={evento} seccion="archivos" esAdmin={can(usuario.role, "configurar")} />

      <SeccionArchivos
        duenio={{ tipo: "evento", id: eventoId }}
        actor={usuario}
        abierto={abierto}
        titulo="Del evento"
      />

      <Card className="mt-6">
        <div className="px-(--card-spacing)">
          <h2 className="text-lg font-bold tracking-tight">En rubros, cotizaciones y tareas</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Se suben desde cada rubro, cotización o tarea.</p>
          <GaleriaArchivos
            archivos={paraVista(resto, usuario, abierto)}
            mostrarDonde
            vacio="Todavía no hay archivos en rubros, cotizaciones ni tareas."
            className="mt-5"
          />
        </div>
      </Card>
    </div>
  );
}
