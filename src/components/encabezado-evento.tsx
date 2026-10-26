import { Encabezado } from "@/components/encabezado";
import { PestanasEvento, type SeccionEvento } from "@/components/pestanas-evento";
import { SelectorEvento } from "@/components/selector-evento";
import { eventosDelRequest } from "@/lib/evento-actual";
import { formatearFecha } from "@/lib/reminders";

type EventoEncabezado = {
  id: string;
  nombre: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  lugar: string | null;
};

/** "01/03/2027 – 02/03/2027 · La Paz", con lo que esté cargado. */
export function datosEvento(evento: Omit<EventoEncabezado, "id" | "nombre">): string {
  const fechas = [evento.fechaInicio, evento.fechaFin].filter((f): f is string => !!f).map(formatearFecha);
  const rango = fechas.length === 2 && fechas[0] !== fechas[1] ? `${fechas[0]} – ${fechas[1]}` : fechas[0];
  return [rango, evento.lugar].filter(Boolean).join(" · ");
}

/** Encabezado de las secciones de un evento: nombre, datos, selector (celular) y pestañas. */
export async function EncabezadoEvento({
  evento,
  seccion,
  esAdmin,
  acciones,
}: {
  evento: EventoEncabezado;
  seccion: SeccionEvento;
  esAdmin: boolean;
  acciones?: React.ReactNode;
}) {
  const eventos = await eventosDelRequest();
  return (
    <Encabezado
      volver={{ href: "/eventos", texto: "Eventos" }}
      titulo={evento.nombre}
      bajada={datosEvento(evento) || undefined}
      acciones={acciones}
    >
      <SelectorEvento eventos={eventos} actual={evento.id} className="mt-4 md:hidden" />
      <PestanasEvento eventoId={evento.id} activa={seccion} esAdmin={esAdmin} className="mt-4 md:mt-5" />
    </Encabezado>
  );
}
