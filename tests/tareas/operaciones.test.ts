import { beforeEach, describe, expect, it } from "vitest";
import {
  altaRecordatorio,
  altaTarea,
  bajaRecordatorio,
  bajaTarea,
  cambioEstadoTarea,
  edicionTarea,
} from "@/app/(app)/tareas/operaciones";
import type { Db } from "@/db/client";
import type { Actor } from "@/lib/permissions";
import { listarRecordatorios } from "@/lib/recordatorios";
import { listarTareas, obtenerTarea } from "@/lib/tareas";
import { crearActores, SIN_PERMISO } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { idVibra } from "../helpers/presupuestos";
import { nuevaTarea, TAREA } from "../helpers/tareas";

let db: Db;
let admin: Actor;
let editor: Actor;
beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
});

describe("tareas", () => {
  it("el editor crea, edita y cambia el estado; queda como creador", async () => {
    expect(await altaTarea(db, editor, { ...TAREA, eventoId: await idVibra(db) })).toEqual({ ok: true });
    const [t] = await listarTareas(db);
    expect(t.creadoPor).toBe(editor.id);
    expect(await edicionTarea(db, editor, { ...TAREA, tareaId: t.id, titulo: "Vallas freestanding" })).toEqual({
      ok: true,
    });
    expect(await cambioEstadoTarea(db, editor, { tareaId: t.id, estado: "hecha" })).toEqual({ ok: true });
    expect(await obtenerTarea(db, t.id)).toMatchObject({ titulo: "Vallas freestanding", estado: "hecha" });
  });

  it("solo el admin borra", async () => {
    const id = await nuevaTarea(db);
    expect(await bajaTarea(db, editor, { tareaId: id })).toEqual(SIN_PERMISO);
    expect(await bajaTarea(db, admin, { tareaId: id })).toEqual({ ok: true });
    expect(await obtenerTarea(db, id)).toBeUndefined();
  });

  it("errores de validación vuelven como Resultado", async () => {
    expect(await altaTarea(db, editor, { ...TAREA, eventoId: await idVibra(db), fechaLimite: "ayer" })).toEqual({
      ok: false,
      error: "Fecha inválida",
    });
    expect(await cambioEstadoTarea(db, editor, { tareaId: "x", estado: "lista" })).toEqual({
      ok: false,
      error: "Estado inválido",
    });
  });
});

describe("recordatorios manuales", () => {
  it("el creador agrega y cancela; otro editor no", async () => {
    const id = await nuevaTarea(db, {}, admin.id);
    const futuro = "2099-01-01T09:00";
    expect(await altaRecordatorio(db, editor, { tareaId: id, fechaHora: futuro })).toEqual(SIN_PERMISO);
    expect(await altaRecordatorio(db, admin, { tareaId: id, fechaHora: futuro })).toEqual({ ok: true });

    const [r] = await listarRecordatorios(db, id);
    expect(await bajaRecordatorio(db, editor, { recordatorioId: r.id })).toEqual(SIN_PERMISO);
    expect(await bajaRecordatorio(db, admin, { recordatorioId: r.id })).toEqual({ ok: true });
  });
});
