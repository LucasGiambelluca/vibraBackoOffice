import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { esViolacionUnica } from "@/db/errores";
import { cotizacion } from "@/db/schema";
import { subirArchivo } from "@/lib/archivos";
import { guardarArchivo } from "@/lib/archivos-disco";
import {
  aprobarCotizacion,
  borrarCotizacion,
  cotizacionSchema,
  editarCotizacion,
  idMasBarata,
  listarCotizaciones,
  obtenerCotizacion,
  revertirAprobacion,
  type CotizacionListada,
} from "@/lib/cotizaciones";
import { borrarProveedor } from "@/lib/proveedores";
import { cerrarEvento, crearEvento, eventoSchema, guardarTipoCambio } from "@/lib/eventos";
import { quitarRubro } from "@/lib/evento-rubros";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import {
  COTIZACION,
  idEventoRubro,
  idRubro,
  idVibra,
  nuevaCotizacion,
  nuevoProveedor,
  pdf,
  usarUploadsTemporal,
} from "../helpers/presupuestos";

const estado = async (db: Db, id: string) => (await obtenerCotizacion(db, id))?.estado;

describe("cotizacionSchema", () => {
  const base = { ...COTIZACION, proveedorId: "p1" };
  const error = (extra: Record<string, string>) =>
    cotizacionSchema.safeParse({ ...base, ...extra }).error?.issues[0].message;

  it("descuento vacío es 0 y acepta coma decimal", () => {
    expect(cotizacionSchema.parse({ ...base, descuento2Dias: "", precioDia: "1500,5" })).toMatchObject({
      descuento2Dias: "0",
      precioDia: "1500.5",
    });
  });

  it("rechaza precio 0, descuento > 100 y moneda desconocida", () => {
    expect(error({ precioDia: "0" })).toBe("El precio debe ser mayor a 0");
    expect(error({ descuento2Dias: "150" })).toBe("El descuento debe estar entre 0 y 100");
    expect(error({ moneda: "EUR" })).toBe("Moneda inválida");
    expect(error({ proveedorId: "" })).toBe("Elegí un proveedor");
  });

  it("rechaza precios que no entran en la columna (12 dígitos enteros)", () => {
    expect(error({ precioDia: "1000000000000" })).toBe("El precio es demasiado grande");
    expect(error({ descuento2Dias: "1000" })).toBe("El descuento debe estar entre 0 y 100");
  });
});

