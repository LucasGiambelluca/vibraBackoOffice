"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Último recurso: los errores esperados se muestran inline (ver src/lib/acciones.ts).
export default function ErrorApp({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Algo salió mal</h1>
      <p className="text-sm text-muted-foreground">
        Ocurrió un error inesperado. Probá de nuevo; si sigue pasando, avisale al administrador.
      </p>
      <Button onClick={() => retry()}>Reintentar</Button>
    </div>
  );
}
