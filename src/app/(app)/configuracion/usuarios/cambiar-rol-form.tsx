"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cambiarRolAction } from "./actions";

export function CambiarRolForm({ userId, rol }: { userId: string; rol: string }) {
  const [estado, accion, pendiente] = useActionState(cambiarRolAction, null);

  return (
    <form action={accion} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <select
        name="rol"
        defaultValue={rol}
        aria-label="Rol"
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        <option value="editor">Editor</option>
        <option value="admin">Admin</option>
      </select>
      <Button type="submit" variant="outline" size="sm" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar"}
      </Button>
      {estado?.ok === false && <p className="text-sm text-destructive">{estado.error}</p>}
    </form>
  );
}
