import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { evento, eventoRubro, grupo, rubro } from "@/db/schema";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";
import { asegurarEventoAbierto } from "@/lib/eventos";
import { MONEDAS } from "@/lib/money";
import type { Tx } from "@/lib/recordatorios";
import { decimal, fechaOpcional, textoOpcional } from "@/lib/validacion";

// Los rubros que usa cada evento, con su presupuesto objetivo y lo que se pagó de verdad.

const dias = z.enum(["1", "2"], "Los días deben ser 1 o 2").transform(Number);

/** Monto opcional de formulario: vacío se guarda como null. */
const montoOpcional = (mensaje: string) =>
  z.preprocess(
    (valor) => (valor === undefined || (typeof valor === "string" && valor.trim() === "") ? null : valor),
    decimal(mensaje, { enteros: 12, decimales: 2, demasiadoGrande: "El monto es demasiado grande" }).nullable(),
  );

export const rubrosEventoSchema = z.object({
  rubros: z.array(z.object({ rubroId: z.string().min(1, "Rubro inválido"), dias })).min(1, "Elegí al menos un rubro"),
});

export const presupuestoSchema = z
  .object({
    dias,
    presupuesto: montoOpcional("Presupuesto inválido: usá solo números, ej. 1500,50"),
    presupuestoMoneda: z.enum(MONEDAS, "Moneda inválida"),
  })
  // Sin monto no se guarda moneda (la base exige los dos juntos).
  .transform((d) => ({ ...d, presupuestoMoneda: d.presupuesto === null ? null : d.presupuestoMoneda }));

export const pagoSchema = z
  .object({
    pagado: montoOpcional("Monto inválido: usá solo números, ej. 1500,50"),
    pagadoMoneda: z.enum(MONEDAS, "Moneda inválida"),
    pagadoFecha: fechaOpcional(),
    pagadoNota: textoOpcional(500),
  })
  .transform((d) =>
    d.pagado === null ? { pagado: null, pagadoMoneda: null, pagadoFecha: null, pagadoNota: null } : d,
  );

export type DatosPresupuesto = z.infer<typeof presupuestoSchema>;
export type DatosPago = z.infer<typeof pagoSchema>;

/** El evento del rubro; falla si no existe o el evento está cerrado. */
async function eventoAbierto(tx: Tx, id: string): Promise<string> {
  const [fila] = await tx.select({ eventoId: eventoRubro.eventoId }).from(eventoRubro).where(eq(eventoRubro.id, id));
  if (!fila) throw new ErrorNegocio("El rubro no está en el evento");
  await asegurarEventoAbierto(tx, fila.eventoId);
  return fila.eventoId;
}

export async function agregarRubros(db: Db, eventoId: string, rubros: { rubroId: string; dias: number }[]) {
  await conRestricciones(
    () =>
      db.transaction(async (tx) => {
        await asegurarEventoAbierto(tx, eventoId);
        await tx.insert(eventoRubro).values(rubros.map((r) => ({ eventoId, ...r })));
      }),
    { unico: "El rubro ya está en el evento", fk: "Rubro inválido" },
  );
}

/** Solo si todavía no tiene cotizaciones. */
export async function quitarRubro(db: Db, id: string): Promise<void> {
  await conRestricciones(
    () =>
      db.transaction(async (tx) => {
        await eventoAbierto(tx, id);
        await tx.delete(eventoRubro).where(eq(eventoRubro.id, id));
      }),
    { fk: "El rubro tiene cotizaciones: borralas primero" },
  );
}

export async function editarRubroEvento(db: Db, id: string, datos: DatosPresupuesto): Promise<void> {
  await db.transaction(async (tx) => {
    await eventoAbierto(tx, id);
    await tx.update(eventoRubro).set(datos).where(eq(eventoRubro.id, id));
  });
}

export async function registrarPago(db: Db, id: string, datos: DatosPago): Promise<void> {
  await db.transaction(async (tx) => {
    await eventoAbierto(tx, id);
    await tx.update(eventoRubro).set(datos).where(eq(eventoRubro.id, id));
  });
}

/** El rubro del evento con su nombre, grupo y el estado del evento. */
export async function obtenerEventoRubro(db: Db, id: string) {
  const [fila] = await db
    .select({
      id: eventoRubro.id,
      eventoId: eventoRubro.eventoId,
      evento: evento.nombre,
      eventoEstado: evento.estado,
      rubroId: eventoRubro.rubroId,
      nombre: rubro.nombre,
      grupoId: rubro.grupoId,
      grupo: grupo.nombre,
      dias: eventoRubro.dias,
      presupuesto: eventoRubro.presupuesto,
      presupuestoMoneda: eventoRubro.presupuestoMoneda,
      pagado: eventoRubro.pagado,
      pagadoMoneda: eventoRubro.pagadoMoneda,
      pagadoFecha: eventoRubro.pagadoFecha,
      pagadoNota: eventoRubro.pagadoNota,
    })
    .from(eventoRubro)
    .innerJoin(evento, eq(eventoRubro.eventoId, evento.id))
    .innerJoin(rubro, eq(eventoRubro.rubroId, rubro.id))
    .innerJoin(grupo, eq(rubro.grupoId, grupo.id))
    .where(eq(eventoRubro.id, id));
  return fila;
}
