import { verifyPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { account, user } from "@/db/schema";
import {
  borrarUsuario,
  cambiarRol,
  crearUsuario,
  ErrorUsuario,
  listarUsuarios,
  nuevoUsuarioSchema,
} from "@/lib/users";
import { crearDbPrueba } from "../helpers/db";

const BASE = { nombre: "Ana Pérez", email: "Ana@Vibra.bo", password: "secreto123", rol: "editor" };
const datos = (extra: Partial<typeof BASE> = {}) => nuevoUsuarioSchema.parse({ ...BASE, ...extra });

let db: Db;
beforeEach(async () => {
  db = await crearDbPrueba();
});

describe("nuevoUsuarioSchema", () => {
  it("normaliza el email a minúsculas", () => {
    expect(datos().email).toBe("ana@vibra.bo");
  });

  it("rechaza contraseña de menos de 8 caracteres", () => {
    expect(nuevoUsuarioSchema.safeParse({ ...BASE, password: "1234567" }).success).toBe(false);
  });

  it("rechaza rol inexistente", () => {
    expect(nuevoUsuarioSchema.safeParse({ ...BASE, rol: "jefe" }).success).toBe(false);
  });
});

describe("crearUsuario", () => {
  it("crea user y cuenta credential con contraseña hasheada", async () => {
    const id = await crearUsuario(db, datos());

    const [u] = await db.select().from(user).where(eq(user.id, id));
    expect(u).toMatchObject({ name: "Ana Pérez", email: "ana@vibra.bo", role: "editor" });

    const [cuenta] = await db.select().from(account).where(eq(account.userId, id));
    expect(cuenta.providerId).toBe("credential");
    expect(cuenta.accountId).toBe(id);
    expect(cuenta.password).not.toBe("secreto123");
    expect(await verifyPassword({ hash: cuenta.password!, password: "secreto123" })).toBe(true);
  });

  it("rechaza email repetido sin importar mayúsculas", async () => {
    await crearUsuario(db, datos());
    await expect(crearUsuario(db, datos({ email: "ANA@vibra.bo" }))).rejects.toBeInstanceOf(ErrorUsuario);
  });
});

describe("listarUsuarios", () => {
  it("devuelve los usuarios ordenados por nombre", async () => {
    await crearUsuario(db, datos({ nombre: "Zoe", email: "zoe@vibra.bo" }));
    await crearUsuario(db, datos({ nombre: "Ana", email: "ana@vibra.bo" }));
    const lista = await listarUsuarios(db);
    expect(lista.map((u) => u.name)).toEqual(["Ana", "Zoe"]);
  });
});

describe("cambiarRol", () => {
  it("cambia el rol de otro usuario", async () => {
    const admin = await crearUsuario(db, datos({ email: "admin@vibra.bo", rol: "admin" }));
    const editor = await crearUsuario(db, datos());
    await cambiarRol(db, admin, editor, "admin");
    const [u] = await db.select().from(user).where(eq(user.id, editor));
    expect(u.role).toBe("admin");
  });

  it("no permite cambiarse el rol a uno mismo", async () => {
    const admin = await crearUsuario(db, datos({ rol: "admin" }));
    await expect(cambiarRol(db, admin, admin, "editor")).rejects.toBeInstanceOf(ErrorUsuario);
  });
});

describe("borrarUsuario", () => {
  it("borra al usuario y su cuenta", async () => {
    const admin = await crearUsuario(db, datos({ email: "admin@vibra.bo", rol: "admin" }));
    const editor = await crearUsuario(db, datos());
    await borrarUsuario(db, admin, editor);
    expect(await db.select().from(user).where(eq(user.id, editor))).toHaveLength(0);
    expect(await db.select().from(account).where(eq(account.userId, editor))).toHaveLength(0);
  });

  it("no permite borrarse a uno mismo", async () => {
    const admin = await crearUsuario(db, datos({ rol: "admin" }));
    await expect(borrarUsuario(db, admin, admin)).rejects.toBeInstanceOf(ErrorUsuario);
  });
});
