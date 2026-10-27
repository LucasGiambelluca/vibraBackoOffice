"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { marcarLeidaAction, marcarTodasLeidasAction } from "@/app/(app)/notificaciones/actions";
import { Button } from "@/components/ui/button";
import { formatearFechaHora } from "@/lib/reminders";
import { cn } from "@/lib/utils";
import { conBase } from "@/lib/base-path";

type Notificacion = {
  id: string;
  mensaje: string;
  tareaId: string;
  eventoId: string;
  evento: string;
  leida: boolean;
  createdAt: string;
};
type Datos = { noLeidas: number; items: Notificacion[] };

function formulario(campos: Record<string, string> = {}): FormData {
  const datos = new FormData();
  for (const [nombre, valor] of Object.entries(campos)) datos.set(nombre, valor);
  return datos;
}

export function Campanita() {
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [abierta, setAbierta] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const respuesta = await fetch(conBase("/api/notificaciones"), { cache: "no-store" });
      if (respuesta.ok) setDatos(await respuesta.json());
    } catch {
      // Sin red o respuesta inválida: la próxima consulta reintenta.
    }
  }, []);

  useEffect(() => {
    const inicial = setTimeout(() => void cargar(), 0);
    const intervalo = setInterval(() => void cargar(), 60_000);
    return () => {
      clearTimeout(inicial);
      clearInterval(intervalo);
    };
  }, [cargar]);

  async function abrir(n: Notificacion) {
    setAbierta(false);
    try {
      if (!n.leida) await marcarLeidaAction(formulario({ notificacionId: n.id }));
    } catch (error) {
      // Que no marcarla como leída no impida abrir la tarea.
      console.error("No se pudo marcar la notificación como leída", error);
    }
    router.push(`/eventos/${n.eventoId}/tareas/${n.tareaId}`);
    void cargar();
  }

  async function marcarTodas() {
    try {
      await marcarTodasLeidasAction(formulario());
    } catch (error) {
      console.error("No se pudieron marcar las notificaciones como leídas", error);
    }
    void cargar();
  }

  const noLeidas = datos?.noLeidas ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierta(!abierta)}
        aria-label={`Notificaciones${noLeidas ? ` (${noLeidas} sin leer)` : ""}`}
        aria-expanded={abierta}
        className="relative grid size-11 place-items-center rounded-full border border-border bg-card transition-[background-color,transform] duration-100 hover:bg-muted active:scale-95 md:size-10 md:rounded-xl"
      >
        <Bell className="size-[1.125rem]" strokeWidth={1.75} />
        {noLeidas > 0 && (
          <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-marca px-1 text-[0.6875rem] font-bold text-black ring-2 ring-background">
            {noLeidas}
          </span>
        )}
      </button>
      {abierta && (
        <>
          <div className="fixed inset-0 z-30" aria-hidden onClick={() => setAbierta(false)} />
          <div className="fixed inset-x-3 top-16 z-40 overflow-hidden rounded-2xl border bg-popover shadow-[0_16px_48px_rgb(0_0_0/0.16)] md:absolute md:inset-x-auto md:top-full md:right-0 md:mt-2 md:w-96">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="font-display text-base font-bold">Notificaciones</p>
              {noLeidas > 0 && (
                <Button variant="link" size="xs" className="text-marca-tinta" onClick={marcarTodas}>
                  Marcar todas como leídas
                </Button>
              )}
            </div>
            {!datos || datos.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No tenés notificaciones.</p>
            ) : (
              <ul className="max-h-[60dvh] divide-y overflow-y-auto">
                {datos.items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => abrir(n)}
                      className="flex w-full gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60"
                    >
                      <span
                        aria-hidden
                        className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.leida ? "bg-transparent" : "bg-marca")}
                      />
                      <span className={cn("min-w-0 flex-1", !n.leida && "font-semibold")}>
                        {n.mensaje}
                        <span className="mt-0.5 block text-xs font-normal text-tinta-3">
                          {n.evento} · {formatearFechaHora(new Date(n.createdAt))}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
