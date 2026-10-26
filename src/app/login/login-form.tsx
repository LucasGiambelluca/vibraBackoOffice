"use client";

import { Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setCargando(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(datos.get("email")),
      password: String(datos.get("password")),
    });
    setCargando(false);
    if (error) {
      setError("Email o contraseña incorrectos");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    // method="post": si se envía antes de hidratar, que la clave no termine en la URL.
    <form onSubmit={onSubmit} method="post" className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tinta-3" />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="nombre@rsgroup.bo"
            className="h-12 pl-10"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tinta-3" />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="h-12 pl-10"
            required
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={cargando}>
        {cargando ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
