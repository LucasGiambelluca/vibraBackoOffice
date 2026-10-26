import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { cerrarEvento, crearEvento, eventoSchema } from "@/lib/eventos";
import {
  borrarTarea,
  cambiarEstadoTarea,
  editarTarea,
  listarTareas,
  obtenerTarea,
  resumenTareas,
  tareaSchema,
} from "@/lib/tareas";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { idVibra } from "../helpers/presupuestos";
import { AHORA, nuevaTarea, recordatoriosDe, TAREA } from "../helpers/tareas";

describe("tareaSchema", () => {
  it("campos opcionales vacíos quedan en null", () => {
    expect(tareaSchema.parse(TAREA)).toEqual({
      titulo: "Contratar vallas",
      grupoId: 4,
      responsableId: null,
      fechaLimite: null,
      notas: null,
    });
  });

  it("rechaza fechas inválidas", () => {
    for (const fechaLimite of ["10/03/2027", "2027-02-30", "mañana"]) {
      expect(tareaSchema.safeParse({ ...TAREA, fechaLimite }).error?.issues[0].message).toBe("Fecha inválida");
    }
  });

  it("título obligatorio", () => {
    expect(tareaSchema.safeParse({ ...TAREA, titulo: " " }).error?.issues[0].message).toBe("El título es muy corto");
  });
});

