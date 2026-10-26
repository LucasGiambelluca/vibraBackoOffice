import { readdirSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { bajaArchivo, subidaArchivo } from "@/app/(app)/archivos/operaciones";
import type { Db } from "@/db/client";
import { listarArchivos } from "@/lib/archivos";
import type { Actor } from "@/lib/permissions";
import { crearActores, SIN_PERMISO } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { foto, idVibra, pdf, usarUploadsTemporal } from "../helpers/presupuestos";

let db: Db;
let dir: string;
let admin: Actor;
let editor: Actor;
let vibra: string;

beforeEach(async () => {
  dir = usarUploadsTemporal();
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
  vibra = await idVibra(db);
});

const delEvento = () => listarArchivos(db, { tipo: "evento", id: vibra });

describe("subidaArchivo", () => {
  it("el editor sube una foto con su nombre original", async () => {
    const archivo = await foto();
    expect(await subidaArchivo(db, editor, { duenioTipo: "evento", duenioId: vibra, archivo })).toEqual({ ok: true });
    expect(await delEvento()).toMatchObject([{ nombre: "foto.jpg", tipo: "imagen", subidoPor: editor.id }]);
  });

  it("sin archivo, con destino inválido o con un tipo no aceptado vuelve un error y no deja nada en disco", async () => {
    expect(await subidaArchivo(db, editor, { duenioTipo: "evento", duenioId: vibra, archivo: new File([], "") })).toEqual({
      ok: false,
      error: "Elegí un archivo",
    });
    expect(await subidaArchivo(db, editor, { duenioTipo: "proveedor", duenioId: vibra, archivo: pdf() })).toEqual({
      ok: false,
      error: "Destino inválido",
    });
    const texto = new File(["hola"], "x.txt");
    expect(await subidaArchivo(db, editor, { duenioTipo: "evento", duenioId: vibra, archivo: texto })).toEqual({
      ok: false,
      error: "Solo se aceptan PDF o fotos (JPG, PNG o WebP)",
    });
    expect(await subidaArchivo(db, editor, { duenioTipo: "tarea", duenioId: "no-existe", archivo: pdf() })).toEqual({
      ok: false,
      error: "No existe dónde subir el archivo",
    });
    expect(readdirSync(dir)).toEqual([]);
  });

  it("un rol sin permiso de edición no sube", async () => {
    const lector = { id: editor.id, role: "otro" };
    expect(await subidaArchivo(db, lector, { duenioTipo: "evento", duenioId: vibra, archivo: pdf() })).toEqual(SIN_PERMISO);
  });
});

describe("bajaArchivo", () => {
  it("borra con permiso; sin permiso devuelve el error", async () => {
    await subidaArchivo(db, admin, { duenioTipo: "evento", duenioId: vibra, archivo: pdf() });
    const [a] = await delEvento();
    expect(await bajaArchivo(db, editor, { archivoId: a.id })).toEqual(SIN_PERMISO);
    expect(await bajaArchivo(db, admin, { archivoId: a.id })).toEqual({ ok: true });
    expect(await delEvento()).toEqual([]);
  });
});
