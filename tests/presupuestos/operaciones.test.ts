import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { COTIZACION, idEventoRubro, nuevaCotizacion, nuevoProveedor, pdf, usarUploadsTemporal } from "../helpers/presupuestos";

let db: Db;
let admin: Actor;
let editor: Actor;
let eventoRubroId: string;
let proveedorId: string;
let uploads: string;

beforeEach(async () => {
  uploads = usarUploadsTemporal();
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
  eventoRubroId = await idEventoRubro(db);
  proveedorId = await nuevoProveedor(db);
});

describe("altaCotizacion", () => {
  it("el editor crea una cotización con PDF y queda como creador", async () => {
    const datos = { ...COTIZACION, eventoRubroId, proveedorId, adjunto: pdf() };
    expect(await altaCotizacion(db, editor, datos)).toEqual({ ok: true });
    const [c] = await listarCotizaciones(db, { eventoRubroId });
    const fila = await obtenerCotizacion(db, c.id);
    expect(fila).toMatchObject({ creadoPor: editor.id, estado: "pendiente" });
    expect(readdirSync(uploads)).toEqual([fila!.adjunto]);
  });

  it("un adjunto que no es PDF vuelve como error y no crea nada", async () => {
    const datos = { ...COTIZACION, eventoRubroId, proveedorId, adjunto: new File(["hola"], "x.pdf") };
    expect(await altaCotizacion(db, editor, datos)).toEqual({ ok: false, error: "El adjunto debe ser un PDF" });
    expect(await listarCotizaciones(db)).toHaveLength(0);
  });

  it("si la cotización no se puede guardar, no queda el PDF", async () => {
    const datos = { ...COTIZACION, eventoRubroId: "no-existe", proveedorId, adjunto: pdf() };
    expect(await altaCotizacion(db, editor, datos)).toEqual({ ok: false, error: "Rubro inválido" });
    expect(readdirSync(uploads)).toEqual([]);
  });
});

describe("edicionCotizacion", () => {
  it("cambia datos y puede quitar el adjunto", async () => {
    await altaCotizacion(db, editor, { ...COTIZACION, eventoRubroId, proveedorId, adjunto: pdf() });
    const [c] = await listarCotizaciones(db);
    const cambios = { ...COTIZACION, cotizacionId: c.id, proveedorId, precioDia: "900", quitarAdjunto: "on" };
    expect(await edicionCotizacion(db, editor, cambios)).toEqual({ ok: true });
    expect(await obtenerCotizacion(db, c.id)).toMatchObject({ precioDia: "900.00", adjunto: null });
    expect(readdirSync(uploads)).toEqual([]);
  });

  it("si el PDF anterior no se puede borrar, igual queda el nuevo", async () => {
    await altaCotizacion(db, editor, { ...COTIZACION, eventoRubroId, proveedorId, adjunto: pdf() });
    const [c] = await listarCotizaciones(db);
    // Una carpeta con el nombre del PDF viejo hace fallar su borrado (como un EBUSY en Windows).
    rmSync(path.join(uploads, c.adjunto!));
    mkdirSync(path.join(uploads, c.adjunto!));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const cambios = { ...COTIZACION, cotizacionId: c.id, proveedorId, adjunto: pdf() };
    expect(await edicionCotizacion(db, editor, cambios)).toEqual({ ok: true });
    const nuevo = (await obtenerCotizacion(db, c.id))!.adjunto!;
    expect(nuevo).not.toBe(c.adjunto);
    expect(existsSync(path.join(uploads, nuevo))).toBe(true);
    vi.restoreAllMocks();
  });
});

describe("edición de una cotización aprobada", () => {
  const editar = (actor: Actor, cotizacionId: string) =>
    edicionCotizacion(db, actor, { ...COTIZACION, cotizacionId, proveedorId, precioDia: "900" });

  it("si la edita un editor, vuelve a pendiente hasta que el admin la apruebe de nuevo", async () => {
    const id = await nuevaCotizacion(db, eventoRubroId, proveedorId);
    await aprobacion(db, admin, { cotizacionId: id });
    expect(await editar(editor, id)).toEqual({ ok: true });
    expect(await obtenerCotizacion(db, id)).toMatchObject({
      precioDia: "900.00",
      estado: "pendiente",
      aprobadaPor: null,
      aprobadaAt: null,
    });
  });

  it("si la edita el admin, sigue aprobada", async () => {
    const id = await nuevaCotizacion(db, eventoRubroId, proveedorId);
    await aprobacion(db, admin, { cotizacionId: id });
    expect(await editar(admin, id)).toEqual({ ok: true });
    expect(await obtenerCotizacion(db, id)).toMatchObject({ estado: "aprobada", aprobadaPor: admin.id });
  });

  it("el editor puede editar una descartada sin cambiarle el estado", async () => {
    const a = await nuevaCotizacion(db, eventoRubroId, proveedorId);
    const b = await nuevaCotizacion(db, eventoRubroId, proveedorId);
    await aprobacion(db, admin, { cotizacionId: a });
    expect(await editar(editor, b)).toEqual({ ok: true });
    expect((await obtenerCotizacion(db, b))?.estado).toBe("descartada");
  });
});

describe("aprobación y borrado", () => {
  it("el editor no puede aprobar, revertir ni borrar", async () => {
    const id = await nuevaCotizacion(db, eventoRubroId, proveedorId);
    expect(await aprobacion(db, editor, { cotizacionId: id })).toEqual(SIN_PERMISO);
    expect(await reversion(db, editor, { cotizacionId: id })).toEqual(SIN_PERMISO);
    expect(await bajaCotizacion(db, editor, { cotizacionId: id })).toEqual(SIN_PERMISO);
    expect((await obtenerCotizacion(db, id))?.estado).toBe("pendiente");
  });

  it("el admin aprueba, revierte y borra", async () => {
    const id = await nuevaCotizacion(db, eventoRubroId, proveedorId);
    expect(await aprobacion(db, admin, { cotizacionId: id })).toEqual({ ok: true });
    expect(await obtenerCotizacion(db, id)).toMatchObject({ estado: "aprobada", aprobadaPor: admin.id });
    expect(await reversion(db, admin, { cotizacionId: id })).toEqual({ ok: true });
    expect(await bajaCotizacion(db, admin, { cotizacionId: id })).toEqual({ ok: true });
    expect(await obtenerCotizacion(db, id)).toBeUndefined();
  });

  it("sin id vuelve como error", async () => {
    expect(await aprobacion(db, admin, {})).toEqual({ ok: false, error: "Cotización inválida" });
  });
});
