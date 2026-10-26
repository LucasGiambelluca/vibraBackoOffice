import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { listarArchivos, type ArchivoListado, type Duenio } from "@/lib/archivos";
import { can, type Actor } from "@/lib/permissions";
import { formatearFechaHora } from "@/lib/reminders";
import { GaleriaArchivos, type ArchivoVista } from "./galeria-archivos";
import { SubirArchivos } from "./subir-archivos";

function tamanio(bytes: number | null): string | null {
  if (bytes === null) return null;
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Lo que necesita la galería (cliente): textos ya armados y si este usuario lo puede borrar. */
export function paraVista(archivos: ArchivoListado[], actor: Actor, abierto: boolean): ArchivoVista[] {
  return archivos.map((a) => ({
    id: a.id,
    tipo: a.tipo,
    nombre: a.nombre,
    conMiniatura: a.conMiniatura,
    detalle: [tamanio(a.bytes), a.subidor, formatearFechaHora(a.createdAt)].filter(Boolean).join(" · "),
    donde: a.donde,
    borrable: abierto && (a.subidoPor === actor.id || can(actor.role, "borrar")),
  }));
}

/** Fotos y PDF de un evento, rubro, cotización o tarea. Con el evento cerrado, solo se ven. */
export async function SeccionArchivos({
  duenio,
  actor,
  abierto,
  titulo = "Archivos",
  className,
}: {
  duenio: Duenio;
  actor: Actor;
  abierto: boolean;
  titulo?: string;
  className?: string;
}) {
  const archivos = await listarArchivos(db, duenio);
  const sube = abierto && can(actor.role, "editar");
  return (
    <Card className={className}>
      <div className="px-(--card-spacing)">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight">{titulo}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Fotos y PDF, hasta 10 MB cada uno.</p>
          </div>
          {sube && <SubirArchivos duenio={duenio} />}
        </div>
        <GaleriaArchivos archivos={paraVista(archivos, actor, abierto)} className="mt-5" />
      </div>
    </Card>
  );
}
