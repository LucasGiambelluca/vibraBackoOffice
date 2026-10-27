import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import {
  borrarProveedor,
  crearProveedor,
  editarProveedor,
  listarProveedores,
  obtenerProveedor,
  proveedorSchema,
} from "@/lib/proveedores";
import { crearDbPrueba } from "../helpers/db";

const datos = (extra: Record<string, string> = {}) => proveedorSchema.parse({ nombre: "Sonido Andino", ...extra });

describe("proveedorSchema", () => {
  it("campos opcionales vacíos o ausentes quedan en null", () => {
    expect(datos({ contacto: "", email: "  " })).toEqual({
      nombre: "Sonido Andino",
      contacto: null,
      telefono: null,
      email: null,
      notas: null,
    });
  });

  it("valida el email si viene", () => {
    expect(proveedorSchema.safeParse({ nombre: "X SA", email: "no-es-email" }).error?.issues[0].message).toBe(
      "Email inválido",
    );
    expect(datos({ email: "ventas@andino.bo" }).email).toBe("ventas@andino.bo");
  });
});

describe("con DB", () => {
  let db: Db;
  beforeEach(async () => {
    db = await crearDbPrueba();
  });

  it("crea, obtiene y lista ordenado por nombre", async () => {
    const id = await crearProveedor(db, datos({ contacto: "Juan" }));
    await crearProveedor(db, datos({ nombre: "Audio Total" }));
    expect(await obtenerProveedor(db, id)).toMatchObject({ nombre: "Sonido Andino", contacto: "Juan" });
    expect((await listarProveedores(db)).map((p) => p.nombre)).toEqual(["Audio Total", "Sonido Andino"]);
  });

  it("busca por nombre o contacto sin importar mayúsculas", async () => {
    await crearProveedor(db, datos({ contacto: "Juan Pérez" }));
    await crearProveedor(db, datos({ nombre: "Vallas Sur", contacto: "María" }));
    // Sin acentos en la búsqueda: con collation C, ILIKE solo pliega mayúsculas ASCII.
    expect((await listarProveedores(db, "ANDINO")).map((p) => p.nombre)).toEqual(["Sonido Andino"]);
    expect((await listarProveedores(db, "juan")).map((p) => p.nombre)).toEqual(["Sonido Andino"]);
    expect((await listarProveedores(db, "vallas")).map((p) => p.nombre)).toEqual(["Vallas Sur"]);
  });

  it("% y _ se buscan como texto, no como comodines", async () => {
    await crearProveedor(db, datos());
    await crearProveedor(db, datos({ nombre: "Descuento 10% SRL" }));
    expect((await listarProveedores(db, "%")).map((p) => p.nombre)).toEqual(["Descuento 10% SRL"]);
    expect(await listarProveedores(db, "_")).toEqual([]);
  });

  it("nombre repetido vuelve como ErrorNegocio", async () => {
    await crearProveedor(db, datos());
    await expect(crearProveedor(db, datos())).rejects.toThrow("Ya existe un proveedor con ese nombre");
  });

  it("edita y borra", async () => {
    const id = await crearProveedor(db, datos());
    await editarProveedor(db, id, datos({ telefono: "70000000" }));
    expect((await obtenerProveedor(db, id))?.telefono).toBe("70000000");
    await borrarProveedor(db, id);
    expect(await obtenerProveedor(db, id)).toBeUndefined();
  });

  it("editar o borrar uno inexistente vuelve como ErrorNegocio", async () => {
    await expect(editarProveedor(db, "no-existe", datos())).rejects.toThrow("El proveedor no existe");
    await expect(borrarProveedor(db, "no-existe")).rejects.toThrow("El proveedor no existe");
  });
});
