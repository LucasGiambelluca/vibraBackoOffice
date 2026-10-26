import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { cotizacion, evento, eventoRubro, eventoTipoCambio, user } from "@/db/schema";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";
import { MONEDAS_CAMBIO, type Moneda, type TiposCambio } from "@/lib/money";
import type { Tx } from "@/lib/recordatorios";
import { decimal, fechaOpcional, textoOpcional } from "@/lib/validacion";

export const ESTADOS_EVENTO = ["activo", "cerrado"] as const;
export type EstadoEvento = (typeof ESTADOS_EVENTO)[number];

export const eventoSchema = z
  .object({
    nombre: z.string("Falta el nombre").trim().min(2, "El nombre es muy corto").max(120, "El nombre es muy largo"),
    fechaInicio: fechaOpcional(),
    fechaFin: fechaOpcional(),
    lugar: textoOpcional(120),
  })
  // Las fechas "YYYY-MM-DD" se comparan bien como texto.
  .refine((e) => !e.fechaInicio || !e.fechaFin || e.fechaFin >= e.fechaInicio, {
    message: "La fecha de fin es anterior a la de inicio",
  });

export type DatosEvento = z.infer<typeof eventoSchema>;

/** Rubros con los que nace un evento: elegidos a mano o copiados de otro evento. */
export type OrigenRubros =
  | { rubros: { rubroId: string; dias: number }[] }
  | { copiarDe: string; conPresupuesto: boolean };

const MENSAJES = { unico: "Ya existe un evento con ese nombre" };

/**
 * Toda escritura sobre algo de un evento pasa por acá: un evento cerrado es historial y no
 * se toca hasta que un admin lo reabre. Dentro de una transacción bloquea la fila del
 * evento (FOR SHARE) para que no se cierre en el medio.
 */
export async function asegurarEventoAbierto(db: Db | Tx, eventoId: string): Promise<void> {
  const consulta = db.select({ estado: evento.estado }).from(evento).where(eq(evento.id, eventoId));
  const [fila] = await consulta.for("share");
  if (!fila) throw new ErrorNegocio("El evento no existe");
  if (fila.estado === "cerrado") throw new ErrorNegocio("El evento está cerrado: solo lectura");
}

export async function crearEvento(db: Db, datos: DatosEvento, origen: OrigenRubros): Promise<string> {
  return conRestricciones(
    () =>
      db.transaction(async (tx) => {
        const [fila] = await tx.insert(evento).values(datos).returning({ id: evento.id });
        let rubros: (typeof eventoRubro.$inferInsert)[];
        if ("copiarDe" in origen) {
          const [fuente] = await tx.select({ id: evento.id }).from(evento).where(eq(evento.id, origen.copiarDe));
          if (!fuente) throw new ErrorNegocio("El evento a copiar no existe");
          const previos = await tx.select().from(eventoRubro).where(eq(eventoRubro.eventoId, origen.copiarDe));
          rubros = previos.map((r) => ({
            eventoId: fila.id,
            rubroId: r.rubroId,
            dias: r.dias,
            ...(origen.conPresupuesto ? { presupuesto: r.presupuesto, presupuestoMoneda: r.presupuestoMoneda } : {}),
          }));
        } else {
          rubros = origen.rubros.map((r) => ({ eventoId: fila.id, rubroId: r.rubroId, dias: r.dias }));
        }
        if (rubros.length > 0) await tx.insert(eventoRubro).values(rubros);
        return fila.id;
      }),
    { ...MENSAJES, fk: "Rubro inválido" },
  );
}

export async function editarEvento(db: Db, id: string, datos: DatosEvento): Promise<void> {
  await conRestricciones(
    () =>
      db.transaction(async (tx) => {
        await asegurarEventoAbierto(tx, id);
        await tx.update(evento).set(datos).where(eq(evento.id, id));
      }),
    MENSAJES,
  );
}

/** Monedas distintas de ARS que el evento usa en cotizaciones, presupuestos o pagos. */
export async function monedasUsadas(db: Db | Tx, eventoId: string): Promise<Moneda[]> {
  const filas = await db.execute<{ moneda: Moneda }>(sql`
    select ${cotizacion.moneda} as moneda from ${cotizacion}
      join ${eventoRubro} on ${eventoRubro.id} = ${cotizacion.eventoRubroId}
      where ${eventoRubro.eventoId} = ${eventoId}
    union select ${eventoRubro.presupuestoMoneda} from ${eventoRubro} where ${eventoRubro.eventoId} = ${eventoId}
    union select ${eventoRubro.pagadoMoneda} from ${eventoRubro} where ${eventoRubro.eventoId} = ${eventoId}`);
  // postgres-js devuelve un array; PGlite, { rows }.
  const lista = Array.isArray(filas) ? filas : (filas as unknown as { rows: { moneda: Moneda }[] }).rows;
  return lista.map((f) => f.moneda).filter((m): m is Moneda => !!m && m !== "ARS").sort();
}

