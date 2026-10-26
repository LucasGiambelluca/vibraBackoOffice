"use client";

import { Plus, X } from "lucide-react";
import { createContext, useContext, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

const HojaContexto = createContext<(() => void) | null>(null);

/** Cierra la hoja que contiene al formulario (si hay una). */
export function useCerrarHoja() {
  return useContext(HojaContexto);
}

/**
 * Formulario de alta en una hoja modal: centrada en la computadora, desde abajo en el celular.
 * El botón muestra solo el "+" en el celular; el texto queda como nombre accesible.
 */
export function Hoja({
  boton,
  titulo,
  abierta = false,
  children,
}: {
  boton: string;
  titulo: string;
  abierta?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // El foco va a la hoja (no al botón de cerrar) para que no aparezca su anillo al abrir.
  const abrir = () => {
    ref.current?.showModal();
    ref.current?.focus();
  };
  const cerrar = () => ref.current?.close();

  useEffect(() => {
    if (abierta) {
      ref.current?.showModal();
      ref.current?.focus();
    }
  }, [abierta]);

  return (
    <>
      <Button
        onClick={abrir}
        aria-label={boton}
        className="size-11 rounded-full px-0 md:h-10 md:w-auto md:rounded-xl md:px-4"
      >
        <Plus className="size-5 md:size-4" />
        <span className="max-md:hidden">{boton}</span>
      </Button>
      <dialog
        ref={ref}
        aria-label={titulo}
        tabIndex={-1}
        className="hoja outline-none m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl bg-card p-0 text-foreground shadow-2xl max-md:mb-0 max-md:w-full max-md:max-w-full max-md:rounded-b-none"
        onClick={(evento) => {
          // Un clic en el fondo (fuera del contenido) cierra.
          if (evento.target === evento.currentTarget) cerrar();
        }}
      >
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:p-7">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold tracking-tight">{titulo}</h2>
            <Button variant="ghost" size="icon-sm" onClick={cerrar} aria-label="Cerrar">
              <X />
            </Button>
          </div>
          <HojaContexto.Provider value={cerrar}>{children}</HojaContexto.Provider>
        </div>
      </dialog>
    </>
  );
}
