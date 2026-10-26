"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { subirArchivoAction } from "@/app/(app)/archivos/actions";
import { Button } from "@/components/ui/button";
import type { Duenio } from "@/lib/archivos";
import { MAX_ARCHIVO, TIPOS_ACEPTADOS } from "@/lib/limites";

/** Error del lado del navegador (el servidor igual revisa todo). */
function errorLocal(archivo: File): string | null {
  if (!TIPOS_ACEPTADOS.includes(archivo.type)) return "solo se aceptan PDF o fotos (JPG, PNG o WebP)";
  if (archivo.size > MAX_ARCHIVO) return "supera los 10 MB";
  return null;
}

/** Elige varios archivos y los sube de a uno, mostrando el avance. */
export function SubirArchivos({ duenio }: { duenio: Duenio }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [avance, setAvance] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  async function subir(archivos: File[]) {
    const fallas: string[] = [];
    for (const [i, archivo] of archivos.entries()) {
      setAvance(`Subiendo ${i + 1} de ${archivos.length}…`);
      const local = errorLocal(archivo);
      if (local) {
        fallas.push(`${archivo.name}: ${local}`);
        continue;
      }
      const datos = new FormData();
      datos.set("duenioTipo", duenio.tipo);
      datos.set("duenioId", duenio.id);
      datos.set("archivo", archivo);
      try {
        const resultado = await subirArchivoAction(datos);
        if (!resultado.ok) fallas.push(`${archivo.name}: ${resultado.error}`);
      } catch {
        fallas.push(`${archivo.name}: no se pudo subir. Probá de nuevo.`);
      }
    }
    setAvance(null);
    setErrores(fallas);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2 max-sm:w-full">
      <input
        ref={input}
        type="file"
        multiple
        accept={TIPOS_ACEPTADOS.join(",")}
        className="hidden"
        aria-label="Elegir archivos"
        onChange={(e) => {
          const archivos = [...(e.currentTarget.files ?? [])];
          e.currentTarget.value = "";
          if (archivos.length) void subir(archivos);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={avance !== null}
        onClick={() => input.current?.click()}
        className="max-sm:h-11 max-sm:w-full"
      >
        <Upload />
        {avance ?? "Subir archivos"}
      </Button>
      {errores.length > 0 && (
        <ul className="text-sm text-destructive" role="alert">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