describe("con DB", () => {
  let db: Db;
  beforeEach(async () => {
    db = await crearDbPrueba();
  });

  it("crear sin fecha límite no crea recordatorios", async () => {
    const id = await nuevaTarea(db);
    expect(await obtenerTarea(db, id)).toMatchObject({
      titulo: "Contratar vallas",
      grupo: "Infraestructura y Predio",
      evento: "Vibra Bolivia 2027",
    });
    expect(await recordatoriosDe(db, id)).toEqual([]);
  });

  it("crear con fecha límite crea los automáticos", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10" });
    expect(await recordatoriosDe(db, id)).toEqual([
      { tipo: "3_dias_antes", fechaHora: "2027-03-07T13:00:00.000Z", estado: "pendiente" },
      { tipo: "dia_vencimiento", fechaHora: "2027-03-10T13:00:00.000Z", estado: "pendiente" },
    ]);
  });

  it("cambiar la fecha límite cancela los automáticos viejos y crea nuevos", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10" });
    await editarTarea(db, id, tareaSchema.parse({ ...TAREA, fechaLimite: "2027-03-20" }), AHORA);
    const pendientes = (await recordatoriosDe(db, id)).filter((r) => r.estado === "pendiente");
    expect(pendientes.map((r) => r.fechaHora)).toEqual(["2027-03-17T13:00:00.000Z", "2027-03-20T13:00:00.000Z"]);
    expect((await recordatoriosDe(db, id)).filter((r) => r.estado === "cancelado")).toHaveLength(2);
  });

  it("editar sin cambiar la fecha no toca los recordatorios", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10" });
    await editarTarea(db, id, tareaSchema.parse({ ...TAREA, titulo: "Otro título", fechaLimite: "2027-03-10" }), AHORA);
    expect((await recordatoriosDe(db, id)).every((r) => r.estado === "pendiente")).toBe(true);
    expect((await obtenerTarea(db, id))?.titulo).toBe("Otro título");
  });

  it("marcar hecha cancela todos los pendientes; reabrir regenera los automáticos", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10" });
    await cambiarEstadoTarea(db, id, "hecha", AHORA);
    expect((await recordatoriosDe(db, id)).every((r) => r.estado === "cancelado")).toBe(true);

    await cambiarEstadoTarea(db, id, "en_curso", AHORA);
    expect((await recordatoriosDe(db, id)).filter((r) => r.estado === "pendiente")).toHaveLength(2);
    expect((await obtenerTarea(db, id))?.estado).toBe("en_curso");
  });

  it("pasar de pendiente a en curso no toca los recordatorios", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10" });
    await cambiarEstadoTarea(db, id, "en_curso", AHORA);
    expect(await recordatoriosDe(db, id)).toHaveLength(2);
  });

  it("responsable o área inexistente vuelve como ErrorNegocio", async () => {
    await expect(nuevaTarea(db, { responsableId: "no-existe" })).rejects.toThrow("Grupo o responsable inválido");
    await expect(nuevaTarea(db, { grupoId: "99" })).rejects.toThrow("Grupo o responsable inválido");
    await expect(nuevaTarea(db, { eventoId: "nada" })).rejects.toThrow("El evento no existe");
  });

  it("editar, cambiar estado o borrar una tarea inexistente vuelve como ErrorNegocio", async () => {
    await expect(editarTarea(db, "x", tareaSchema.parse(TAREA))).rejects.toThrow("La tarea no existe");
    await expect(cambiarEstadoTarea(db, "x", "hecha")).rejects.toThrow("La tarea no existe");
    await expect(borrarTarea(db, "x")).rejects.toThrow("La tarea no existe");
  });

  it("borra", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10" });
    await borrarTarea(db, id);
    expect(await obtenerTarea(db, id)).toBeUndefined();
  });

  it("con el evento cerrado no se crea, edita, cambia de estado ni borra", async () => {
    const id = await nuevaTarea(db);
    await cerrarEvento(db, await idVibra(db), null);
    const cerrado = "El evento está cerrado: solo lectura";
    await expect(nuevaTarea(db)).rejects.toThrow(cerrado);
    await expect(editarTarea(db, id, tareaSchema.parse(TAREA))).rejects.toThrow(cerrado);
    await expect(cambiarEstadoTarea(db, id, "hecha")).rejects.toThrow(cerrado);
    await expect(borrarTarea(db, id)).rejects.toThrow(cerrado);
  });

  describe("listarTareas", () => {
    it("ordena por fecha límite (sin fecha al final) y filtra", async () => {
      const { editor } = await crearActores(db);
      await nuevaTarea(db, { titulo: "Sin fecha" });
      await nuevaTarea(db, { titulo: "Tarde", fechaLimite: "2027-04-01", responsableId: editor.id });
      await nuevaTarea(db, { titulo: "Temprano", fechaLimite: "2027-03-05", grupoId: "1" });

      expect((await listarTareas(db)).map((t) => t.titulo)).toEqual(["Temprano", "Tarde", "Sin fecha"]);
      expect((await listarTareas(db, { grupoId: 1 })).map((t) => t.titulo)).toEqual(["Temprano"]);
      expect((await listarTareas(db, { responsableId: editor.id }))[0]).toMatchObject({
        titulo: "Tarde",
        responsable: "editor@vibra.bo",
      });
      expect(await listarTareas(db, { estado: "hecha" })).toHaveLength(0);
      expect(await listarTareas(db, { eventoId: "otro" })).toHaveLength(0);
    });
  });

  describe("resumenTareas", () => {
    it("vencidas y próximas 7 días de los eventos pedidos (sin contar hechas)", async () => {
      await nuevaTarea(db, { titulo: "Vencida", fechaLimite: "2027-02-25" });
      await nuevaTarea(db, { titulo: "Hoy", fechaLimite: "2027-03-01" });
      await nuevaTarea(db, { titulo: "En una semana", fechaLimite: "2027-03-08" });
      await nuevaTarea(db, { titulo: "Lejos", fechaLimite: "2027-04-01" });
      const hecha = await nuevaTarea(db, { titulo: "Hecha vencida", fechaLimite: "2027-02-20" });
      await cambiarEstadoTarea(db, hecha, "hecha", AHORA);

      const otro = await crearEvento(db, eventoSchema.parse({ nombre: "Otro" }), { rubros: [] });
      await nuevaTarea(db, { titulo: "De otro evento", fechaLimite: "2027-02-25", eventoId: otro });

      const resumen = await resumenTareas(db, [await idVibra(db)], AHORA);
      expect(resumen.vencidas.map((t) => t.titulo)).toEqual(["Vencida"]);
      expect(resumen.proximas.map((t) => t.titulo)).toEqual(["Hoy", "En una semana"]);
      expect((await resumenTareas(db, [otro], AHORA)).vencidas[0]).toMatchObject({ evento: "Otro" });
      expect(await resumenTareas(db, [], AHORA)).toEqual({ vencidas: [], proximas: [] });
    });
  });
});