describe("con DB", () => {
  let db: Db;
  let sonido: string;
  let luces: string;
  let proveedor: string;

  beforeEach(async () => {
    usarUploadsTemporal();
    db = await crearDbPrueba();
    sonido = await idEventoRubro(db, "Sonido");
    luces = await idEventoRubro(db, "Luces");
    proveedor = await nuevoProveedor(db);
  });

  describe("listarCotizaciones", () => {
    it("calcula totales con los días del rubro", async () => {
      await nuevaCotizacion(db, sonido, proveedor);
      const [c] = await listarCotizaciones(db, { eventoRubroId: sonido });
      expect(c).toMatchObject({
        evento: "Vibra Bolivia 2027",
        rubro: "Sonido",
        proveedor: "Sonido Andino",
        estado: "pendiente",
        precioDia: 1000,
        descuento2Dias: 10,
        total: 1800,
        ahorro: 200,
        totalArs: 1800,
      });
    });

    it("guarda el precio más grande permitido", async () => {
      await nuevaCotizacion(db, sonido, proveedor, { precioDia: "999999999999.99", descuento2Dias: "0" });
      expect((await listarCotizaciones(db))[0]).toMatchObject({ precioDia: 999999999999.99, total: 1999999999999.98 });
    });

    it("totalArs es null si falta el tipo de cambio de su evento", async () => {
      await nuevaCotizacion(db, sonido, proveedor, { moneda: "USD", precioDia: "100", descuento2Dias: "0" });
      expect((await listarCotizaciones(db))[0].totalArs).toBeNull();

      await guardarTipoCambio(db, await idVibra(db), { moneda: "USD", valorArs: "1400" }, null);
      expect((await listarCotizaciones(db))[0]).toMatchObject({ total: 200, totalArs: 280000 });
    });

    it("filtra por rubro, proveedor y estado", async () => {
      const otro = await nuevoProveedor(db, "Luz Total");
      await nuevaCotizacion(db, sonido, proveedor);
      await nuevaCotizacion(db, luces, otro);
      expect(await listarCotizaciones(db, { eventoRubroId: luces })).toHaveLength(1);
      expect(await listarCotizaciones(db, { proveedorId: proveedor })).toHaveLength(1);
      expect(await listarCotizaciones(db, { estado: "aprobada" })).toHaveLength(0);
      expect(await listarCotizaciones(db)).toHaveLength(2);
    });
  });

  describe("aprobarCotizacion", () => {
    it("aprueba una y descarta las demás del rubro, sin tocar otros rubros", async () => {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      const b = await nuevaCotizacion(db, sonido, proveedor);
      const otroRubro = await nuevaCotizacion(db, luces, proveedor);

      await aprobarCotizacion(db, a);
      expect(await estado(db, a)).toBe("aprobada");
      expect(await estado(db, b)).toBe("descartada");
      expect(await estado(db, otroRubro)).toBe("pendiente");

      await aprobarCotizacion(db, b);
      expect(await estado(db, a)).toBe("descartada");
      expect(await estado(db, b)).toBe("aprobada");
    });

    it("guarda quién y cuándo aprobó; la que queda descartada lo pierde", async () => {
      const { admin } = await crearActores(db);
      const a = await nuevaCotizacion(db, sonido, proveedor);
      const b = await nuevaCotizacion(db, sonido, proveedor);
      await aprobarCotizacion(db, a, admin.id);
      const fila = await obtenerCotizacion(db, a);
      expect(fila?.aprobadaPor).toBe(admin.id);
      expect(fila?.aprobadaAt).toBeInstanceOf(Date);
      expect((await listarCotizaciones(db, { estado: "aprobada" }))[0].aprobador).toBe("admin@vibra.bo");

      await aprobarCotizacion(db, b, admin.id);
      expect(await obtenerCotizacion(db, a)).toMatchObject({ aprobadaPor: null, aprobadaAt: null });
    });

    it("dos aprobaciones a la vez en el mismo rubro terminan con una sola aprobada", async () => {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      const b = await nuevaCotizacion(db, sonido, proveedor);
      await Promise.all([aprobarCotizacion(db, a), aprobarCotizacion(db, b)]);
      const estados = [await estado(db, a), await estado(db, b)].sort();
      expect(estados).toEqual(["aprobada", "descartada"]);
    });

    it("si choca con otra aprobación simultánea da un error de negocio", async () => {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      vi.spyOn(db, "transaction").mockRejectedValueOnce(Object.assign(new Error("duplicada"), { code: "23505" }));
      await expect(aprobarCotizacion(db, a)).rejects.toThrow(
        "Otra cotización del rubro se aprobó al mismo tiempo. Recargá la página.",
      );
    });

    it("falla si la cotización no existe", async () => {
      await expect(aprobarCotizacion(db, "no-existe")).rejects.toThrow("La cotización no existe");
    });

    it("la DB impide dos aprobadas en el mismo rubro", async () => {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      const b = await nuevaCotizacion(db, sonido, proveedor);
      await aprobarCotizacion(db, a);
      const error = await db
        .update(cotizacion)
        .set({ estado: "aprobada" })
        .where(eq(cotizacion.id, b))
        .catch((e: unknown) => e);
      expect(esViolacionUnica(error)).toBe(true);
    });
  });

  describe("por evento", () => {
    it("una aprobada por rubro y por evento: dos eventos con el mismo rubro no se pisan", async () => {
      const otro = await crearEvento(db, eventoSchema.parse({ nombre: "Vibra 2028" }), {
        rubros: [{ rubroId: await idRubro(db, "Sonido"), dias: 1 }],
      });
      const sonido2028 = await idEventoRubro(db, "Sonido", otro);
      const a = await nuevaCotizacion(db, sonido, proveedor);
      const b = await nuevaCotizacion(db, sonido2028, proveedor);
      await aprobarCotizacion(db, a);
      await aprobarCotizacion(db, b);
      expect([await estado(db, a), await estado(db, b)]).toEqual(["aprobada", "aprobada"]);
      // El total usa los días del rubro en cada evento.
      expect((await listarCotizaciones(db, { eventoId: otro }))[0]).toMatchObject({ evento: "Vibra 2028", total: 1000 });
    });

    it("con el evento cerrado no se crea, edita, aprueba, revierte ni borra", async () => {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      const b = await nuevaCotizacion(db, sonido, proveedor);
      await aprobarCotizacion(db, b);
      await cerrarEvento(db, await idVibra(db), null);
      const cerrado = "El evento está cerrado: solo lectura";
      await expect(nuevaCotizacion(db, sonido, proveedor)).rejects.toThrow(cerrado);
      await expect(editarCotizacion(db, a, { ...COTIZACION, moneda: "ARS", proveedorId: proveedor })).rejects.toThrow(cerrado);
      await expect(aprobarCotizacion(db, a)).rejects.toThrow(cerrado);
      await expect(revertirAprobacion(db, b)).rejects.toThrow(cerrado);
      await expect(borrarCotizacion(db, a)).rejects.toThrow(cerrado);
    });

    it("rubro del evento inexistente", async () => {
      await expect(nuevaCotizacion(db, "nada", proveedor)).rejects.toThrow("Rubro inválido");
    });
  });

  describe("revertirAprobacion", () => {
    it("vuelve a pendiente; las descartadas quedan descartadas", async () => {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      const b = await nuevaCotizacion(db, sonido, proveedor);
      await aprobarCotizacion(db, a);
      await revertirAprobacion(db, a);
      expect(await obtenerCotizacion(db, a)).toMatchObject({ estado: "pendiente", aprobadaPor: null, aprobadaAt: null });
      expect(await estado(db, b)).toBe("descartada");
    });

    it("falla si no está aprobada", async () => {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      await expect(revertirAprobacion(db, a)).rejects.toThrow("La cotización no está aprobada");
    });
  });

  describe("editarCotizacion", () => {
    const cambios = { ...COTIZACION, precioDia: "500", descuento2Dias: "0", moneda: "BOB" as const };

    it("cambia los datos", async () => {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      await editarCotizacion(db, a, { ...cambios, proveedorId: proveedor });
      expect(await obtenerCotizacion(db, a)).toMatchObject({ precioDia: "500.00", moneda: "BOB" });
    });


    it("una aprobada vuelve a pendiente, salvo que se pida conservar la aprobación", async () => {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      await aprobarCotizacion(db, a);
      await editarCotizacion(db, a, { ...cambios, proveedorId: proveedor }, true);
      expect(await estado(db, a)).toBe("aprobada");
      await editarCotizacion(db, a, { ...cambios, proveedorId: proveedor });
      expect(await estado(db, a)).toBe("pendiente");
    });

    it("falla si no existe", async () => {
      await expect(editarCotizacion(db, "no-existe", { ...cambios, proveedorId: proveedor })).rejects.toThrow(
        "La cotización no existe",
      );
    });
  });

  describe("borrarCotizacion", () => {
    /** Una cotización con un PDF adjunto; devuelve su id y el nombre del PDF en disco. */
    async function conPdf() {
      const a = await nuevaCotizacion(db, sonido, proveedor);
      const guardado = await guardarArchivo(pdf());
      await subirArchivo(db, { tipo: "cotizacion", id: a }, guardado, "cotizacion.pdf", null);
      return { a, nombre: guardado.guardado };
    }

    it("borra la fila y sus archivos", async () => {
      const { a, nombre } = await conPdf();
      await borrarCotizacion(db, a);
      expect(await obtenerCotizacion(db, a)).toBeUndefined();
      expect(existsSync(path.join(process.env.UPLOADS_DIR!, nombre))).toBe(false);
      await expect(borrarCotizacion(db, a)).rejects.toThrow("La cotización no existe");
    });

    it("borra la fila aunque el PDF no se pueda borrar", async () => {
      const { a, nombre } = await conPdf();
      rmSync(path.join(process.env.UPLOADS_DIR!, nombre));
      mkdirSync(path.join(process.env.UPLOADS_DIR!, nombre));
      vi.spyOn(console, "error").mockImplementation(() => {});
      await borrarCotizacion(db, a);
      expect(await obtenerCotizacion(db, a)).toBeUndefined();
      vi.restoreAllMocks();
    });
  });

  it("no se puede quitar un rubro del evento ni borrar un proveedor con cotizaciones", async () => {
    await nuevaCotizacion(db, sonido, proveedor);
    await expect(quitarRubro(db, sonido)).rejects.toThrow("El rubro tiene cotizaciones: borralas primero");
    await expect(borrarProveedor(db, proveedor)).rejects.toThrow("El proveedor tiene cotizaciones: borralas primero");
  });
});

describe("idMasBarata", () => {
  const c = (id: string, totalArs: number | null, estado: CotizacionListada["estado"] = "pendiente") =>
    ({ id, totalArs, estado }) as CotizacionListada;

  it("la de menor total en ARS, ignorando descartadas y sin tipo de cambio", () => {
    expect(idMasBarata([c("a", 500), c("b", 300, "descartada"), c("c", null), c("d", 400)])).toBe("d");
  });

  it("null si no hay candidatas", () => {
    expect(idMasBarata([c("a", null)])).toBeNull();
  });
});
