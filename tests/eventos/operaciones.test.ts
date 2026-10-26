import { beforeEach, describe, expect, it } from "vitest";
import {
  altaEvento,
  altaRubrosEvento,
  bajaRubroEvento,
  cierreEvento,
  edicionEvento,
  edicionRubroEvento,
  guardadoTipoCambio,
  reaperturaEvento,
  registroPago,
} from "@/app/(app)/eventos/operaciones";
import type { Db } from "@/db/client";
import { obtenerEventoRubro } from "@/lib/evento-rubros";
import { listarEventos, obtenerEvento, obtenerTiposCambio } from "@/lib/eventos";
import type { Actor } from "@/lib/permissions";
import { crearActores, SIN_PERMISO } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { idEventoRubro, idRubro, idVibra } from "../helpers/presupuestos";

let db: Db;
let admin: Actor;
let editor: Actor;
beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
});

describe("altaEvento", () => {
  it("el editor no puede crear eventos", async () => {
    expect(await altaEvento(db, editor, { nombre: "Fiesta", origen: "copiar", copiarDe: await idVibra(db) })).toEqual(
      SIN_PERMISO,
    );
    expect(await listarEventos(db)).toHaveLength(1);
  });

  it("con rubros tildados, días por rubro y tipos de cambio", async () => {
    const sonido = await idRubro(db, "Sonido");
    const luces = await idRubro(db, "Luces");
    const resultado = await altaEvento(db, admin, {
      nombre: "Fiesta 2028",
      fechaInicio: "2028-03-01",
      fechaFin: "",
      lugar: "",
      origen: "elegir",
      [`rubro-${sonido}`]: "on",
      [`dias-${sonido}`]: "1",
      [`rubro-${luces}`]: "on",
      [`dias-${luces}`]: "2",
      [`dias-${await idRubro(db, "Pantalla")}`]: "2",
      "valor-USD": "1435,5",
      "valor-BOB": "",
    });
    expect(resultado).toEqual({ ok: true, id: expect.any(String) });
    const id = (resultado as { id: string }).id;
    expect(await obtenerEvento(db, id)).toMatchObject({ nombre: "Fiesta 2028", fechaInicio: "2028-03-01", lugar: null });
    expect((await obtenerEventoRubro(db, await idEventoRubro(db, "Sonido", id)))?.dias).toBe(1);
    expect((await obtenerEventoRubro(db, await idEventoRubro(db, "Luces", id)))?.dias).toBe(2);
    expect(await obtenerTiposCambio(db, id)).toEqual({ USD: 1435.5 });
  });

  it("copiando de otro evento", async () => {
    const resultado = await altaEvento(db, admin, { nombre: "Vibra 2028", origen: "copiar", copiarDe: await idVibra(db) });
    expect(resultado.ok).toBe(true);
  });

  it("errores: sin rubros, tipo de cambio inválido (no crea nada), sin evento a copiar", async () => {
    expect(await altaEvento(db, admin, { nombre: "Fiesta", origen: "elegir" })).toEqual({
      ok: false,
      error: "Elegí al menos un rubro",
    });
    expect(await altaEvento(db, admin, { nombre: "Fiesta", origen: "copiar", copiarDe: "", "valor-USD": "abc" })).toEqual({
      ok: false,
      error: "Valor inválido: usá solo números, ej. 1435,50",
    });
    expect(await altaEvento(db, admin, { nombre: "Fiesta", origen: "copiar", copiarDe: "" })).toEqual({
      ok: false,
      error: "Elegí un evento",
    });
    expect(await listarEventos(db)).toHaveLength(1);
  });
});

describe("ajustes del evento", () => {
  it("el editor no puede editar, cerrar, reabrir ni cargar tipos, rubros, presupuesto o pagos", async () => {
    const eventoId = await idVibra(db);
    const eventoRubroId = await idEventoRubro(db);
    const operaciones = [
      edicionEvento(db, editor, { eventoId, nombre: "X evento" }),
      cierreEvento(db, editor, { eventoId }),
      reaperturaEvento(db, editor, { eventoId }),
      guardadoTipoCambio(db, editor, { eventoId, moneda: "USD", valorArs: "1" }),
      altaRubrosEvento(db, editor, { eventoId }),
      bajaRubroEvento(db, editor, { eventoRubroId }),
      edicionRubroEvento(db, editor, { eventoRubroId, dias: "1", presupuesto: "", presupuestoMoneda: "ARS" }),
      registroPago(db, editor, { eventoRubroId, pagado: "1", pagadoMoneda: "ARS" }),
    ];
    for (const resultado of await Promise.all(operaciones)) expect(resultado).toEqual(SIN_PERMISO);
  });

  it("el admin carga presupuesto, pago y tipos; cierra y reabre", async () => {
    const eventoId = await idVibra(db);
    const eventoRubroId = await idEventoRubro(db);
    expect(
      await edicionRubroEvento(db, admin, { eventoRubroId, dias: "1", presupuesto: "100", presupuestoMoneda: "USD" }),
    ).toEqual({ ok: true });
    expect(await registroPago(db, admin, { eventoRubroId, pagado: "90", pagadoMoneda: "USD", pagadoFecha: "" })).toEqual({
      ok: true,
    });
    expect(await cierreEvento(db, admin, { eventoId })).toEqual({ ok: false, error: "Falta el tipo de cambio de USD" });
    expect(await guardadoTipoCambio(db, admin, { eventoId, moneda: "USD", valorArs: "1400" })).toEqual({ ok: true });
    expect(await cierreEvento(db, admin, { eventoId })).toEqual({ ok: true });
    expect(await registroPago(db, admin, { eventoRubroId, pagado: "1", pagadoMoneda: "ARS" })).toEqual({
      ok: false,
      error: "El evento está cerrado: solo lectura",
    });
    expect(await reaperturaEvento(db, admin, { eventoId })).toEqual({ ok: true });
    expect(await edicionEvento(db, admin, { eventoId, nombre: "Vibra Bolivia 2027", lugar: "La Paz" })).toEqual({ ok: true });
    expect((await obtenerEvento(db, eventoId))?.lugar).toBe("La Paz");
  });

  it("agrega y quita rubros del evento", async () => {
    const eventoId = await idVibra(db);
    expect(await bajaRubroEvento(db, admin, { eventoRubroId: await idEventoRubro(db, "Luces") })).toEqual({ ok: true });
    const luces = await idRubro(db, "Luces");
    expect(await altaRubrosEvento(db, admin, { eventoId, [`rubro-${luces}`]: "on", [`dias-${luces}`]: "1" })).toEqual({
      ok: true,
    });
    expect((await obtenerEventoRubro(db, await idEventoRubro(db, "Luces")))?.dias).toBe(1);
  });
});
