import { verifyPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { account, session, user } from "@/db/schema";
import {
  borrarUsuario,
  cambiarContraseniaDeUsuario,
  cambiarRol,
  crearUsuario,
  ErrorUsuario,
  esViolacionUnica,
  listarUsuarios,
  nuevoUsuarioSchema,
} from "@/lib/users";
import { crearDbPrueba } from "../helpers/db";

const BASE = { nombre: "Ana Pérez", email: "Ana@Vibra.bo", password: "secreto123", rol: "editor" };
const datos = (extra: Partial<typeof BASE> = {}) => nuevoUsuarioSchema.parse({ ...BASE, ...extra });

describe("nuevoUsuarioSchema", () => {
  it("normaliza el email a minúsculas", () => {
    expect(datos().email).toBe("ana@vibra.bo");
  });

  it("rechaza contraseña de menos de 8 caracteres", () => {
    expect(nuevoUsuarioSchema.safeParse({ ...BASE, password: "1234567" }).success).toBe(false);
  });

  it("rechaza contraseña de más de 128 caracteres", () => {
    expect(nuevoUsuarioSchema.safeParse({ ...BASE, password: "x".repeat(129) }).success).toBe(false);
  });

  it("rechaza rol inexistente", () => {
    expect(nuevoUsuarioSchema.safeParse({ ...BASE, rol: "jefe" }).success).toBe(false);
  });
});

// Solo estos bloques levantan Postgres (PGlite en memoria).
describe("con DB", () => {
  let db: Db;
  beforeEach(async () => {
    db = await crearDbPrueba();
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

    it("dos altas simultáneas con el mismo email: una falla con ErrorUsuario", async () => {
      const resultados = await Promise.allSettled([crearUsuario(db, datos()), crearUsuario(db, datos())]);
      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const [fallo] = resultados.filter((r) => r.status === "rejected");
      expect(fallo.reason).toBeInstanceOf(ErrorUsuario);
      expect(await db.select().from(user)).toHaveLength(1);
    });

    it("reconoce la violación de UNIQUE que devuelve Postgres", async () => {
      const fila = { id: "u1", name: "Ana", email: "ana@vibra.bo", emailVerified: true, role: "editor" };
      await db.insert(user).values(fila);
      const error = await db.insert(user).values({ ...fila, id: "u2" }).catch((e: unknown) => e);
      expect(esViolacionUnica(error)).toBe(true);
      expect(esViolacionUnica(new Error("otro"))).toBe(false);
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

    it("falla con ErrorUsuario si el usuario no existe", async () => {
      const admin = await crearUsuario(db, datos({ rol: "admin" }));
      await expect(cambiarRol(db, admin, "no-existe", "admin")).rejects.toThrow("El usuario no existe");
    });

    it("dos admins que se degradan entre sí: el segundo ya no es admin y no puede", async () => {
      const a = await crearUsuario(db, datos({ email: "a@vibra.bo", rol: "admin" }));
      const b = await crearUsuario(db, datos({ email: "b@vibra.bo", rol: "admin" }));
      const resultados = await Promise.allSettled([cambiarRol(db, a, b, "editor"), cambiarRol(db, b, a, "editor")]);
      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(resultados.find((r) => r.status === "rejected")).toMatchObject({ reason: { message: "Ya no sos admin" } });
      expect((await db.select().from(user).where(eq(user.role, "admin"))).length).toBe(1);
      // Y un editor (o un ex admin) no borra a nadie.
      const editor = (await db.select().from(user).where(eq(user.role, "editor")))[0].id;
      await expect(borrarUsuario(db, editor, a)).rejects.toThrow("Ya no sos admin");
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

    it("falla con ErrorUsuario si el usuario no existe", async () => {
      const admin = await crearUsuario(db, datos({ rol: "admin" }));
      await expect(borrarUsuario(db, admin, "no-existe")).rejects.toThrow("El usuario no existe");
    });
  });

  describe("cambiarContraseniaDeUsuario", () => {
    it("el admin le pone otra contraseña y se cierran sus sesiones", async () => {
      const admin = await crearUsuario(db, datos({ email: "admin@vibra.bo", rol: "admin" }));
      const editor = await crearUsuario(db, datos());
      await db.insert(session).values({
        id: "s1",
        token: "t1",
        userId: editor,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await cambiarContraseniaDeUsuario(db, admin, editor, "nueva-clave-123");
      const [cuenta] = await db.select().from(account).where(eq(account.userId, editor));
      expect(await verifyPassword({ hash: cuenta.password!, password: "nueva-clave-123" })).toBe(true);
      expect(await db.select().from(session).where(eq(session.userId, editor))).toEqual([]);
    });

    it("no sirve para la propia, ni a un editor, ni con un usuario que no existe", async () => {
      const admin = await crearUsuario(db, datos({ email: "admin@vibra.bo", rol: "admin" }));
      const editor = await crearUsuario(db, datos());
      await expect(cambiarContraseniaDeUsuario(db, admin, admin, "nueva-clave-123")).rejects.toThrow("Mi cuenta");
      await expect(cambiarContraseniaDeUsuario(db, editor, admin, "nueva-clave-123")).rejects.toThrow("Ya no sos admin");
      await expect(cambiarContraseniaDeUsuario(db, admin, "no-existe", "nueva-clave-123")).rejects.toThrow(
        "El usuario no existe",
      );
    });
  });
});
