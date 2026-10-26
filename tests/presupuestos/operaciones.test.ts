import { readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  altaCotizacion,
  aprobacion,
  bajaCotizacion,
  edicionCotizacion,
  lecturaPdf,
  reversion,
} from "@/app/(app)/presupuestos/operaciones";
import type { Db } from "@/db/client";
import { listarArchivos } from "@/lib/archivos";
import { listarCotizaciones, obtenerCotizacion } from "@/lib/cotizaciones";
import type { CotizacionLeida } from "@/lib/lectura-pdf";
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
  it("el editor crea una cotización con PDF: queda como creador y el PDF como archivo de la cotización", async () => {
    const datos = { ...COTIZACION, eventoRubroId, proveedorId, adjunto: pdf() };
    expect(await altaCotizacion(db, editor, datos)).toEqual({ ok: true });
    const [c] = await listarCotizaciones(db, { eventoRubroId });
    expect(await obtenerCotizacion(db, c.id)).toMatchObject({ creadoPor: editor.id, estado: "pendiente" });
    const archivos = await listarArchivos(db, { tipo: "cotizacion", id: c.id });
    expect(archivos).toMatchObject([{ tipo: "pdf", nombre: "cotizacion.pdf", subidoPor: editor.id }]);
    expect(readdirSync(uploads)).toHaveLength(1);
  });

  it("un adjunto que no es PDF ni foto vuelve como error y no crea nada", async () => {
    const datos = { ...COTIZACION, eventoRubroId, proveedorId, adjunto: new File(["hola"], "x.pdf") };
    expect(await altaCotizacion(db, editor, datos)).toEqual({
      ok: false,
      error: "Solo se aceptan PDF o fotos (JPG, PNG o WebP)",
    });
    expect(await listarCotizaciones(db)).toHaveLength(0);
  });

  it("si la cotización no se puede guardar, no queda el PDF", async () => {
    const datos = { ...COTIZACION, eventoRubroId: "no-existe", proveedorId, adjunto: pdf() };
    expect(await altaCotizacion(db, editor, datos)).toEqual({ ok: false, error: "Rubro inválido" });
    expect(readdirSync(uploads)).toEqual([]);
  });
});

describe("edicionCotizacion", () => {
  it("cambia los datos y conserva los archivos", async () => {
    await altaCotizacion(db, editor, { ...COTIZACION, eventoRubroId, proveedorId, adjunto: pdf() });
    const [c] = await listarCotizaciones(db);
    const cambios = { ...COTIZACION, cotizacionId: c.id, proveedorId, precioDia: "900" };
    expect(await edicionCotizacion(db, editor, cambios)).toEqual({ ok: true });
    expect(await obtenerCotizacion(db, c.id)).toMatchObject({ precioDia: "900.00" });
    expect(await listarArchivos(db, { tipo: "cotizacion", id: c.id })).toHaveLength(1);
  });
});

describe("lecturaPdf", () => {
  const LEIDA: CotizacionLeida = {
    proveedorId: null,
    proveedor: "Sonido Andino SRL",
    moneda: "USD",
    precioDia: "1500",
    descuento2Dias: "10",
    descripcion: "PA completo",
  };

  it("pasa el PDF, el rubro y los proveedores a la lectura y devuelve los campos", async () => {
    const leer = vi.fn(async () => LEIDA);
    const resultado = await lecturaPdf(db, editor, { adjunto: pdf(), eventoRubroId }, leer);
    expect(resultado).toEqual({ ok: true, datos: LEIDA });
    expect(leer).toHaveBeenCalledWith(expect.any(Buffer), {
      rubro: "Sonido",
      dias: 2,
      proveedores: [expect.objectContaining({ id: proveedorId, nombre: "Sonido Andino" })],
    });
  });

  it("solo lee PDF y no guarda nada", async () => {
    const leer = vi.fn(async () => LEIDA);
    const foto = new File(["hola"], "x.pdf", { type: "application/pdf" });
    expect(await lecturaPdf(db, editor, { adjunto: foto, eventoRubroId }, leer)).toEqual({
      ok: false,
      error: "Solo se pueden leer archivos PDF",
    });
    expect(leer).not.toHaveBeenCalled();
    expect(readdirSync(uploads)).toEqual([]);
  });

  it("sin archivo o con un rubro que no existe, avisa", async () => {
    const leer = vi.fn(async () => LEIDA);
    expect(await lecturaPdf(db, editor, { adjunto: new File([], ""), eventoRubroId }, leer)).toEqual({
      ok: false,
      error: "Elegí el PDF de la cotización",
    });
    expect(await lecturaPdf(db, editor, { adjunto: pdf(), eventoRubroId: "no-existe" }, leer)).toEqual({
      ok: false,
      error: "Rubro inválido",
    });
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
