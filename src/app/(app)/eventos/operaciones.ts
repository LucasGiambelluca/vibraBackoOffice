import { z } from "zod";
import type { Db } from "@/db/client";
import { intentar, validar, type Resultado } from "@/lib/acciones";
import {
  agregarRubros,
  editarRubroEvento,
  pagoSchema,
  presupuestoSchema,
  quitarRubro,
  registrarPago,
  rubrosEventoSchema,
} from "@/lib/evento-rubros";
import {
  cerrarEvento,
  crearEvento,
  editarEvento,
  eventoSchema,
  guardarTipoCambio,
  reabrirEvento,
  tipoCambioSchema,
  type DatosTipoCambio,
} from "@/lib/eventos";
import { MONEDAS_CAMBIO } from "@/lib/money";
import { exigir, type Actor } from "@/lib/permissions";

// Todo lo de eventos lo hace un admin: crear, cerrar, rubros, presupuesto, pagos y tipos de cambio.

const eventoId = z.string("Evento inválido").min(1, "Evento inválido");
const eventoRubroId = z.string("Rubro inválido").min(1, "Rubro inválido");

/**
 * Rubros tildados en el formulario: un checkbox `rubro-<id>` y un select `dias-<id>` por
 * rubro (Object.fromEntries pierde los valores repetidos, por eso cada uno tiene su nombre).
 */
function rubrosElegidos(datos: Record<string, unknown>) {
  const rubros = Object.keys(datos)
    .filter((clave) => clave.startsWith("rubro-") && datos[clave] === "on")
    .map((clave) => {
      const rubroId = clave.slice("rubro-".length);
      return { rubroId, dias: datos[`dias-${rubroId}`] ?? "1" };
    });
  return validar(rubrosEventoSchema, { rubros }).rubros;
}

/** Tipos de cambio que vinieron completos (`valor-USD`, `valor-BOB`); los vacíos se ignoran. */
function tiposCargados(datos: Record<string, unknown>): DatosTipoCambio[] {
  return MONEDAS_CAMBIO.filter((moneda) => typeof datos[`valor-${moneda}`] === "string" && datos[`valor-${moneda}`] !== "").map(
    (moneda) => validar(tipoCambioSchema, { moneda, valorArs: datos[`valor-${moneda}`] }),
  );
}

/** Devuelve el id del evento nuevo para que la action redirija ahí. */
export async function altaEvento(db: Db, actor: Actor, datos: unknown): Promise<Resultado & { id?: string }> {
  let id = "";
  const resultado = await intentar(async () => {
    exigir(actor, "configurar");
    const campos = datos as Record<string, unknown>;
    const valores = validar(eventoSchema, campos);
    const tipos = tiposCargados(campos);
    const origen =
      campos.origen === "copiar"
        ? {
            copiarDe: validar(z.object({ copiarDe: z.string("Elegí un evento").min(1, "Elegí un evento") }), campos)
              .copiarDe,
            conPresupuesto: campos.conPresupuesto === "on",
          }
        : { rubros: rubrosElegidos(campos) };
    id = await crearEvento(db, valores, origen);
    for (const tipo of tipos) await guardarTipoCambio(db, id, tipo, actor.id);
  });
  return resultado.ok ? { ...resultado, id } : resultado;
}

export function edicionEvento(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { eventoId: id } = validar(z.object({ eventoId }), datos);
    await editarEvento(db, id, validar(eventoSchema, datos));
  });
}

export function cierreEvento(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    await cerrarEvento(db, validar(z.object({ eventoId }), datos).eventoId, actor.id);
  });
}

export function reaperturaEvento(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    await reabrirEvento(db, validar(z.object({ eventoId }), datos).eventoId);
  });
}

export function guardadoTipoCambio(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { eventoId: id, ...tipo } = validar(tipoCambioSchema.extend({ eventoId }), datos);
    await guardarTipoCambio(db, id, tipo, actor.id);
  });
}

export function altaRubrosEvento(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { eventoId: id } = validar(z.object({ eventoId }), datos);
    await agregarRubros(db, id, rubrosElegidos(datos as Record<string, unknown>));
  });
}

export function bajaRubroEvento(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    await quitarRubro(db, validar(z.object({ eventoRubroId }), datos).eventoRubroId);
  });
}

export function edicionRubroEvento(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { eventoRubroId: id } = validar(z.object({ eventoRubroId }), datos);
    await editarRubroEvento(db, id, validar(presupuestoSchema, datos));
  });
}

export function registroPago(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "configurar");
    const { eventoRubroId: id } = validar(z.object({ eventoRubroId }), datos);
    await registrarPago(db, id, validar(pagoSchema, datos));
  });
}
