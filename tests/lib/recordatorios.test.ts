import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import type { Actor } from "@/lib/permissions";
import {
  cancelarRecordatorio,
  crearRecordatorioManual,
  listarRecordatorios,
  puedeGestionarRecordatorios,
  recordatorioManualSchema,
} from "@/lib/recordatorios";
import { cambiarEstadoTarea } from "@/lib/tareas";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { AHORA, nuevaTarea, recordatoriosDe } from "../helpers/tareas";

const EN_UNA_HORA = "2027-03-01T09:00"; // hora de La Paz

describe("recordatorioManualSchema", () => {
  it("interpreta la hora como La Paz", () => {
    expect(recordatorioManualSchema.parse({ tareaId: "t", fechaHora: EN_UNA_HORA }).fechaHora.toISOString()).toBe(
      "2027-03-01T13:00:00.000Z",
    );
  });

  it("rechaza formatos raros", () => {
    expect(recordatorioManualSchema.safeParse({ tareaId: "t", fechaHora: "mañana" }).error?.issues[0].message).toBe(
      "Fecha y hora inválidas",
    );
  });
});

describe("puedeGestionarRecordatorios", () => {
  it("el creador o un admin", () => {
    expect(puedeGestionarRecordatorios({ id: "a", role: "editor" }, "a")).toBe(true);
    expect(puedeGestionarRecordatorios({ id: "b", role: "editor" }, "a")).toBe(false);
    expect(puedeGestionarRecordatorios({ id: "b", role: "admin" }, "a")).toBe(true);
  });
});

describe("con DB", () => {
  let db: Db;
  let admin: Actor;
  let editor: Actor;
  let otroEditor: Actor;
  let tareaId: string;
  const datos = (fechaHora = EN_UNA_HORA) => recordatorioManualSchema.parse({ tareaId, fechaHora });

  beforeEach(async () => {
    db = await crearDbPrueba();
    ({ admin, editor } = await crearActores(db));
    otroEditor = { id: admin.id, role: "editor" }; // existe en DB pero no es el creador ni admin
    tareaId = await nuevaTarea(db, {}, editor.id);
  });

  it("el creador agrega un manual futuro", async () => {
    await crearRecordatorioManual(db, editor, datos(), AHORA);
    expect(await recordatoriosDe(db, tareaId)).toEqual([
      { tipo: "manual", fechaHora: "2027-03-01T13:00:00.000Z", estado: "pendiente" },
    ]);
  });

  it("rechaza fechas pasadas, tareas hechas y a quien no es creador ni admin", async () => {
    await expect(crearRecordatorioManual(db, editor, datos("2027-03-01T07:00"), AHORA)).rejects.toThrow(
      "La fecha tiene que ser futura",
    );
    await expect(crearRecordatorioManual(db, otroEditor, datos(), AHORA)).rejects.toThrow(
      "No tenés permiso para hacer esto",
    );
    await cambiarEstadoTarea(db, tareaId, "hecha", AHORA);
    await expect(crearRecordatorioManual(db, admin, datos(), AHORA)).rejects.toThrow("La tarea ya está hecha");
  });

  it("cancela un manual pendiente; no cancela automáticos", async () => {
    await crearRecordatorioManual(db, editor, datos(), AHORA);
    const [manual] = await listarRecordatorios(db, tareaId);
    await expect(cancelarRecordatorio(db, otroEditor, manual.id, AHORA)).rejects.toThrow(
      "No tenés permiso para hacer esto",
    );
    await cancelarRecordatorio(db, admin, manual.id, AHORA);
    expect((await recordatoriosDe(db, tareaId))[0].estado).toBe("cancelado");
    await expect(cancelarRecordatorio(db, admin, manual.id, AHORA)).rejects.toThrow(
      "El recordatorio no existe o ya no está pendiente",
    );

    const conFecha = await nuevaTarea(db, { fechaLimite: "2027-03-10" }, editor.id);
    const [automatico] = await listarRecordatorios(db, conFecha);
    await expect(cancelarRecordatorio(db, admin, automatico.id, AHORA)).rejects.toThrow(
      "Los recordatorios automáticos no se cancelan a mano",
    );
  });
});
