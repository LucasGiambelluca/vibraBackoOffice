import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { aprobarCotizacion } from "@/lib/cotizaciones";
import { resumenPresupuesto } from "@/lib/resumen";
import { crearDbPrueba } from "../helpers/db";
import { idRubro, nuevaCotizacion, nuevoProveedor } from "../helpers/presupuestos";

let db: Db;
let proveedor: string;
beforeEach(async () => {
  db = await crearDbPrueba();
  proveedor = await nuevoProveedor(db);
});

const rubroDe = (resumen: Awaited<ReturnType<typeof resumenPresupuesto>>, nombre: string) =>
  resumen.areas.flatMap((a) => a.rubros).find((r) => r.nombre === nombre)!;

describe("resumenPresupuesto", () => {
  it("sin cotizaciones: las 6 áreas, nada aprobado y total 0", async () => {
    const resumen = await resumenPresupuesto(db);
    expect(resumen.areas).toHaveLength(6);
    expect(resumen.areas[1].rubros).toHaveLength(5);
    expect(resumen.areas[0].rubros).toHaveLength(0);
    expect(rubroDe(resumen, "Sonido")).toMatchObject({ cotizaciones: 0, aprobada: null });
    expect(resumen.total).toEqual({ bob: 0, faltan: [] });
  });

  it("cuenta cotizaciones, muestra la aprobada y suma solo aprobadas", async () => {
    const sonido = await idRubro(db, "Sonido");
    const a = await nuevaCotizacion(db, sonido, proveedor);
    await nuevaCotizacion(db, sonido, proveedor);
    await nuevaCotizacion(db, await idRubro(db, "Luces"), proveedor);
    await aprobarCotizacion(db, a);

    const resumen = await resumenPresupuesto(db);
    expect(rubroDe(resumen, "Sonido").cotizaciones).toBe(2);
    expect(rubroDe(resumen, "Sonido").aprobada).toMatchObject({ id: a, total: 1800, proveedor: "Sonido Andino" });
    expect(rubroDe(resumen, "Luces").aprobada).toBeNull();
    expect(resumen.total).toEqual({ bob: 1800, faltan: [] });
  });

  it("si una aprobada no tiene tipo de cambio, el total avisa", async () => {
    const a = await nuevaCotizacion(db, await idRubro(db, "Sonido"), proveedor, { moneda: "USD" });
    await aprobarCotizacion(db, a);
    expect((await resumenPresupuesto(db)).total).toEqual({ bob: null, faltan: ["USD"] });
  });
});
