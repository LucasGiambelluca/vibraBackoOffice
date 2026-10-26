import { afterEach, describe, expect, it, vi } from "vitest";
import { notificacion } from "@/db/schema";
import { LATIDO_MAX_MS, workerVivo } from "@/lib/latido";
import { correrCiclo, iniciarWorker, INTERVALO_MS } from "@/worker/ciclo";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import { nuevaTarea } from "../helpers/tareas";

afterEach(() => {
  vi.useRealTimers();
});

describe("correrCiclo", () => {
  it("procesa los recordatorios vencidos y manda sus emails", async () => {
    const db = await crearDbPrueba();
    const { editor } = await crearActores(db);
    // Creada el 1/3 con vencimiento el 3/3: solo tiene el recordatorio del día.
    await nuevaTarea(db, { fechaLimite: "2027-03-03", responsableId: editor.id });
    const enviar = vi.fn(async () => {});

    expect(await correrCiclo(db, enviar, "https://vibra.test", new Date("2027-03-03T13:00:00Z"))).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect((await db.select().from(notificacion))[0].emailEstado).toBe("enviado");
  });

  it("registra el latido del worker al terminar", async () => {
    const db = await crearDbPrueba();
    const ahora = new Date("2027-03-03T13:00:00Z");
    expect(await workerVivo(db, ahora)).toBe(false);

    await correrCiclo(db, async () => {}, "https://vibra.test", ahora);
    expect(await workerVivo(db, ahora)).toBe(true);
    expect(await workerVivo(db, new Date(ahora.getTime() + LATIDO_MAX_MS - 1))).toBe(true);
    expect(await workerVivo(db, new Date(ahora.getTime() + LATIDO_MAX_MS + 1))).toBe(false);
  });
});

describe("iniciarWorker", () => {
  it("corre al iniciar y después una vez por intervalo, hasta detenerlo", async () => {
    vi.useFakeTimers();
    const ciclo = vi.fn(async () => 0);
    const detener = iniciarWorker(ciclo);
    await vi.advanceTimersByTimeAsync(0);
    expect(ciclo).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVALO_MS);
    expect(ciclo).toHaveBeenCalledTimes(2);

    detener();
    await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3);
    expect(ciclo).toHaveBeenCalledTimes(2);
  });

  it("si un ciclo falla, sigue con el próximo", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ciclo = vi.fn().mockRejectedValueOnce(new Error("DB caída")).mockResolvedValue(0);
    const detener = iniciarWorker(ciclo);
    await vi.advanceTimersByTimeAsync(INTERVALO_MS);
    expect(ciclo).toHaveBeenCalledTimes(2);
    detener();
  });

  it("si un ciclo queda colgado más del límite, avisa para que el proceso se reinicie", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const alColgarse = vi.fn();
    const detener = iniciarWorker(() => new Promise<number>(() => {}), { limiteMs: INTERVALO_MS * 3, alColgarse });

    await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3);
    expect(alColgarse).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(INTERVALO_MS);
    expect(alColgarse).toHaveBeenCalledTimes(1);
    detener();
  });
});
