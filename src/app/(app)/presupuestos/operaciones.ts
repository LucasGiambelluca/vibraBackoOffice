import { z } from "zod";
import type { Db } from "@/db/client";
import { ErrorNegocio, intentar, validar, type Resultado } from "@/lib/acciones";
import { conArchivoNuevo, hayArchivo } from "@/lib/archivos-disco";
import {
  aprobarCotizacion,
  borrarCotizacion,
  cotizacionSchema,
  crearCotizacion,
  editarCotizacion,
  nuevaCotizacionSchema,
  revertirAprobacion,
} from "@/lib/cotizaciones";
import { obtenerEventoRubro } from "@/lib/evento-rubros";
import { leerCotizacionPdf, type CotizacionLeida } from "@/lib/lectura-pdf";
import { MAX_ARCHIVO } from "@/lib/limites";
import { can, exigir, type Actor } from "@/lib/permissions";
import { listarProveedores } from "@/lib/proveedores";

// `datos` llega de Object.fromEntries(formData): el PDF del alta viene como File en `adjunto`.

const cotizacionId = z.string("Cotización inválida").min(1, "Cotización inválida");
const idSchema = z.object({ cotizacionId });

function separarAdjunto(datos: unknown) {
  const { adjunto, ...campos } = datos as Record<string, unknown>;
  return { adjunto, campos };
}

export function altaCotizacion(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    const { adjunto, campos } = separarAdjunto(datos);
    const valores = validar(nuevaCotizacionSchema, campos);
    await conArchivoNuevo(adjunto, (guardado) =>
      crearCotizacion(db, valores, actor.id, guardado && { guardado, nombre: (adjunto as File).name }),
    );
  });
}

export function edicionCotizacion(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    const { cotizacionId: id, ...valores } = validar(cotizacionSchema.extend({ cotizacionId }), datos);
    // Si la edita alguien que no puede aprobar, una aprobada vuelve a pendiente.
    await editarCotizacion(db, id, valores, can(actor.role, "aprobar"));
  });
}

export function aprobacion(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "aprobar");
    await aprobarCotizacion(db, validar(idSchema, datos).cotizacionId, actor.id);
  });
}

export function reversion(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "aprobar");
    await revertirAprobacion(db, validar(idSchema, datos).cotizacionId);
  });
}

export function bajaCotizacion(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "borrar");
    await borrarCotizacion(db, validar(idSchema, datos).cotizacionId);
  });
}

export type ResultadoLectura = { ok: true; datos: CotizacionLeida } | { ok: false; error: string };

/** Lee el PDF de un proveedor con IA y devuelve los campos para el formulario. No guarda nada. */
export async function lecturaPdf(
  db: Db,
  actor: Actor,
  datos: unknown,
  leer = leerCotizacionPdf,
): Promise<ResultadoLectura> {
  try {
    exigir(actor, "editar");
    const { adjunto, eventoRubroId } = datos as Record<string, unknown>;
    if (!hayArchivo(adjunto)) throw new ErrorNegocio("Elegí el PDF de la cotización");
    if (adjunto.size > MAX_ARCHIVO) throw new ErrorNegocio("El archivo supera los 10 MB");
    const pdf = Buffer.from(await adjunto.arrayBuffer());
    if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new ErrorNegocio("Solo se pueden leer archivos PDF");
    const rubro = typeof eventoRubroId === "string" ? await obtenerEventoRubro(db, eventoRubroId) : undefined;
    if (!rubro) throw new ErrorNegocio("Rubro inválido");
    const proveedores = await listarProveedores(db);
    return { ok: true, datos: await leer(pdf, { rubro: rubro.nombre, dias: rubro.dias, proveedores }) };
  } catch (error) {
    if (error instanceof ErrorNegocio) return { ok: false, error: error.message };
    throw error;
  }
}
