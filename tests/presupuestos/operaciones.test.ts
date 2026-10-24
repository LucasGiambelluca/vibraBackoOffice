import { readdirSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  altaCotizacion,
  aprobacion,
  bajaCotizacion,
  edicionCotizacion,
  reversion,
} from "@/app/(app)/presupuestos/operaciones";
import type { Db } from "@/db/client";
import { listarCotizaciones, obtenerCotizacion } from "@/lib/cotizaciones";
import type { Actor } from "@/lib/permissions";
import { crearActores, SIN_PERMISO } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { COTIZACION, idRubro, nuevaCotizacion, nuevoProveedor, pdf, usarUploadsTemporal } from "../helpers/presupuestos";

let db: Db;
let admin: Actor;
let editor: Actor;
let rubroId: string;
let proveedorId: string;
let uploads: string;

beforeEach(async () => {
  uploads = usarUploadsTemporal();
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
  rubroId = await idRubro(db);
  proveedorId = await nuevoProveedor(db);
});

describe("altaCotizacion", () => {
  it("el editor crea una cotización con PDF y queda como creador", async () => {
    const datos = { ...COTIZACION, rubroId, proveedorId, adjunto: pdf() };
    expect(await altaCotizacion(db, editor, datos)).toEqual({ ok: true });
    const [c] = await listarCotizaciones(db, { rubroId });
    const fila = await obtenerCotizacion(db, c.id);
    expect(fila).toMatchObject({ creadoPor: editor.id, estado: "pendiente" });
    expect(readdirSync(uploads)).toEqual([fila!.adjunto]);
  });

  it("un adjunto que no es PDF vuelve como error y no crea nada", async () => {
    const datos = { ...COTIZACION, rubroId, proveedorId, adjunto: new File(["hola"], "x.pdf") };
    expect(await altaCotizacion(db, editor, datos)).toEqual({ ok: false, error: "El adjunto debe ser un PDF" });
    expect(await listarCotizaciones(db)).toHaveLength(0);
  });

  it("si la cotización no se puede guardar, no queda el PDF", async () => {
    const datos = { ...COTIZACION, rubroId: "no-existe", proveedorId, adjunto: pdf() };
    expect(await altaCotizacion(db, editor, datos)).toEqual({ ok: false, error: "Rubro o proveedor inválido" });
    expect(readdirSync(uploads)).toEqual([]);
  });
});

describe("edicionCotizacion", () => {
  it("cambia datos y puede quitar el adjunto", async () => {
    await altaCotizacion(db, editor, { ...COTIZACION, rubroId, proveedorId, adjunto: pdf() });
    const [c] = await listarCotizaciones(db);
    const cambios = { ...COTIZACION, cotizacionId: c.id, proveedorId, precioDia: "900", quitarAdjunto: "on" };
    expect(await edicionCotizacion(db, editor, cambios)).toEqual({ ok: true });
    expect(await obtenerCotizacion(db, c.id)).toMatchObject({ precioDia: "900.00", adjunto: null });
    expect(readdirSync(uploads)).toEqual([]);
  });
});

describe("aprobación y borrado", () => {
  it("el editor no puede aprobar, revertir ni borrar", async () => {
    const id = await nuevaCotizacion(db, rubroId, proveedorId);
    expect(await aprobacion(db, editor, { cotizacionId: id })).toEqual(SIN_PERMISO);
    expect(await reversion(db, editor, { cotizacionId: id })).toEqual(SIN_PERMISO);
    expect(await bajaCotizacion(db, editor, { cotizacionId: id })).toEqual(SIN_PERMISO);
    expect((await obtenerCotizacion(db, id))?.estado).toBe("pendiente");
  });

  it("el admin aprueba, revierte y borra", async () => {
    const id = await nuevaCotizacion(db, rubroId, proveedorId);
    expect(await aprobacion(db, admin, { cotizacionId: id })).toEqual({ ok: true });
    expect((await obtenerCotizacion(db, id))?.estado).toBe("aprobada");
    expect(await reversion(db, admin, { cotizacionId: id })).toEqual({ ok: true });
    expect(await bajaCotizacion(db, admin, { cotizacionId: id })).toEqual({ ok: true });
    expect(await obtenerCotizacion(db, id)).toBeUndefined();
  });

  it("sin id vuelve como error", async () => {
    expect(await aprobacion(db, admin, {})).toEqual({ ok: false, error: "Cotización inválida" });
  });
});
