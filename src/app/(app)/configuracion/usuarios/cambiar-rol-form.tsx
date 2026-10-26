"use client";

import { useActionState } from "react";
import { Select } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { cambiarRolAction } from "./actions";

export function CambiarRolForm({ userId, rol }: { userId: string; rol: string }) {
  const [estado, accion, pendiente] = useActionState(cambiarRolAction, null);

  return (
    <form action={accion} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <Select name="rol" defaultValue={rol} aria-label="Rol" className="w-32 [&_select]:h-9">
        <option value="editor">Editor</option>
        <option value="admin">Admin</option>
      </Select>
      <Button type="submit" variant="outline" size="sm" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar"}
      </Button>
      {estado?.ok === false && <p className="text-sm text-destructive">{estado.error}</p>}
    </form>
  );
}
