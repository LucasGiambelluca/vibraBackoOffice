import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { aprobarCotizacion } from "@/lib/cotizaciones";
import { guardarTipoCambio } from "@/lib/eventos";
import { editarRubroEvento, pagoSchema, presupuestoSchema, registrarPago } from "@/lib/evento-rubros";
import { desvio, resumenEvento } from "@/lib/resumen";
import { crearDbPrueba } from "../helpers/db";
import { idEventoRubro, idVibra, nuevaCotizacion, nuevoProveedor } from "../helpers/presupuestos";

let db: Db;
let vibra: string;
let proveedor: string;
beforeEach(async () => {
  db = await crearDbPrueba();
  vibra = await idVibra(db);
  proveedor = await nuevoProveedor(db);
});

const rubroDe = (resumen: Awaited<ReturnType<typeof resumenEvento>>, nombre: string) =>
  resumen.grupos.flatMap((g) => g.rubros).find((r) => r.nombre === nombre)!;

describe("resumenEvento", () => {
  it("sin cotizaciones: los 6 grupos, nada aprobado y totales en 0", async () => {
    const resumen = await resumenEvento(db, vibra);
    expect(resumen.grupos).toHaveLength(6);
    expect(resumen.grupos[1].rubros).toHaveLength(5);
    expect(resumen.grupos[0].rubros).toHaveLength(0);
    expect(rubroDe(resumen, "Sonido")).toMatchObject({ cotizaciones: 0, aprobada: null, presupuesto: null, pagado: null });
    expect(resumen.totales).toEqual({
      presupuesto: { ars: 0, faltan: [] },
      aprobado: { ars: 0, faltan: [] },
      pagado: { ars: 0, faltan: [] },
    });
  });

  it("cuenta cotizaciones, muestra la aprobada y suma presupuesto, aprobado y pagado", async () => {
    const sonido = await idEventoRubro(db, "Sonido");
    const a = await nuevaCotizacion(db, sonido, proveedor);
    await nuevaCotizacion(db, sonido, proveedor);
    await nuevaCotizacion(db, await idEventoRubro(db, "Luces"), proveedor);
    await aprobarCotizacion(db, a);
    await editarRubroEvento(db, sonido, presupuestoSchema.parse({ dias: "2", presupuesto: "2", presupuestoMoneda: "USD" }));
    await registrarPago(db, sonido, pagoSchema.parse({ pagado: "2000", pagadoMoneda: "ARS" }));
    await guardarTipoCambio(db, vibra, { moneda: "USD", valorArs: "1000" }, null);

    const resumen = await resumenEvento(db, vibra);
    expect(rubroDe(resumen, "Sonido")).toMatchObject({
      cotizaciones: 2,
      aprobada: { id: a, total: 1800, proveedor: "Sonido Andino" },
      presupuesto: { monto: 2, moneda: "USD" },
      pagado: { monto: 2000, moneda: "ARS" },
    });
    expect(rubroDe(resumen, "Luces").aprobada).toBeNull();
    expect(resumen.totales).toEqual({
      presupuesto: { ars: 2000, faltan: [] },
      aprobado: { ars: 1800, faltan: [] },
      pagado: { ars: 2000, faltan: [] },
    });
  });

  it("si falta un tipo de cambio, el total avisa", async () => {
    const a = await nuevaCotizacion(db, await idEventoRubro(db, "Sonido"), proveedor, { moneda: "USD" });
    await aprobarCotizacion(db, a);
    expect((await resumenEvento(db, vibra)).totales.aprobado).toEqual({ ars: null, faltan: ["USD"] });
  });
});

describe("desvio", () => {
  it("compara en ARS lo real contra el presupuesto", () => {
    expect(desvio({ monto: 100, moneda: "USD" }, { monto: 154000, moneda: "ARS" }, { USD: 1400 })).toBeCloseTo(0.1);
    expect(desvio({ monto: 1000, moneda: "ARS" }, { monto: 950, moneda: "ARS" }, {})).toBeCloseTo(-0.05);
  });

  it("null si falta presupuesto, lo real, un tipo de cambio o el presupuesto es 0", () => {
    expect(desvio(null, { monto: 1, moneda: "ARS" }, {})).toBeNull();
    expect(desvio({ monto: 1, moneda: "ARS" }, null, {})).toBeNull();
    expect(desvio({ monto: 1, moneda: "USD" }, { monto: 1, moneda: "ARS" }, {})).toBeNull();
    expect(desvio({ monto: 0, moneda: "ARS" }, { monto: 1, moneda: "ARS" }, {})).toBeNull();
  });
});