/** Cierra el evento: tienen que estar los tipos de cambio de todas las monedas que usa. */
export async function cerrarEvento(db: Db, id: string, actorId: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    const [fila] = await tx.select({ estado: evento.estado }).from(evento).where(eq(evento.id, id)).for("update");
    if (!fila) throw new ErrorNegocio("El evento no existe");
    if (fila.estado === "cerrado") throw new ErrorNegocio("El evento ya está cerrado");

    const tipos = await obtenerTiposCambio(tx, id);
    const faltan = (await monedasUsadas(tx, id)).filter((m) => m !== "ARS" && tipos[m] === undefined);
    if (faltan.length > 0) throw new ErrorNegocio(`Falta el tipo de cambio de ${faltan.join(", ")}`);

    await tx.update(evento).set({ estado: "cerrado", cerradoPor: actorId, cerradoAt: new Date() }).where(eq(evento.id, id));
  });
}

export async function reabrirEvento(db: Db, id: string): Promise<void> {
  const filas = await db
    .update(evento)
    .set({ estado: "activo", cerradoPor: null, cerradoAt: null })
    .where(and(eq(evento.id, id), eq(evento.estado, "cerrado")))
    .returning({ id: evento.id });
  if (filas.length === 0) throw new ErrorNegocio("El evento no está cerrado");
}

/** Activos primero; dentro de cada grupo, los más recientes arriba. */
export function listarEventos(db: Db) {
  return db
    .select({
      id: evento.id,
      nombre: evento.nombre,
      fechaInicio: evento.fechaInicio,
      fechaFin: evento.fechaFin,
      lugar: evento.lugar,
      estado: evento.estado,
      cerradoAt: evento.cerradoAt,
    })
    .from(evento)
    .orderBy(asc(evento.estado), sql`${evento.fechaInicio} desc nulls last`, desc(evento.createdAt));
}

export type EventoListado = Awaited<ReturnType<typeof listarEventos>>[number];

export async function obtenerEvento(db: Db, id: string) {
  const [fila] = await db.select().from(evento).where(eq(evento.id, id));
  return fila;
}

export const tipoCambioSchema = z.object({
  moneda: z.enum(MONEDAS_CAMBIO, "Moneda inválida"),
  valorArs: decimal("Valor inválido: usá solo números, ej. 1435,50", {
    enteros: 12,
    decimales: 6,
    demasiadoGrande: "El valor es demasiado grande",
  }).refine((valor) => Number(valor) > 0, "El valor debe ser mayor a 0"),
});

export type DatosTipoCambio = z.infer<typeof tipoCambioSchema>;

export async function guardarTipoCambio(
  db: Db,
  eventoId: string,
  datos: DatosTipoCambio,
  actorId: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await asegurarEventoAbierto(tx, eventoId);
    await tx
      .insert(eventoTipoCambio)
      .values({ eventoId, ...datos, actualizadoPor: actorId })
      .onConflictDoUpdate({
        target: [eventoTipoCambio.eventoId, eventoTipoCambio.moneda],
        set: { valorArs: datos.valorArs, actualizadoPor: actorId, updatedAt: new Date() },
      });
  });
}

/** Tipos de cambio del evento, listos para `money.ts`. */
export async function obtenerTiposCambio(db: Db | Tx, eventoId: string): Promise<TiposCambio> {
  const filas = await db
    .select({ moneda: eventoTipoCambio.moneda, valorArs: eventoTipoCambio.valorArs })
    .from(eventoTipoCambio)
    .where(eq(eventoTipoCambio.eventoId, eventoId));
  return Object.fromEntries(filas.map((f) => [f.moneda, Number(f.valorArs)]));
}

/** Para los ajustes del evento: valor, fecha y quién lo actualizó. */
export function listarTiposCambio(db: Db, eventoId: string) {
  return db
    .select({
      moneda: eventoTipoCambio.moneda,
      valorArs: eventoTipoCambio.valorArs,
      updatedAt: eventoTipoCambio.updatedAt,
      actualizadoPor: user.name,
    })
    .from(eventoTipoCambio)
    .leftJoin(user, eq(eventoTipoCambio.actualizadoPor, user.id))
    .where(eq(eventoTipoCambio.eventoId, eventoId))
    .orderBy(asc(eventoTipoCambio.moneda));
}
