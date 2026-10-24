import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import {
  borrarRubro,
  crearRubro,
  editarRubro,
  listarAreas,
  listarRubros,
  obtenerRubro,
  rubroSchema,
} from "@/lib/rubros";
import { crearDbPrueba } from "../helpers/db";

const datos = (extra: Record<string, string> = {}) =>
  rubroSchema.parse({ nombre: "Catering", areaId: "3", dias: "1", ...extra });

describe("rubroSchema", () => {
  it("convierte área y días a número", () => {
    expect(datos()).toEqual({ nombre: "Catering", areaId: 3, dias: 1 });
  });

  it("días solo 1 o 2", () => {
    const resultado = rubroSchema.safeParse({ nombre: "Catering", areaId: "3", dias: "3" });
    expect(resultado.error?.issues[0].message).toBe("Los días deben ser 1 o 2");
  });

  it("área vacía es inválida", () => {
    const resultado = rubroSchema.safeParse({ nombre: "Catering", areaId: "", dias: "1" });
    expect(resultado.error?.issues[0].message).toBe("Área inválida");
  });
});

describe("con DB", () => {
  let db: Db;
  beforeEach(async () => {
    db = await crearDbPrueba();
  });

  it("listarAreas devuelve las 6 áreas en orden", async () => {
    const areas = await listarAreas(db);
    expect(areas).toHaveLength(6);
    expect(areas[0]).toEqual({ id: 1, nombre: "Marketing y Audiovisual" });
  });

  it("listarRubros trae el nombre del área, ordenado por área y nombre", async () => {
    const rubros = await listarRubros(db);
    expect(rubros.map((r) => r.nombre)).toEqual([
      "Escenario",
      "Luces",
      "Pantalla",
      "Sonido",
      "Técnica",
      "Vallas blancas",
      "Vallas freestanding",
    ]);
    expect(rubros[0]).toMatchObject({ area: "Técnica, Escenario y Backline", areaId: 2, dias: 2 });
  });

  it("crea y obtiene un rubro", async () => {
    const id = await crearRubro(db, datos());
    expect(await obtenerRubro(db, id)).toMatchObject({
      id,
      nombre: "Catering",
      areaId: 3,
      area: "Logística, Hospitalidad y RRHH",
      dias: 1,
    });
    expect(await obtenerRubro(db, "no-existe")).toBeUndefined();
  });

  it("nombre repetido o área inexistente vuelven como ErrorNegocio", async () => {
    await expect(crearRubro(db, datos({ nombre: "Sonido" }))).rejects.toThrow("Ya existe un rubro con ese nombre");
    await expect(crearRubro(db, datos({ areaId: "99" }))).rejects.toThrow("Área inválida");
  });

  it("edita un rubro", async () => {
    const id = await crearRubro(db, datos());
    await editarRubro(db, id, datos({ dias: "2", nombre: "Catering artistas" }));
    expect(await obtenerRubro(db, id)).toMatchObject({ nombre: "Catering artistas", dias: 2 });
    await expect(editarRubro(db, "no-existe", datos())).rejects.toThrow("El rubro no existe");
  });

  it("borra un rubro", async () => {
    const id = await crearRubro(db, datos());
    await borrarRubro(db, id);
    expect(await obtenerRubro(db, id)).toBeUndefined();
    await expect(borrarRubro(db, id)).rejects.toThrow("El rubro no existe");
  });
});
