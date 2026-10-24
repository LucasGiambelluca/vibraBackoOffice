"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { marcarLeidaAction, marcarTodasLeidasAction } from "@/app/(app)/notificaciones/actions";
import { Button } from "@/components/ui/button";
import { formatearFechaHora } from "@/lib/reminders";
import { cn } from "@/lib/utils";

type Notificacion = { id: string; mensaje: string; tareaId: string; leida: boolean; createdAt: string };
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
      const respuesta = await fetch("/api/notificaciones", { cache: "no-store" });
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
    router.push(`/tareas/${n.tareaId}`);
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
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAbierta(!abierta)}
        aria-label={`Notificaciones${noLeidas ? ` (${noLeidas} sin leer)` : ""}`}
        aria-expanded={abierta}
      >
        <Bell className="size-4" />
        {noLeidas > 0 && (
          <span className="rounded-full bg-destructive px-1.5 text-xs font-medium text-white">{noLeidas}</span>
        )}
      </Button>
      {abierta && (
        <div className="absolute left-0 z-20 mt-2 w-80 rounded-lg border bg-background p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-medium">Notificaciones</p>
            {noLeidas > 0 && (
              <Button variant="link" size="xs" onClick={marcarTodas}>
                Marcar todas como leídas
              </Button>
            )}
          </div>
          {!datos || datos.items.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No tenés notificaciones.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {datos.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => abrir(n)}
                    className={cn("w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted", !n.leida && "font-medium")}
                  >
                    {n.mensaje}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {formatearFechaHora(new Date(n.createdAt))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
