import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { borrarRubro, crearRubro, editarRubro, listarRubros, obtenerRubro, rubroSchema } from "@/lib/rubros";
import { crearDbPrueba } from "../helpers/db";

const datos = (extra: Record<string, string> = {}) => rubroSchema.parse({ nombre: "Catering", grupoId: "3", ...extra });

describe("rubroSchema", () => {
  it("convierte el grupo a número", () => {
    expect(datos()).toEqual({ nombre: "Catering", grupoId: 3 });
  });

  it("grupo vacío es inválido", () => {
    const resultado = rubroSchema.safeParse({ nombre: "Catering", grupoId: "" });
    expect(resultado.error?.issues[0].message).toBe("Grupo inválido");
  });
});

describe("con DB", () => {
  let db: Db;
  beforeEach(async () => {
    db = await crearDbPrueba();
  });

  it("listarRubros trae el nombre del grupo, ordenado por grupo y nombre", async () => {
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
    expect(rubros[0]).toMatchObject({ grupo: "Técnica, Escenario y Backline", grupoId: 2 });
  });

  it("crea y obtiene un rubro", async () => {
    const id = await crearRubro(db, datos());
    expect(await obtenerRubro(db, id)).toEqual({
      id,
      nombre: "Catering",
      grupoId: 3,
      grupo: "Logística, Hospitalidad y RRHH",
    });
    expect(await obtenerRubro(db, "no-existe")).toBeUndefined();
  });

  it("nombre repetido o grupo inexistente vuelven como ErrorNegocio", async () => {
    await expect(crearRubro(db, datos({ nombre: "Sonido" }))).rejects.toThrow("Ya existe un rubro con ese nombre");
    await expect(crearRubro(db, datos({ grupoId: "99" }))).rejects.toThrow("Grupo inválido");
  });

  it("edita un rubro", async () => {
    const id = await crearRubro(db, datos());
    await editarRubro(db, id, datos({ nombre: "Catering artistas", grupoId: "1" }));
    expect(await obtenerRubro(db, id)).toMatchObject({ nombre: "Catering artistas", grupoId: 1 });
    await expect(editarRubro(db, "no-existe", datos())).rejects.toThrow("El rubro no existe");
  });

  it("borra un rubro que ningún evento usa", async () => {
    const id = await crearRubro(db, datos());
    await borrarRubro(db, id);
    expect(await obtenerRubro(db, id)).toBeUndefined();
    await expect(borrarRubro(db, id)).rejects.toThrow("El rubro no existe");
  });

  it("no borra un rubro usado en un evento (es historial)", async () => {
    const [sonido] = (await listarRubros(db)).filter((r) => r.nombre === "Sonido");
    await expect(borrarRubro(db, sonido.id)).rejects.toThrow("El rubro se usa en algún evento: no se puede borrar");
  });
});
