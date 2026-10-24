import { beforeEach, describe, expect, it } from "vitest";
import { altaRubro, bajaRubro, edicionRubro } from "@/app/(app)/configuracion/rubros/operaciones";
import { actualizacionTipoCambio } from "@/app/(app)/configuracion/tipos-cambio/operaciones";
import type { Db } from "@/db/client";
import type { Actor } from "@/lib/permissions";
import { listarRubros, obtenerRubro } from "@/lib/rubros";
import { listarTiposCambio, obtenerTiposCambio } from "@/lib/tipos-cambio";
import { crearActores, SIN_PERMISO } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { idRubro } from "../helpers/presupuestos";

const RUBRO = { nombre: "Catering", areaId: "3", dias: "1" };

let db: Db;
let admin: Actor;
let editor: Actor;
beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
});

describe("rubros", () => {
  it("el editor no puede crear, editar ni borrar", async () => {
    const sonido = await idRubro(db);
    expect(await altaRubro(db, editor, RUBRO)).toEqual(SIN_PERMISO);
    expect(await edicionRubro(db, editor, { ...RUBRO, rubroId: sonido })).toEqual(SIN_PERMISO);
    expect(await bajaRubro(db, editor, { rubroId: sonido })).toEqual(SIN_PERMISO);
    expect(await listarRubros(db)).toHaveLength(7);
  });

  it("el admin crea, edita y borra", async () => {
    expect(await altaRubro(db, admin, RUBRO)).toEqual({ ok: true });
    const id = await idRubro(db, "Catering");
    expect(await edicionRubro(db, admin, { ...RUBRO, dias: "2", rubroId: id })).toEqual({ ok: true });
    expect((await obtenerRubro(db, id))?.dias).toBe(2);
    expect(await bajaRubro(db, admin, { rubroId: id })).toEqual({ ok: true });
  });

  it("errores de validación vuelven como Resultado", async () => {
    expect(await altaRubro(db, admin, { ...RUBRO, dias: "5" })).toEqual({
      ok: false,
      error: "Los días deben ser 1 o 2",
    });
    expect(await bajaRubro(db, admin, {})).toEqual({ ok: false, error: "Rubro inválido" });
  });
});

describe("tipos de cambio", () => {
  it("el editor no puede actualizar", async () => {
    expect(await actualizacionTipoCambio(db, editor, { moneda: "USD", valorBob: "6.96" })).toEqual(SIN_PERMISO);
    expect(await obtenerTiposCambio(db)).toEqual({});
  });

  it("el admin actualiza y queda registrado quién", async () => {
    expect(await actualizacionTipoCambio(db, admin, { moneda: "USD", valorBob: "6,96" })).toEqual({ ok: true });
    expect(await obtenerTiposCambio(db)).toEqual({ USD: 6.96 });
    expect((await listarTiposCambio(db))[0].actualizadoPor).toBe("admin@vibra.bo");
  });
});
