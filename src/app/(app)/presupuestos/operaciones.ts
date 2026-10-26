import { z } from "zod";
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import { conPdfNuevo } from "@/lib/adjuntos";
import {
  aprobarCotizacion,
  borrarCotizacion,
  cotizacionSchema,
  crearCotizacion,
  editarCotizacion,
  nuevaCotizacionSchema,
  revertirAprobacion,
} from "@/lib/cotizaciones";
import { can, exigir, type Actor } from "@/lib/permissions";

// `datos` llega de Object.fromEntries(formData): el PDF viene como File en `adjunto`.

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
    await conPdfNuevo(adjunto, async (nombre) => {
      await crearCotizacion(db, valores, actor.id, nombre);
    });
  });
}

export function edicionCotizacion(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    const { adjunto, campos } = separarAdjunto(datos);
    const { cotizacionId: id, ...valores } = validar(cotizacionSchema.extend({ cotizacionId }), campos);
    const quitar = campos.quitarAdjunto === "on";
    // Archivo nuevo: se reemplaza. Sin archivo: se quita si lo pidió, si no se conserva.
    // Si la edita alguien que no puede aprobar, una aprobada vuelve a pendiente.
    await conPdfNuevo(adjunto, (nombre) =>
      editarCotizacion(db, id, valores, nombre ?? (quitar ? null : undefined), can(actor.role, "aprobar")),
    );
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
