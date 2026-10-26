import { beforeEach, describe, expect, it } from "vitest";
import {
  altaGrupo,
  altaRubro,
  bajaGrupo,
  bajaRubro,
  edicionGrupo,
  edicionRubro,
  movimientoGrupo,
} from "@/app/(app)/configuracion/grupos/operaciones";
import type { Db } from "@/db/client";
import { listarGrupos } from "@/lib/grupos";
import type { Actor } from "@/lib/permissions";
import { listarRubros, obtenerRubro } from "@/lib/rubros";
import { crearActores, SIN_PERMISO } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { idRubro } from "../helpers/presupuestos";

const RUBRO = { nombre: "Catering", grupoId: "3" };

let db: Db;
let admin: Actor;
let editor: Actor;
beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
});

describe("rubros del catálogo", () => {
  it("el editor no puede crear, editar ni borrar", async () => {
    const sonido = await idRubro(db);
    expect(await altaRubro(db, editor, RUBRO)).toEqual(SIN_PERMISO);
    expect(await edicionRubro(db, editor, { ...RUBRO, rubroId: sonido })).toEqual(SIN_PERMISO);
    expect(await bajaRubro(db, editor, { rubroId: sonido })).toEqual(SIN_PERMISO);
    expect(await listarRubros(db)).toHaveLength(7);
  });

  it("el admin crea, edita y borra", async () => {
    expect(await altaRubro(db, admin, RUBRO)).toEqual({ ok: true });
    const id = await idRubro(db, "Catering");
    expect(await edicionRubro(db, admin, { ...RUBRO, grupoId: "1", rubroId: id })).toEqual({ ok: true });
    expect((await obtenerRubro(db, id))?.grupoId).toBe(1);
    expect(await bajaRubro(db, admin, { rubroId: id })).toEqual({ ok: true });
  });

  it("errores de validación vuelven como Resultado", async () => {
    expect(await altaRubro(db, admin, { ...RUBRO, grupoId: "" })).toEqual({ ok: false, error: "Grupo inválido" });
    expect(await bajaRubro(db, admin, {})).toEqual({ ok: false, error: "Rubro inválido" });
  });
});

describe("grupos", () => {
  it("el editor no puede tocarlos", async () => {
    expect(await altaGrupo(db, editor, { nombre: "Prensa" })).toEqual(SIN_PERMISO);
    expect(await edicionGrupo(db, editor, { grupoId: "1", nombre: "X" })).toEqual(SIN_PERMISO);
    expect(await movimientoGrupo(db, editor, { grupoId: "2", direccion: "arriba" })).toEqual(SIN_PERMISO);
    expect(await bajaGrupo(db, editor, { grupoId: "1" })).toEqual(SIN_PERMISO);
  });

  it("el admin crea, renombra, mueve y borra", async () => {
    expect(await altaGrupo(db, admin, { nombre: "Prensa" })).toEqual({ ok: true });
    expect(await edicionGrupo(db, admin, { grupoId: "7", nombre: "Prensa y RRPP" })).toEqual({ ok: true });
    expect(await movimientoGrupo(db, admin, { grupoId: "7", direccion: "arriba" })).toEqual({ ok: true });
    expect((await listarGrupos(db)).at(-2)?.nombre).toBe("Prensa y RRPP");
    expect(await movimientoGrupo(db, admin, { grupoId: "7", direccion: "costado" })).toEqual({
      ok: false,
      error: "Dirección inválida",
    });
    expect(await bajaGrupo(db, admin, { grupoId: "7" })).toEqual({ ok: true });
    expect(await bajaGrupo(db, admin, { grupoId: "2" })).toEqual({
      ok: false,
      error: "El grupo tiene rubros o tareas: movelos a otro grupo primero",
    });
  });
});
