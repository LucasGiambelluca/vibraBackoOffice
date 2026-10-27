"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Campo } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_ARCHIVO, TIPOS_ACEPTADOS } from "@/lib/limites";
import { leerPdfAction } from "./actions";

const NO_SE_PUDO = "No se pudo leer el PDF. Completá los datos a mano.";

/**
 * Pone `valor` en el campo `nombre` del formulario (los campos no son controlados). Los
 * ocultos no se tocan: la persona no vería lo que se guarda (p. ej. el descuento por 2 días
 * en un rubro de 1 día).
 */
function completar(form: HTMLFormElement, nombre: string, valor: string | null) {
  const campo = form.elements.namedItem(nombre);
  if (valor === null || !(campo instanceof HTMLInputElement || campo instanceof HTMLSelectElement || campo instanceof HTMLTextAreaElement))
    return;
  if (campo instanceof HTMLInputElement && campo.type === "hidden") return;
  if (campo instanceof HTMLSelectElement && ![...campo.options].some((o) => o.value === valor)) return;
  campo.value = valor;
}

/**
 * El archivo del proveedor al cargar una cotización. Si es un PDF y hay IA configurada,
 * "Leer con IA" lo manda a MiniMax (solo cuando la persona lo pide) y llena el formulario
 * para revisar.
 */
export function AdjuntoCotizacion({ eventoRubroId, conLectura }: { eventoRubroId: string; conLectura: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [esPdf, setEsPdf] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [leyendo, startTransition] = useTransition();

  function leer() {
    const elegido = input.current;
    const archivo = elegido?.files?.[0];
    const form = elegido?.form;
    if (!elegido || !archivo || !form) return;
    if (archivo.size > MAX_ARCHIVO) {
      setMensaje({ ok: false, texto: "El archivo supera los 10 MB" });
      return;
    }
    const datos = new FormData();
    datos.set("adjunto", archivo);
    datos.set("eventoRubroId", eventoRubroId);
    setMensaje(null);
    startTransition(async () => {
      let resultado;
      try {
        resultado = await leerPdfAction(datos);
      } catch {
        // Un error inesperado no tiene que tirar la pantalla y perder lo cargado.
        resultado = { ok: false as const, error: NO_SE_PUDO };
      }
      // Mientras se leía, se guardó la cotización (el formulario se limpió) o se eligió otro
      // archivo: esta respuesta ya no corresponde.
      if (elegido.files?.[0] !== archivo) return;
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
      {conLectura && esPdf && !leyendo && (
        <div className="space-y-1">
          <Button type="button" variant="outline" onClick={leer}>
            <Sparkles />
            Leer con IA
          </Button>
          <p className="text-xs text-tinta-3">El PDF se manda a MiniMax para leerlo. Nada se guarda hasta que confirmes.</p>
        </div>
      )}
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
