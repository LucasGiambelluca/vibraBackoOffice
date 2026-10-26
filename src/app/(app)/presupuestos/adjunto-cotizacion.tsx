"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { Campo } from "@/components/campos";
import { Input } from "@/components/ui/input";
import { TIPOS_ACEPTADOS } from "@/lib/limites";
import { leerPdfAction } from "./actions";

/** Pone `valor` en el campo `nombre` del formulario (los campos no son controlados). */
function completar(form: HTMLFormElement, nombre: string, valor: string | null) {
  const campo = form.elements.namedItem(nombre);
  if (valor === null || !(campo instanceof HTMLInputElement || campo instanceof HTMLSelectElement || campo instanceof HTMLTextAreaElement))
    return;
  if (campo instanceof HTMLSelectElement && ![...campo.options].some((o) => o.value === valor)) return;
  campo.value = valor;
}

/**
 * El archivo del proveedor al cargar una cotización. Si es un PDF y hay IA configurada,
 * se lee apenas se elige y llena el formulario para revisar.
 */
export function AdjuntoCotizacion({ eventoRubroId, conLectura }: { eventoRubroId: string; conLectura: boolean }) {
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [leyendo, startTransition] = useTransition();

  function leer(archivo: File, form: HTMLFormElement) {
    const datos = new FormData();
    datos.set("adjunto", archivo);
    datos.set("eventoRubroId", eventoRubroId);
    setMensaje(null);
    startTransition(async () => {
      const resultado = await leerPdfAction(datos);
      if (!resultado.ok) {
        setMensaje({ ok: false, texto: resultado.error });
        return;
      }
      const d = resultado.datos;
      completar(form, "proveedorId", d.proveedorId);
      completar(form, "moneda", d.moneda);
      completar(form, "precioDia", d.precioDia);
      completar(form, "descuento2Dias", d.descuento2Dias);
      completar(form, "descripcion", d.descripcion || null);
      const sinProveedor =
        d.proveedor && !d.proveedorId ? ` El proveedor “${d.proveedor}” no está cargado: elegilo o cargalo en Proveedores.` : "";
      setMensaje({ ok: true, texto: `Datos completados desde el PDF: revisalos antes de guardar.${sinProveedor}` });
    });
  }

  return (
    <div className="space-y-2">
      <Campo id="adjunto" label="PDF o foto de la cotización (opcional, hasta 10 MB)">
        <Input
          id="adjunto"
          name="adjunto"
          type="file"
          accept={TIPOS_ACEPTADOS.join(",")}
          onChange={(e) => {
            const archivo = e.currentTarget.files?.[0];
            const form = e.currentTarget.form;
            setMensaje(null);
            if (conLectura && archivo?.type === "application/pdf" && form) leer(archivo, form);
          }}
        />
      </Campo>
      {leyendo && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" />
          Leyendo el PDF y completando los datos…
        </p>
      )}
      {!leyendo && mensaje && (
        <p className={mensaje.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"} role="status">
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}
