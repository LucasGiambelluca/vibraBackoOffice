import { CalendarDays, ChevronRight, Lock, Plus } from "lucide-react";
import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { datosEvento } from "@/components/encabezado-evento";
import { Pastilla } from "@/components/pastilla";
import { buttonVariants } from "@/components/ui/button";
import { eventosDelRequest } from "@/lib/evento-actual";
import type { EventoListado } from "@/lib/eventos";
import { can } from "@/lib/permissions";
import { formatearFechaHora } from "@/lib/reminders";
import { usuarioActual } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function EventosPage() {
  const usuario = await usuarioActual();
  const eventos = await eventosDelRequest();
  const activos = eventos.filter((e) => e.estado === "activo");
  const cerrados = eventos.filter((e) => e.estado === "cerrado");
  const esAdmin = can(usuario.role, "configurar");

  return (
    <div>
      <Encabezado
        volver={{ href: "/mas", texto: "Más", soloCelular: true }}
        titulo="Eventos"
        bajada="Los eventos de la productora. Los cerrados quedan como historial para comparar."
        acciones={
          esAdmin && (
            <Link href="/eventos/nuevo" className={buttonVariants()} aria-label="Nuevo evento">
              <Plus />
              <span className="max-md:hidden">Nuevo evento</span>
            </Link>
          )
        }
      />

      <h2 className="mb-3 font-sans text-xs font-semibold tracking-[0.1em] text-tinta-3 uppercase">En marcha</h2>
      {activos.length === 0 ? (
        <div className="mb-8 rounded-2xl border border-dashed px-6 py-12 text-center">
          <p className="font-display text-lg font-bold">No hay eventos en marcha</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {esAdmin ? "Creá uno con “Nuevo evento”." : "Un admin los crea."}
          </p>
        </div>
      ) : (
        <ul className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activos.map((e) => (
            <li key={e.id}>
              <TarjetaEvento evento={e} />
            </li>
          ))}
        </ul>
      )}

      {cerrados.length > 0 && (
        <>
          <h2 className="mb-3 font-sans text-xs font-semibold tracking-[0.1em] text-tinta-3 uppercase">Historial</h2>
          <ul className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
            {cerrados.map((e) => (
              <li key={e.id} className="border-b last:border-b-0">
                <Link href={`/eventos/${e.id}`} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40">
                  <Lock className="size-4 shrink-0 text-tinta-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.nombre}</span>
                    <span className="block truncate text-sm text-tinta-3">
                      {datosEvento(e) || (e.cerradoAt && `Cerrado el ${formatearFechaHora(e.cerradoAt)}`)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-tinta-3" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function TarjetaEvento({ evento }: { evento: EventoListado }) {
  const datos = datosEvento(evento);
  return (
    <Link
      href={`/eventos/${evento.id}`}
      className={cn(
        "group flex h-full flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border transition-shadow hover:shadow-[0_8px_24px_rgb(0_0_0/0.08)] md:p-6",
      )}
    >
      <Pastilla tono="ok" className="self-start">
        Activo
      </Pastilla>
      <span>
        <span className="block font-display text-xl font-bold tracking-tight group-hover:underline">{evento.nombre}</span>
        <span className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          {datos || "Sin fecha ni lugar todavía"}
        </span>
      </span>
    </Link>
  );
}
