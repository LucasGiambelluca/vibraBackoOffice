import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { notificacion, recordatorio, tarea, user } from "@/db/schema";
import { crearDbPrueba } from "../helpers/db";

describe("tablas de tareas", () => {
  it("borrar una tarea borra sus recordatorios y notificaciones", async () => {
    const db = await crearDbPrueba();
    await db.insert(user).values({ id: "u1", name: "Ana", email: "ana@vibra.bo", emailVerified: true });
    const [t] = await db.insert(tarea).values({ titulo: "Contratar vallas", areaId: 4 }).returning();
    expect(t).toMatchObject({ estado: "pendiente", fechaLimite: null, responsableId: null });

    await db.insert(recordatorio).values({ tareaId: t.id, fechaHora: new Date(), origen: "manual" });
    await db.insert(notificacion).values({ usuarioId: "u1", tareaId: t.id, mensaje: "hola" });

    await db.delete(tarea).where(eq(tarea.id, t.id));
    expect(await db.select().from(recordatorio)).toHaveLength(0);
    expect(await db.select().from(notificacion)).toHaveLength(0);
  });

  it("fecha límite se guarda y se lee como YYYY-MM-DD", async () => {
    const db = await crearDbPrueba();
    const [t] = await db.insert(tarea).values({ titulo: "Pedir permisos", areaId: 5, fechaLimite: "2027-03-10" }).returning();
    expect(t.fechaLimite).toBe("2027-03-10");
  });
});
