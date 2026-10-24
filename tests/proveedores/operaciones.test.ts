import { beforeEach, describe, expect, it } from "vitest";
import { altaProveedor, bajaProveedor, edicionProveedor } from "@/app/(app)/proveedores/operaciones";
import type { Db } from "@/db/client";
import type { Actor } from "@/lib/permissions";
import { listarProveedores, obtenerProveedor } from "@/lib/proveedores";
import { crearActores, SIN_PERMISO } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { nuevoProveedor } from "../helpers/presupuestos";

let db: Db;
let admin: Actor;
let editor: Actor;
beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
});

describe("proveedores", () => {
  it("el editor crea y edita", async () => {
    expect(await altaProveedor(db, editor, { nombre: "Audio Total", email: "" })).toEqual({ ok: true });
    const [p] = await listarProveedores(db);
    expect(await edicionProveedor(db, editor, { proveedorId: p.id, nombre: "Audio Total SRL" })).toEqual({ ok: true });
    expect((await obtenerProveedor(db, p.id))?.nombre).toBe("Audio Total SRL");
  });

  it("el editor no puede borrar; el admin sí", async () => {
    const id = await nuevoProveedor(db);
    expect(await bajaProveedor(db, editor, { proveedorId: id })).toEqual(SIN_PERMISO);
    expect(await obtenerProveedor(db, id)).toBeDefined();
    expect(await bajaProveedor(db, admin, { proveedorId: id })).toEqual({ ok: true });
    expect(await obtenerProveedor(db, id)).toBeUndefined();
  });

  it("errores de validación vuelven como Resultado", async () => {
    expect(await altaProveedor(db, editor, { nombre: "X" })).toEqual({ ok: false, error: "El nombre es muy corto" });
    expect(await edicionProveedor(db, editor, { nombre: "Audio" })).toEqual({ ok: false, error: "Proveedor inválido" });
  });
});
