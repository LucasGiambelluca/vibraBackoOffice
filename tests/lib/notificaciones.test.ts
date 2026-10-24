import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { notificacion, user } from "@/db/schema";
import {
  contarNoLeidas,
  listarNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
} from "@/lib/notificaciones";
import type { Actor } from "@/lib/permissions";
import { cambiarRecibirEmails } from "@/lib/users";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { nuevaTarea } from "../helpers/tareas";

let db: Db;
let admin: Actor;
let editor: Actor;
let tareaId: string;

async function notificar(usuarioId: string, mensaje: string, createdAt: Date) {
  const [n] = await db.insert(notificacion).values({ usuarioId, tareaId, mensaje, createdAt }).returning();
  return n.id;
}

beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
  tareaId = await nuevaTarea(db);
});

describe("notificaciones", () => {
  it("lista las del usuario, más nuevas primero, y cuenta las no leídas", async () => {
    await notificar(editor.id, "vieja", new Date("2027-03-01T10:00:00Z"));
    await notificar(editor.id, "nueva", new Date("2027-03-02T10:00:00Z"));
    await notificar(admin.id, "de otro", new Date("2027-03-03T10:00:00Z"));

    expect((await listarNotificaciones(db, editor.id)).map((n) => n.mensaje)).toEqual(["nueva", "vieja"]);
    expect(await contarNoLeidas(db, editor.id)).toBe(2);
  });

  it("marca una o todas como leídas, solo las propias", async () => {
    const a = await notificar(editor.id, "a", new Date());
    await notificar(editor.id, "b", new Date());
    const ajena = await notificar(admin.id, "c", new Date());

    await marcarLeida(db, editor.id, a);
    expect(await contarNoLeidas(db, editor.id)).toBe(1);
    await expect(marcarLeida(db, editor.id, ajena)).rejects.toThrow("La notificación no existe");

    await marcarTodasLeidas(db, editor.id);
    expect(await contarNoLeidas(db, editor.id)).toBe(0);
    expect(await contarNoLeidas(db, admin.id)).toBe(1);
  });
});

describe("cambiarRecibirEmails", () => {
  it("guarda la preferencia", async () => {
    await cambiarRecibirEmails(db, editor.id, false);
    const [u] = await db.select().from(user).where(eq(user.id, editor.id));
    expect(u.recibirEmails).toBe(false);
  });
});
