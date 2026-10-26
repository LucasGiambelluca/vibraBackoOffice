"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function PasswordForm() {
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, setPendiente] = useState(false);

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

    setPendiente(true);
    const { error } = await authClient.changePassword({
      currentPassword: String(datos.get("actual")),
      newPassword: nueva,
      revokeOtherSessions: true,
    }).finally(() => setPendiente(false));
    if (error) {
      const texto =
        error.code === "INVALID_PASSWORD"
          ? "La contraseña actual es incorrecta"
          : (error.message ?? "No se pudo cambiar la contraseña");
      setMensaje({ ok: false, texto });
      return;
    }
    form.reset();
    setMensaje({ ok: true, texto: "Contraseña actualizada" });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
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
        <p className={cn("text-sm", mensaje.ok ? "font-medium text-ok" : "text-destructive")}>{mensaje.texto}</p>
      )}
      <Button type="submit" disabled={pendiente} className="max-sm:h-12 max-sm:w-full">
        {pendiente ? "Guardando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
