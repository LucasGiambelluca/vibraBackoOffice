"use client";

import { useSalir } from "../nav";

export function Salir() {
  const salir = useSalir();
  return (
    <button
      type="button"
      onClick={salir}
      className="h-14 w-full rounded-2xl bg-card text-[0.9375rem] font-semibold text-destructive ring-1 ring-border transition-transform active:scale-[0.98]"
    >
      Salir
    </button>
  );
}
