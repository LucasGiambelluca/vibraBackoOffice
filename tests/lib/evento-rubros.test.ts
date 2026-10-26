import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { cerrarEvento, crearEvento, eventoSchema } from "@/lib/eventos";
import {
  agregarRubros,
  editarRubroEvento,
  obtenerEventoRubro,
  pagoSchema,
  presupuestoSchema,
  quitarRubro,
  registrarPago,
} from "@/lib/evento-rubros";
import { crearDbPrueba } from "../helpers/db";
import { idEventoRubro, idRubro, idVibra, nuevaCotizacion, nuevoProveedor } from "../helpers/presupuestos";

describe("schemas", () => {
  it("presupuesto vacío no guarda moneda", () => {
    expect(presupuestoSchema.parse({ dias: "1", presupuesto: "", presupuestoMoneda: "USD" })).toEqual({
      dias: 1,
      presupuesto: null,
      presupuestoMoneda: null,
    });
    expect(presupuestoSchema.parse({ dias: "2", presupuesto: "15000,5", presupuestoMoneda: "USD" })).toEqual({
      dias: 2,
      presupuesto: "15000.5",
      presupuestoMoneda: "USD",
    });
  });

  it("pago vacío borra todo lo pagado", () => {
    expect(pagoSchema.parse({ pagado: "", pagadoMoneda: "ARS", pagadoFecha: "2027-03-01", pagadoNota: "x" })).toEqual({
      pagado: null,
      pagadoMoneda: null,
      pagadoFecha: null,
      pagadoNota: null,
    });
    expect(pagoSchema.safeParse({ pagado: "abc", pagadoMoneda: "ARS" }).error?.issues[0].message).toBe(
      "Monto inválido: usá solo números, ej. 1500,50",
    );
  });
});

describe("con DB", () => {
  let db: Db;
  beforeEach(async () => {
    db = await crearDbPrueba();
  });

  it("agrega rubros a un evento; repetido da error", async () => {
    const id = await crearEvento(db, eventoSchema.parse({ nombre: "Fiesta 2028" }), { rubros: [] });
    await agregarRubros(db, id, [{ rubroId: await idRubro(db, "Luces"), dias: 1 }]);
    const luces = await idEventoRubro(db, "Luces", id);
    expect(await obtenerEventoRubro(db, luces)).toMatchObject({
      eventoId: id,
      evento: "Fiesta 2028",
      eventoEstado: "activo",
      nombre: "Luces",
      grupo: "Técnica, Escenario y Backline",
      dias: 1,
    });
    await expect(agregarRubros(db, id, [{ rubroId: await idRubro(db, "Luces"), dias: 2 }])).rejects.toThrow(
      "El rubro ya está en el evento",
    );
  });

  it("presupuesto y pago", async () => {
    const sonido = await idEventoRubro(db);
    await editarRubroEvento(db, sonido, presupuestoSchema.parse({ dias: "1", presupuesto: "5000", presupuestoMoneda: "USD" }));
    await registrarPago(
      db,
      sonido,
      pagoSchema.parse({ pagado: "5200", pagadoMoneda: "USD", pagadoFecha: "2027-03-10", pagadoNota: "Extra de horas" }),
    );
    expect(await obtenerEventoRubro(db, sonido)).toMatchObject({
      dias: 1,
      presupuesto: "5000.00",
      presupuestoMoneda: "USD",
      pagado: "5200.00",
      pagadoMoneda: "USD",
      pagadoFecha: "2027-03-10",
      pagadoNota: "Extra de horas",
    });
  });

  it("quita un rubro sin cotizaciones, no uno con cotizaciones", async () => {
    const luces = await idEventoRubro(db, "Luces");
    await quitarRubro(db, luces);
    expect(await obtenerEventoRubro(db, luces)).toBeUndefined();

    const sonido = await idEventoRubro(db);
    await nuevaCotizacion(db, sonido, await nuevoProveedor(db));
    await expect(quitarRubro(db, sonido)).rejects.toThrow("El rubro tiene cotizaciones: borralas primero");
    await expect(quitarRubro(db, "nada")).rejects.toThrow("El rubro no está en el evento");
  });

  it("con el evento cerrado no se toca nada", async () => {
    const sonido = await idEventoRubro(db);
    await cerrarEvento(db, await idVibra(db), null);
    const cerrado = "El evento está cerrado: solo lectura";
    await expect(agregarRubros(db, await idVibra(db), [{ rubroId: await idRubro(db), dias: 1 }])).rejects.toThrow(cerrado);
    await expect(quitarRubro(db, sonido)).rejects.toThrow(cerrado);
    await expect(
      editarRubroEvento(db, sonido, presupuestoSchema.parse({ dias: "1", presupuesto: "", presupuestoMoneda: "ARS" })),
    ).rejects.toThrow(cerrado);
    await expect(registrarPago(db, sonido, pagoSchema.parse({ pagado: "", pagadoMoneda: "ARS" }))).rejects.toThrow(cerrado);
  });
});
