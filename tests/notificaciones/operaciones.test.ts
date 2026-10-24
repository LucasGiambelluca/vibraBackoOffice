import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { preferenciaEmails } from "@/app/(app)/cuenta/operaciones";
import { lecturaNotificacion, lecturaTodas } from "@/app/(app)/notificaciones/operaciones";
import type { Db } from "@/db/client";
import { notificacion, user } from "@/db/schema";
import { contarNoLeidas } from "@/lib/notificaciones";
import type { Actor } from "@/lib/permissions";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { nuevaTarea } from "../helpers/tareas";

let db: Db;
let admin: Actor;
let editor: Actor;
beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
});

describe("notificaciones", () => {
  it("cada usuario marca solo las suyas", async () => {
    const tareaId = await nuevaTarea(db);
    const [mia] = await db.insert(notificacion).values({ usuarioId: editor.id, tareaId, mensaje: "a" }).returning();
    const [ajena] = await db.insert(notificacion).values({ usuarioId: admin.id, tareaId, mensaje: "b" }).returning();

    expect(await lecturaNotificacion(db, editor, { notificacionId: ajena.id })).toEqual({
      ok: false,
      error: "La notificación no existe",
    });
    expect(await lecturaNotificacion(db, editor, { notificacionId: mia.id })).toEqual({ ok: true });
    expect(await contarNoLeidas(db, editor.id)).toBe(0);

    expect(await lecturaTodas(db, admin)).toEqual({ ok: true });
    expect(await contarNoLeidas(db, admin.id)).toBe(0);
  });
});

describe("preferenciaEmails", () => {
  it("checkbox ausente = no recibir; 'on' = recibir", async () => {
    const recibe = async () => (await db.select().from(user).where(eq(user.id, editor.id)))[0].recibirEmails;
    expect(await preferenciaEmails(db, editor, {})).toEqual({ ok: true });
    expect(await recibe()).toBe(false);
    expect(await preferenciaEmails(db, editor, { recibirEmails: "on" })).toEqual({ ok: true });
    expect(await recibe()).toBe(true);
  });
});
