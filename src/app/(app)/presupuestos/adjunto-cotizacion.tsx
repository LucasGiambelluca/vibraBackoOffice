"use client";

import { Sparkles } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Campo } from "@/components/campos";
import { Button } from "@/components/ui/button";
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
 * "Completar desde el PDF" lo lee y llena el formulario para revisar.
 */
export function AdjuntoCotizacion({ eventoRubroId, conLectura }: { eventoRubroId: string; conLectura: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [esPdf, setEsPdf] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [leyendo, startTransition] = useTransition();

  function leer() {
    const archivo = input.current?.files?.[0];
    const form = input.current?.form;
    if (!archivo || !form) return;
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
          ref={input}
          id="adjunto"
          name="adjunto"
          type="file"
          accept={TIPOS_ACEPTADOS.join(",")}
          onChange={(e) => {
            setEsPdf(e.currentTarget.files?.[0]?.type === "application/pdf");
            setMensaje(null);
          }}
        />
      </Campo>
      {conLectura && esPdf && (
        <Button type="button" variant="outline" onClick={leer} disabled={leyendo}>
          <Sparkles />
          {leyendo ? "Leyendo el PDF…" : "Completar desde el PDF"}
        </Button>
      )}
      {mensaje && (
        <p className={mensaje.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"} role="status">
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}
