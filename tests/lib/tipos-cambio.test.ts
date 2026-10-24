import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { guardarTipoCambio, listarTiposCambio, obtenerTiposCambio, tipoCambioSchema } from "@/lib/tipos-cambio";
import { crearDbPrueba } from "../helpers/db";

describe("tipoCambioSchema", () => {
  it("acepta coma decimal y hasta 6 decimales", () => {
    expect(tipoCambioSchema.parse({ moneda: "ARS", valorBob: "0,007512" })).toEqual({
      moneda: "ARS",
      valorBob: "0.007512",
    });
  });

  it("rechaza BOB/EUR y valores no positivos", () => {
    expect(tipoCambioSchema.safeParse({ moneda: "BOB", valorBob: "1" }).error?.issues[0].message).toBe("Moneda inválida");
    expect(tipoCambioSchema.safeParse({ moneda: "USD", valorBob: "0" }).error?.issues[0].message).toBe(
      "El valor debe ser mayor a 0",
    );
  });

  it("rechaza valores que no entran en la columna (8 dígitos enteros)", () => {
    expect(tipoCambioSchema.safeParse({ moneda: "USD", valorBob: "123456789" }).error?.issues[0].message).toBe(
      "El valor es demasiado grande",
    );
  });
});

describe("con DB", () => {
  let db: Db;
  beforeEach(async () => {
    db = await crearDbPrueba();
  });

  it("guarda el valor más grande permitido", async () => {
    await guardarTipoCambio(db, tipoCambioSchema.parse({ moneda: "USD", valorBob: "99999999.999999" }), null);
    expect(await obtenerTiposCambio(db)).toEqual({ USD: 99999999.999999 });
  });

  it("sin datos no hay tipos de cambio", async () => {
    expect(await obtenerTiposCambio(db)).toEqual({});
  });

  it("guarda y actualiza (una fila por moneda)", async () => {
    await guardarTipoCambio(db, tipoCambioSchema.parse({ moneda: "USD", valorBob: "6.96" }), null);
    await guardarTipoCambio(db, tipoCambioSchema.parse({ moneda: "USD", valorBob: "7" }), null);
    await guardarTipoCambio(db, tipoCambioSchema.parse({ moneda: "ARS", valorBob: "0.0075" }), null);
    expect(await obtenerTiposCambio(db)).toEqual({ USD: 7, ARS: 0.0075 });

    const lista = await listarTiposCambio(db);
    expect(lista).toHaveLength(2);
    expect(lista.find((t) => t.moneda === "USD")).toMatchObject({ valorBob: "7.000000", actualizadoPor: null });
  });
});
