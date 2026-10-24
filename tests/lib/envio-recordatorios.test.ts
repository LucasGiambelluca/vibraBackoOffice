import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { notificacion, recordatorio, tarea, user } from "@/db/schema";
import type { Email } from "@/lib/email";
import {
  enviarEmailsPendientes,
  MAX_INTENTOS_EMAIL,
  procesarRecordatorios,
  reclamarEmails,
} from "@/lib/envio-recordatorios";
import type { Actor } from "@/lib/permissions";
import { cambiarEstadoTarea } from "@/lib/tareas";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { AHORA, nuevaTarea, recordatoriosDe } from "../helpers/tareas";

const DIA_10_NUEVE = new Date("2027-03-10T13:00:00Z");
// Una tarea que vence el 3/3 creada el 1/3 solo tiene el recordatorio del día (el de 3 días antes ya pasó).
const DIA_3_NUEVE = new Date("2027-03-03T13:00:00Z");
const ONCE_MINUTOS = 11 * 60_000;
const notificaciones = (db: Db) => db.select().from(notificacion);

let db: Db;
let admin: Actor;
let editor: Actor;
afterEach(() => {
  vi.restoreAllMocks();
});
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

describe("procesarRecordatorios: estado de la tarea", () => {
  it("si la tarea ya está hecha cancela el recordatorio sin notificar", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10", responsableId: editor.id });
    await cambiarEstadoTarea(db, id, "hecha", AHORA);
    // Un manual creado en carrera con "Hecha" queda pendiente.
    await db.insert(recordatorio).values({ tareaId: id, origen: "manual", fechaHora: new Date("2027-03-05T13:00:00Z") });

    expect(await procesarRecordatorios(db, DIA_10_NUEVE)).toBe(0);
    expect(await notificaciones(db)).toEqual([]);
    expect((await recordatoriosDe(db, id)).find((r) => r.tipo === "manual")?.estado).toBe("cancelado");
  });

  it("si la tarea ya no está vencida, corta la cadena del diario de vencida", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10", responsableId: editor.id });
    await procesarRecordatorios(db, DIA_10_NUEVE);
    await db.delete(notificacion);
    // La fecha se movió sin regenerar los automáticos (p. ej. en carrera con el worker).
    await db.update(tarea).set({ fechaLimite: "2027-03-20" }).where(eq(tarea.id, id));

    expect(await procesarRecordatorios(db, new Date("2027-03-11T13:00:30Z"))).toBe(0);
    expect(await notificaciones(db)).toEqual([]);
    const recordatorios = await recordatoriosDe(db, id);
    expect(recordatorios.at(-1)).toEqual({ tipo: "vencida_diario", fechaHora: "2027-03-11T13:00:00.000Z", estado: "cancelado" });
  });

  it("si la tarea quedó sin fecha límite, corta la cadena del diario de vencida", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10", responsableId: editor.id });
    await procesarRecordatorios(db, DIA_10_NUEVE);
    await db.update(tarea).set({ fechaLimite: null }).where(eq(tarea.id, id));

    expect(await procesarRecordatorios(db, new Date("2027-03-11T13:00:30Z"))).toBe(0);
    expect((await recordatoriosDe(db, id)).at(-1)?.estado).toBe("cancelado");
  });
});

