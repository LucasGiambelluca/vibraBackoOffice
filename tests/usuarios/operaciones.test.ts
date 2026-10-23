import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { altaUsuario, bajaUsuario, cambioDeRol } from "@/app/(app)/configuracion/usuarios/operaciones";
import type { Db } from "@/db/client";
import { user } from "@/db/schema";
import type { Actor } from "@/lib/permissions";
import { crearUsuario, nuevoUsuarioSchema } from "@/lib/users";
import { crearDbPrueba } from "../helpers/db";

const SIN_PERMISO = { ok: false, error: "No tenés permiso para hacer esto" };
const NUEVO = { nombre: "Nuevo", email: "nuevo@vibra.bo", password: "secreto123", rol: "editor" };

let db: Db;
let admin: Actor;
let editor: Actor;
let otro: string;

async function alta(email: string, rol: string) {
  return crearUsuario(db, nuevoUsuarioSchema.parse({ nombre: email, email, password: "secreto123", rol }));
}

const rolDe = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0]?.role;

beforeEach(async () => {
  db = await crearDbPrueba();
  admin = { id: await alta("admin@vibra.bo", "admin"), role: "admin" };
  editor = { id: await alta("editor@vibra.bo", "editor"), role: "editor" };
  otro = await alta("otro@vibra.bo", "editor");
});

describe("altaUsuario", () => {
  it("el editor no puede crear usuarios y no se toca la DB", async () => {
    expect(await altaUsuario(db, editor, NUEVO)).toEqual(SIN_PERMISO);
    expect(await db.select().from(user)).toHaveLength(3);
  });

  it("el admin crea el usuario", async () => {
    expect(await altaUsuario(db, admin, NUEVO)).toEqual({ ok: true });
    expect(await db.select().from(user).where(eq(user.email, "nuevo@vibra.bo"))).toHaveLength(1);
  });

  it("datos inválidos y email repetido vuelven como error, sin lanzar", async () => {
    expect(await altaUsuario(db, admin, { ...NUEVO, password: "corta" })).toEqual({
      ok: false,
      error: "La contraseña debe tener al menos 8 caracteres",
    });
    expect(await altaUsuario(db, admin, { ...NUEVO, email: "otro@vibra.bo" })).toEqual({
      ok: false,
      error: "Ya existe un usuario con ese email",
    });
  });
});

describe("cambioDeRol", () => {
  it("el editor no puede cambiar roles y no se toca la DB", async () => {
    expect(await cambioDeRol(db, editor, { userId: otro, rol: "admin" })).toEqual(SIN_PERMISO);
    expect(await rolDe(otro)).toBe("editor");
  });

  it("el admin cambia el rol", async () => {
    expect(await cambioDeRol(db, admin, { userId: otro, rol: "admin" })).toEqual({ ok: true });
    expect(await rolDe(otro)).toBe("admin");
  });

  it("rol inválido, id inválido o propio rol vuelven como error", async () => {
    expect(await cambioDeRol(db, admin, { userId: otro, rol: "jefe" })).toEqual({ ok: false, error: "Rol inválido" });
    expect(await cambioDeRol(db, admin, { rol: "admin" })).toEqual({ ok: false, error: "Usuario inválido" });
    expect(await cambioDeRol(db, admin, { userId: "x", rol: "admin" })).toEqual({
      ok: false,
      error: "El usuario no existe",
    });
    expect(await cambioDeRol(db, admin, { userId: admin.id, rol: "editor" })).toEqual({
      ok: false,
      error: "No podés cambiar tu propio rol",
    });
  });
});

describe("bajaUsuario", () => {
  it("el editor no puede borrar usuarios y no se toca la DB", async () => {
    expect(await bajaUsuario(db, editor, { userId: otro })).toEqual(SIN_PERMISO);
    expect(await rolDe(otro)).toBe("editor");
  });

  it("el admin borra al usuario", async () => {
    expect(await bajaUsuario(db, admin, { userId: otro })).toEqual({ ok: true });
    expect(await rolDe(otro)).toBeUndefined();
  });

  it("borrarse a uno mismo vuelve como error", async () => {
    expect(await bajaUsuario(db, admin, { userId: admin.id })).toEqual({
      ok: false,
      error: "No podés borrar tu propio usuario",
    });
  });
});
