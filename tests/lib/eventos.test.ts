import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { cotizacion, evento, eventoRubro } from "@/db/schema";
import {
  asegurarEventoAbierto,
  cerrarEvento,
  crearEvento,
  editarEvento,
  eventoSchema,
  guardarTipoCambio,
  listarEventos,
  listarTiposCambio,
  obtenerEvento,
  obtenerTiposCambio,
  reabrirEvento,
  tipoCambioSchema,
} from "@/lib/eventos";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { idEventoRubro, idRubro, idVibra, nuevaCotizacion, nuevoProveedor } from "../helpers/presupuestos";

const datos = (extra: Record<string, string> = {}) => eventoSchema.parse({ nombre: "Vibra Bolivia 2028", ...extra });

describe("eventoSchema", () => {
  it("fechas y lugar opcionales", () => {
    expect(datos()).toEqual({ nombre: "Vibra Bolivia 2028", fechaInicio: null, fechaFin: null, lugar: null });
  });

  it("el fin no puede ser antes del inicio", () => {
    const r = eventoSchema.safeParse({ nombre: "X evento", fechaInicio: "2028-03-02", fechaFin: "2028-03-01" });
    expect(r.error?.issues[0].message).toBe("La fecha de fin es anterior a la de inicio");
  });

  it("tipo de cambio en ARS, con coma o punto", () => {
    expect(tipoCambioSchema.parse({ moneda: "USD", valorArs: "1435,5" })).toEqual({ moneda: "USD", valorArs: "1435.5" });
    expect(tipoCambioSchema.safeParse({ moneda: "ARS", valorArs: "1" }).error?.issues[0].message).toBe("Moneda inválida");
  });
});

