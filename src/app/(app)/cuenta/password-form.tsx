"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function PasswordForm() {
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  async function onSubmit(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const datos = new FormData(form);
    const nueva = String(datos.get("nueva"));

    if (nueva.length < 8) {
      setMensaje({ ok: false, texto: "La contraseña nueva debe tener al menos 8 caracteres" });
      return;
    }
    if (nueva !== String(datos.get("repetir"))) {
      setMensaje({ ok: false, texto: "Las contraseñas no coinciden" });
      return;
    }

    const { error } = await authClient.changePassword({
      currentPassword: String(datos.get("actual")),
      newPassword: nueva,
      revokeOtherSessions: true,
    });
    if (error) {
      setMensaje({ ok: false, texto: "La contraseña actual es incorrecta" });
      return;
    }
    form.reset();
    setMensaje({ ok: true, texto: "Contraseña actualizada" });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="actual">Contraseña actual</Label>
        <Input id="actual" name="actual" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nueva">Contraseña nueva</Label>
        <Input id="nueva" name="nueva" type="password" autoComplete="new-password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="repetir">Repetir contraseña nueva</Label>
        <Input id="repetir" name="repetir" type="password" autoComplete="new-password" required />
      </div>
      {mensaje && (
        <p className={cn("text-sm", mensaje.ok ? "text-green-600" : "text-destructive")}>{mensaje.texto}</p>
      )}
      <Button type="submit">Cambiar contraseña</Button>
    </form>
  );
}
