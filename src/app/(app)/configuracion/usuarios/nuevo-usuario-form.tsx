"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { crearUsuarioAction } from "./actions";

export function NuevoUsuarioForm() {
  const [estado, accion, pendiente] = useActionState(crearUsuarioAction, null);

  return (
    <form action={accion} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña inicial</Label>
        <Input id="password" name="password" type="text" minLength={8} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rol">Rol</Label>
        <select
          id="rol"
          name="rol"
          defaultValue="editor"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Creando…" : "Crear usuario"}
        </Button>
        {estado?.ok === false && <p className="text-sm text-destructive">{estado.error}</p>}
        {estado?.ok && <p className="text-sm text-green-600">Usuario creado. Pasale el email y la contraseña inicial.</p>}
      </div>
    </form>
  );
}
