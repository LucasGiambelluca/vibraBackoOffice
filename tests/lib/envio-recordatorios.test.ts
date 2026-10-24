import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { notificacion, user } from "@/db/schema";
import type { Email } from "@/lib/email";
import { enviarEmailsPendientes, MAX_INTENTOS_EMAIL, procesarRecordatorios } from "@/lib/envio-recordatorios";
import type { Actor } from "@/lib/permissions";
import { cambiarEstadoTarea } from "@/lib/tareas";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { AHORA, nuevaTarea, recordatoriosDe } from "../helpers/tareas";

const DIA_10_NUEVE = new Date("2027-03-10T13:00:00Z");
// Una tarea que vence el 3/3 creada el 1/3 solo tiene el recordatorio del día (el de 3 días antes ya pasó).
const DIA_3_NUEVE = new Date("2027-03-03T13:00:00Z");
const notificaciones = (db: Db) => db.select().from(notificacion);

let db: Db;
let admin: Actor;
let editor: Actor;
beforeEach(async () => {
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
});

describe("procesarRecordatorios", () => {
  it("notifica al responsable una sola vez, aunque se corra dos veces", async () => {
    const id = await nuevaTarea(db, { titulo: "Vallas", fechaLimite: "2027-03-10", responsableId: editor.id });
    const tresDiasAntes = new Date("2027-03-07T13:00:00Z");

    expect(await procesarRecordatorios(db, tresDiasAntes)).toBe(1);
    expect(await procesarRecordatorios(db, tresDiasAntes)).toBe(0);

    expect(await notificaciones(db)).toMatchObject([
      { usuarioId: editor.id, tareaId: id, mensaje: '"Vallas" vence en 3 días (10/03/2027)', leida: false },
    ]);
  });

  it("no manda los futuros ni los cancelados", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10", responsableId: editor.id });
    expect(await procesarRecordatorios(db, AHORA)).toBe(0);
    await cambiarEstadoTarea(db, id, "hecha", AHORA);
    expect(await procesarRecordatorios(db, DIA_10_NUEVE)).toBe(0);
  });

  it("sin responsable notifica a todos los admins", async () => {
    await nuevaTarea(db, { fechaLimite: "2027-03-03" });
    await procesarRecordatorios(db, DIA_3_NUEVE);
    expect((await notificaciones(db)).map((n) => n.usuarioId)).toEqual([admin.id]);
  });

  it("el día del vencimiento, si no está hecha, planifica el diario de vencida", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10", responsableId: editor.id });
    await procesarRecordatorios(db, DIA_10_NUEVE);
    expect((await recordatoriosDe(db, id)).at(-1)).toEqual({
      tipo: "vencida_diario",
      fechaHora: "2027-03-11T13:00:00.000Z",
      estado: "pendiente",
    });

    // Y el diario se sigue encadenando.
    await procesarRecordatorios(db, new Date("2027-03-11T13:00:30Z"));
    expect((await recordatoriosDe(db, id)).at(-1)?.fechaHora).toBe("2027-03-12T13:00:00.000Z");
  });

  it("quien no quiere emails recibe la notificación con email omitido", async () => {
    await db.update(user).set({ recibirEmails: false }).where(eq(user.id, editor.id));
    await nuevaTarea(db, { fechaLimite: "2027-03-03", responsableId: editor.id });
    await procesarRecordatorios(db, DIA_3_NUEVE);
    expect((await notificaciones(db)).map((n) => n.emailEstado)).toEqual(["omitido"]);
  });

  it("si borraron al responsable, les llega a los admins", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-03", responsableId: editor.id });
    await db.delete(user).where(eq(user.id, editor.id));
    await procesarRecordatorios(db, DIA_3_NUEVE);
    const filas = await db.select().from(notificacion).where(eq(notificacion.tareaId, id));
    expect(filas.map((n) => n.usuarioId)).toEqual([admin.id]);
  });
});

describe("enviarEmailsPendientes", () => {
  beforeEach(async () => {
    await nuevaTarea(db, { titulo: "Vallas", fechaLimite: "2027-03-03", responsableId: editor.id });
    await procesarRecordatorios(db, DIA_3_NUEVE);
  });

  it("manda el email con link a la tarea y lo marca enviado", async () => {
    const enviados: Email[] = [];
    await enviarEmailsPendientes(db, async (email) => void enviados.push(email), "https://vibra.test");
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ para: "editor@vibra.bo", asunto: 'Vibra 2027 — "Vallas" vence hoy' });
    expect(enviados[0].texto).toMatch(/https:\/\/vibra\.test\/tareas\/[0-9a-f-]{36}/);
    expect((await notificaciones(db))[0]).toMatchObject({ emailEstado: "enviado", intentosEmail: 1 });

    await enviarEmailsPendientes(db, async (email) => void enviados.push(email), "https://vibra.test");
    expect(enviados).toHaveLength(1);
  });

  it("si falla reintenta en la próxima corrida, hasta el máximo", async () => {
    const fallar = async () => {
      throw new Error("SMTP caído");
    };
    for (let i = 1; i < MAX_INTENTOS_EMAIL; i++) {
      await enviarEmailsPendientes(db, fallar, "https://vibra.test");
      expect((await notificaciones(db))[0]).toMatchObject({ emailEstado: "pendiente", intentosEmail: i });
    }
    await enviarEmailsPendientes(db, fallar, "https://vibra.test");
    expect((await notificaciones(db))[0]).toMatchObject({ emailEstado: "fallido", intentosEmail: MAX_INTENTOS_EMAIL });
  });
});