describe("procesarRecordatorios: worker caído", () => {
  it("descarta los automáticos de días anteriores pero arranca la cadena de vencida", async () => {
    const id = await nuevaTarea(db, { fechaLimite: "2027-03-10", responsableId: editor.id });
    // El worker vuelve el 12/3 a las 10:00 de La Paz.
    expect(await procesarRecordatorios(db, new Date("2027-03-12T14:00:00Z"))).toBe(0);

    expect(await notificaciones(db)).toEqual([]);
    expect(await recordatoriosDe(db, id)).toEqual([
      { tipo: "3_dias_antes", fechaHora: "2027-03-07T13:00:00.000Z", estado: "cancelado" },
      { tipo: "dia_vencimiento", fechaHora: "2027-03-10T13:00:00.000Z", estado: "cancelado" },
      { tipo: "vencida_diario", fechaHora: "2027-03-13T13:00:00.000Z", estado: "pendiente" },
    ]);
  });

  it("si vuelve el mismo día del vencimiento, avisa solo el del día", async () => {
    await nuevaTarea(db, { titulo: "Vallas", fechaLimite: "2027-03-10", responsableId: editor.id });
    expect(await procesarRecordatorios(db, new Date("2027-03-10T20:00:00Z"))).toBe(1);
    expect((await notificaciones(db)).map((n) => n.mensaje)).toEqual(['"Vallas" vence hoy']);
  });

  it("los manuales atrasados se avisan igual", async () => {
    const id = await nuevaTarea(db, { titulo: "Vallas", responsableId: editor.id });
    await db.insert(recordatorio).values({ tareaId: id, origen: "manual", fechaHora: new Date("2027-03-05T13:00:00Z") });
    expect(await procesarRecordatorios(db, new Date("2027-03-08T13:00:00Z"))).toBe(1);
    expect((await notificaciones(db)).map((n) => n.mensaje)).toEqual(['Recordatorio: "Vallas"']);
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

  it("si falla reintenta pasada la ventana de reclamo, hasta el máximo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fallar = async () => {
      throw new Error("SMTP caído");
    };
    // Cada intento reclama la fila por 10 minutos: las corridas van separadas por 11.
    const corrida = (i: number) => new Date(DIA_3_NUEVE.getTime() + i * ONCE_MINUTOS);
    for (let i = 1; i < MAX_INTENTOS_EMAIL; i++) {
      await enviarEmailsPendientes(db, fallar, "https://vibra.test", corrida(i));
      expect((await notificaciones(db))[0]).toMatchObject({ emailEstado: "pendiente", intentosEmail: i });
    }
    await enviarEmailsPendientes(db, fallar, "https://vibra.test", corrida(MAX_INTENTOS_EMAIL));
    expect((await notificaciones(db))[0]).toMatchObject({ emailEstado: "fallido", intentosEmail: MAX_INTENTOS_EMAIL });
  });

  it("un email que falló no se reintenta antes de 10 minutos", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await enviarEmailsPendientes(db, async () => Promise.reject(new Error("SMTP caído")), "https://vibra.test", DIA_3_NUEVE);
    const enviar = vi.fn(async () => {});
    await enviarEmailsPendientes(db, enviar, "https://vibra.test", new Date(DIA_3_NUEVE.getTime() + 5 * 60_000));
    expect(enviar).not.toHaveBeenCalled();
  });

  it("reclamar suma el intento aunque el proceso muera antes de mandar", async () => {
    const reclamadas = await reclamarEmails(db, DIA_3_NUEVE);
    expect(reclamadas).toHaveLength(1);
    expect((await notificaciones(db))[0]).toMatchObject({ emailEstado: "pendiente", intentosEmail: 1 });

    // Reclamada: otro worker no la toma dentro de los 10 minutos.
    expect(await reclamarEmails(db, new Date(DIA_3_NUEVE.getTime() + 9 * 60_000))).toHaveLength(0);
    const enviar = vi.fn(async () => {});
    await enviarEmailsPendientes(db, enviar, "https://vibra.test", new Date(DIA_3_NUEVE.getTime() + 9 * 60_000));
    expect(enviar).not.toHaveBeenCalled();

    // Pasada la ventana se retoma.
    await enviarEmailsPendientes(db, enviar, "https://vibra.test", new Date(DIA_3_NUEVE.getTime() + ONCE_MINUTOS));
    expect(enviar).toHaveBeenCalledTimes(1);
    expect((await notificaciones(db))[0]).toMatchObject({ emailEstado: "enviado", intentosEmail: 2 });
  });

  it("si se agotaron los intentos al reclamar y el proceso murió, la próxima vez queda fallido sin mandar", async () => {
    for (let i = 0; i < MAX_INTENTOS_EMAIL; i++) {
      await reclamarEmails(db, new Date(DIA_3_NUEVE.getTime() + i * ONCE_MINUTOS));
    }
    const enviar = vi.fn(async () => {});
    await enviarEmailsPendientes(db, enviar, "https://vibra.test", new Date(DIA_3_NUEVE.getTime() + 10 * ONCE_MINUTOS));
    expect(enviar).not.toHaveBeenCalled();
    expect((await notificaciones(db))[0]).toMatchObject({ emailEstado: "fallido", intentosEmail: MAX_INTENTOS_EMAIL });
  });
});
