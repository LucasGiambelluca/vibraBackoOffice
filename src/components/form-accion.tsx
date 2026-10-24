"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { Resultado } from "@/lib/acciones";
import { MAX_ADJUNTO } from "@/lib/limites";

export type AccionFormulario = (formData: FormData) => Promise<Resultado>;

function Mensaje({ estado, exito }: { estado: Resultado | null; exito?: string }) {
  if (estado?.ok === false) return <p className="text-sm text-destructive">{estado.error}</p>;
  if (estado?.ok && exito) return <p className="text-sm text-green-600">{exito}</p>;
  return null;
}

/**
 * Envía el formulario a la server action con una transición. No usa `<form action>`
 * porque React 19 resetea los campos tras la acción aunque falle.
 */
function useAccion(accion: AccionFormulario, redirigir?: string) {
  const router = useRouter();
  const [estado, setEstado] = useState<Resultado | null>(null);
  const [pendiente, startTransition] = useTransition();

  function enviar(form: HTMLFormElement, alTerminar?: (resultado: Resultado) => void) {
    const datos = new FormData(form);
    const pesado = [...datos.values()].some((v) => v instanceof File && v.size > MAX_ADJUNTO);
    if (pesado) {
      setEstado({ ok: false, error: "El adjunto supera los 10 MB" });
      return;
    }
    startTransition(async () => {
      const resultado = await accion(datos);
      setEstado(resultado);
      alTerminar?.(resultado);
      if (resultado.ok && redirigir) router.push(redirigir);
    });
  }

  return { estado, pendiente, enviar };
}

export function FormAccion({
  accion,
  enviar: textoEnviar,
  enviando,
  exito,
  limpiar = false,
  redirigir,
  className,
  children,
}: {
  accion: AccionFormulario;
  enviar: string;
  enviando: string;
  exito?: string;
  /** Vacía el formulario si sale bien (formularios de alta). */
  limpiar?: boolean;
  /** Ruta a la que navegar si sale bien. */
  redirigir?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { estado, pendiente, enviar } = useAccion(accion, redirigir);

  function onSubmit(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    enviar(form, (resultado) => {
      if (resultado.ok && limpiar) form.reset();
    });
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? enviando : textoEnviar}
        </Button>
        <Mensaje estado={estado} exito={exito} />
      </div>
    </form>
  );
}

/** Un botón que manda `campos` ocultos. Con `confirmar`, pide "¿Seguro?" inline antes de enviar. */
export function BotonAccion({
  accion,
  campos,
  texto,
  enviando,
  confirmar = false,
  redirigir,
  variant = "outline",
}: {
  accion: AccionFormulario;
  campos: Record<string, string>;
  texto: string;
  enviando: string;
  confirmar?: boolean;
  redirigir?: string;
  variant?: "default" | "outline" | "ghost" | "destructive";
}) {
  const { estado, pendiente, enviar } = useAccion(accion, redirigir);
  const [confirmando, setConfirmando] = useState(false);

  function onSubmit(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    enviar(evento.currentTarget, () => setConfirmando(false));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center justify-end gap-2">
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      <Mensaje estado={estado} />
      {confirmar && !confirmando ? (
        <Button type="button" variant={variant} size="sm" onClick={() => setConfirmando(true)}>
          {texto}
        </Button>
      ) : (
        <>
          {confirmando && <span className="text-sm">¿Seguro?</span>}
          <Button type="submit" variant={variant} size="sm" disabled={pendiente}>
            {pendiente ? enviando : confirmando ? "Sí" : texto}
          </Button>
          {confirmando && (
            <Button type="button" variant="ghost" size="sm" disabled={pendiente} onClick={() => setConfirmando(false)}>
              No
            </Button>
          )}
        </>
      )}
    </form>
  );
}
