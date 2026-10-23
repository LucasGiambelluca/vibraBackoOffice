"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { borrarUsuarioAction } from "./actions";

/** Borrado en dos pasos: "Borrar" pide confirmación inline antes de enviar. */
export function BorrarUsuarioButton({ userId }: { userId: string }) {
  const [estado, accion, pendiente] = useActionState(borrarUsuarioAction, null);
  const [confirmando, setConfirmando] = useState(false);

  return (
    <form action={accion} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      {estado?.ok === false && <p className="text-sm text-destructive">{estado.error}</p>}
      {confirmando ? (
        <>
          <span className="text-sm">¿Seguro?</span>
          <Button type="submit" variant="destructive" size="sm" disabled={pendiente}>
            {pendiente ? "Borrando…" : "Sí, borrar"}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pendiente} onClick={() => setConfirmando(false)}>
            No
          </Button>
        </>
      ) : (
        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmando(true)}>
          Borrar
        </Button>
      )}
    </form>
  );
}
