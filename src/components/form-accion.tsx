"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useCerrarHoja } from "@/components/hoja";
import { Button } from "@/components/ui/button";
import type { Resultado } from "@/lib/acciones";
import { MAX_ARCHIVO, TIPOS_ACEPTADOS } from "@/lib/limites";

export type AccionFormulario = (formData: FormData) => Promise<Resultado>;

function Mensaje({ estado, exito }: { estado: Resultado | null; exito?: string }) {
  if (estado?.ok === false) return <p className="text-sm text-destructive">{estado.error}</p>;
  if (estado?.ok && exito) return <p className="text-sm font-medium text-ok">{exito}</p>;
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
    // Un input file vacío llega como File de tamaño 0: no es un archivo.
    const archivos = [...datos.values()].filter((v): v is File => v instanceof File && v.size > 0);
    const error = archivos.some((v) => !TIPOS_ACEPTADOS.includes(v.type))
      ? "Solo se aceptan PDF o fotos (JPG, PNG o WebP)"
      : archivos.some((v) => v.size > MAX_ARCHIVO)
        ? "El archivo supera los 10 MB"
        : null;
    if (error) {
      setEstado({ ok: false, error });
      return;
    }
    startTransition(async () => {
      // Si la acción redirige desde el servidor, no llega resultado: navega Next.
      const resultado: Resultado | undefined = await accion(datos);
      if (!resultado) return;
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
  const cerrarHoja = useCerrarHoja();

  function onSubmit(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    enviar(form, (resultado) => {
      if (resultado.ok && limpiar) form.reset();
      // Dentro de una hoja, un alta que sale bien la cierra: el resultado se ve en la lista.
      if (resultado.ok) cerrarHoja?.();
    });
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" disabled={pendiente} className="max-sm:w-full max-sm:h-12">
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
  variant = "outline",
  icono,
  className,
}: {
  accion: AccionFormulario;
  campos: Record<string, string>;
  texto: string;
  enviando: string;
  confirmar?: boolean;
  variant?: "default" | "outline" | "ghost" | "destructive";
  icono?: React.ReactNode;
  className?: string;
}) {
  const { estado, pendiente, enviar } = useAccion(accion);
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
        <Button type="button" variant={variant} size="sm" className={className} onClick={() => setConfirmando(true)}>
          {icono}
          {texto}
        </Button>
      ) : (
        <>
          {confirmando && <span className="text-sm font-medium">¿Seguro?</span>}
          <Button type="submit" variant={variant} size="sm" className={className} disabled={pendiente}>
            {!confirmando && !pendiente && icono}
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
