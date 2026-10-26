import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { borrarGrupo, crearGrupo, grupoSchema, listarGrupos, moverGrupo, renombrarGrupo } from "@/lib/grupos";
import { crearDbPrueba } from "../helpers/db";

const datos = (nombre = "Prensa") => grupoSchema.parse({ nombre });

describe("grupos", () => {
  let db: Db;
  beforeEach(async () => {
    db = await crearDbPrueba();
  });

  const nombres = async () => (await listarGrupos(db)).map((g) => g.nombre);

  it("crea al final de la lista", async () => {
    const id = await crearGrupo(db, datos());
    expect(id).toBe(7);
    expect((await nombres()).at(-1)).toBe("Prensa");
    await expect(crearGrupo(db, datos())).rejects.toThrow("Ya existe un grupo con ese nombre");
  });

  it("renombra", async () => {
    await renombrarGrupo(db, 1, datos("Marketing"));
    expect((await nombres())[0]).toBe("Marketing");
    await expect(renombrarGrupo(db, 99, datos())).rejects.toThrow("El grupo no existe");
  });

  it("mueve arriba y abajo; en el borde no hace nada", async () => {
    await moverGrupo(db, 2, "arriba");
    expect((await nombres()).slice(0, 2)).toEqual(["Técnica, Escenario y Backline", "Marketing y Audiovisual"]);
    await moverGrupo(db, 2, "arriba");
    expect((await nombres())[0]).toBe("Técnica, Escenario y Backline");
    await moverGrupo(db, 6, "abajo");
    expect((await nombres()).at(-1)).toBe("Gestión Presupuestaria");
    await moverGrupo(db, 2, "abajo");
    expect((await nombres()).slice(0, 2)).toEqual(["Marketing y Audiovisual", "Técnica, Escenario y Backline"]);
  });

  it("borra un grupo vacío, no uno con rubros", async () => {
    const id = await crearGrupo(db, datos());
    await borrarGrupo(db, id);
    expect(await nombres()).not.toContain("Prensa");
    await expect(borrarGrupo(db, 2)).rejects.toThrow("El grupo tiene rubros o tareas");
    await expect(borrarGrupo(db, id)).rejects.toThrow("El grupo no existe");
  });
});