describe("con DB", () => {
  let db: Db;
  let adminId: string;
  beforeEach(async () => {
    db = await crearDbPrueba();
    adminId = (await crearActores(db)).admin.id;
  });

  async function rubrosDe(eventoId: string) {
    return db.select().from(eventoRubro).where(eq(eventoRubro.eventoId, eventoId));
  }

  it("crea un evento con los rubros elegidos", async () => {
    const id = await crearEvento(db, datos({ lugar: "La Paz" }), {
      rubros: [
        { rubroId: await idRubro(db, "Sonido"), dias: 1 },
        { rubroId: await idRubro(db, "Luces"), dias: 2 },
      ],
    });
    expect(await obtenerEvento(db, id)).toMatchObject({ nombre: "Vibra Bolivia 2028", lugar: "La Paz", estado: "activo" });
    expect((await rubrosDe(id)).map((r) => r.dias).sort()).toEqual([1, 2]);
  });

  it("copia rubros y días de otro evento; el presupuesto solo si se pide; nunca cotizaciones", async () => {
    const vibra = await idVibra(db);
    const sonido = await idEventoRubro(db, "Sonido");
    await db.update(eventoRubro).set({ dias: 1, presupuesto: "5000", presupuestoMoneda: "USD" }).where(eq(eventoRubro.id, sonido));
    await nuevaCotizacion(db, sonido, await nuevoProveedor(db));

    const sin = await crearEvento(db, datos(), { copiarDe: vibra, conPresupuesto: false });
    const con = await crearEvento(db, datos({ nombre: "Otro 2028" }), { copiarDe: vibra, conPresupuesto: true });

    const rubroSonido = await idRubro(db, "Sonido");
    const [copiaSin] = (await rubrosDe(sin)).filter((r) => r.rubroId === rubroSonido);
    const [copiaCon] = (await rubrosDe(con)).filter((r) => r.rubroId === rubroSonido);
    expect(await rubrosDe(sin)).toHaveLength(7);
    expect(copiaSin).toMatchObject({ dias: 1, presupuesto: null, presupuestoMoneda: null, pagado: null });
    expect(copiaCon).toMatchObject({ dias: 1, presupuesto: "5000.00", presupuestoMoneda: "USD" });
    expect(await db.select().from(cotizacion)).toHaveLength(1);
  });

  it("nombre repetido", async () => {
    await expect(crearEvento(db, datos({ nombre: "Vibra Bolivia 2027" }), { rubros: [] })).rejects.toThrow(
      "Ya existe un evento con ese nombre",
    );
  });

  it("copiar de un evento que no existe", async () => {
    await expect(crearEvento(db, datos(), { copiarDe: "nada", conPresupuesto: false })).rejects.toThrow(
      "El evento a copiar no existe",
    );
  });

  it("lista los activos primero", async () => {
    const vibra = await idVibra(db);
    await crearEvento(db, datos(), { rubros: [] });
    await cerrarEvento(db, vibra, adminId);
    expect((await listarEventos(db)).map((e) => [e.nombre, e.estado])).toEqual([
      ["Vibra Bolivia 2028", "activo"],
      ["Vibra Bolivia 2027", "cerrado"],
    ]);
  });

  it("tipos de cambio por evento, independientes entre eventos", async () => {
    const vibra = await idVibra(db);
    const otro = await crearEvento(db, datos(), { rubros: [] });
    await guardarTipoCambio(db, vibra, tipoCambioSchema.parse({ moneda: "USD", valorArs: "1400" }), adminId);
    await guardarTipoCambio(db, vibra, tipoCambioSchema.parse({ moneda: "USD", valorArs: "1450" }), adminId);
    await guardarTipoCambio(db, otro, tipoCambioSchema.parse({ moneda: "BOB", valorArs: "205" }), adminId);
    expect(await obtenerTiposCambio(db, vibra)).toEqual({ USD: 1450 });
    expect(await obtenerTiposCambio(db, otro)).toEqual({ BOB: 205 });
    expect(await listarTiposCambio(db, vibra)).toEqual([
      { moneda: "USD", valorArs: "1450.000000", updatedAt: expect.any(Date), actualizadoPor: "admin@vibra.bo" },
    ]);
  });

  describe("cerrar", () => {
    it("no cierra si falta el tipo de cambio de una moneda usada", async () => {
      const vibra = await idVibra(db);
      await nuevaCotizacion(db, await idEventoRubro(db, "Sonido"), await nuevoProveedor(db), { moneda: "USD" });
      await db.update(eventoRubro).set({ pagado: "10", pagadoMoneda: "BOB" }).where(eq(eventoRubro.id, await idEventoRubro(db, "Luces")));
      await expect(cerrarEvento(db, vibra, adminId)).rejects.toThrow("Falta el tipo de cambio de BOB, USD");

      await guardarTipoCambio(db, vibra, tipoCambioSchema.parse({ moneda: "USD", valorArs: "1400" }), adminId);
      await guardarTipoCambio(db, vibra, tipoCambioSchema.parse({ moneda: "BOB", valorArs: "200" }), adminId);
      await cerrarEvento(db, vibra, adminId);
      expect(await obtenerEvento(db, vibra)).toMatchObject({ estado: "cerrado", cerradoPor: adminId, cerradoAt: expect.any(Date) });
    });

    it("en ARS no necesita tipos de cambio", async () => {
      const vibra = await idVibra(db);
      await nuevaCotizacion(db, await idEventoRubro(db, "Sonido"), await nuevoProveedor(db), { moneda: "ARS" });
      await cerrarEvento(db, vibra, adminId);
      expect((await obtenerEvento(db, vibra))?.estado).toBe("cerrado");
    });

    it("cerrado es solo lectura hasta que se reabre", async () => {
      const vibra = await idVibra(db);
      await cerrarEvento(db, vibra, adminId);
      await expect(cerrarEvento(db, vibra, adminId)).rejects.toThrow("El evento ya está cerrado");
      await expect(asegurarEventoAbierto(db, vibra)).rejects.toThrow("El evento está cerrado: solo lectura");
      await expect(editarEvento(db, vibra, datos())).rejects.toThrow("El evento está cerrado");
      await expect(
        guardarTipoCambio(db, vibra, tipoCambioSchema.parse({ moneda: "USD", valorArs: "1" }), adminId),
      ).rejects.toThrow("El evento está cerrado");

      await reabrirEvento(db, vibra);
      expect(await obtenerEvento(db, vibra)).toMatchObject({ estado: "activo", cerradoPor: null, cerradoAt: null });
      await editarEvento(db, vibra, datos());
      expect((await obtenerEvento(db, vibra))?.nombre).toBe("Vibra Bolivia 2028");
      await expect(reabrirEvento(db, vibra)).rejects.toThrow("El evento no está cerrado");
    });

    it("evento inexistente", async () => {
      await expect(asegurarEventoAbierto(db, "nada")).rejects.toThrow("El evento no existe");
      expect(await db.select().from(evento).where(eq(evento.id, "nada"))).toEqual([]);
    });
  });
});
