import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { latido } from "@/db/schema";

/** Sin latido en este tiempo, /api/salud/worker da 503 (el ciclo corre cada minuto). */
export const LATIDO_MAX_MS = 10 * 60_000;

export async function registrarLatido(db: Db, ahora = new Date()): Promise<void> {
  await db
    .insert(latido)
    .values({ proceso: "worker", at: ahora })
    .onConflictDoUpdate({ target: latido.proceso, set: { at: ahora } });
}

export async function workerVivo(db: Db, ahora = new Date()): Promise<boolean> {
  const [fila] = await db.select({ at: latido.at }).from(latido).where(eq(latido.proceso, "worker"));
  return !!fila && ahora.getTime() - fila.at.getTime() <= LATIDO_MAX_MS;
}
