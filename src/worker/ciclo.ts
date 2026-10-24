import type { Db } from "@/db/client";
import type { EnviarEmail } from "@/lib/email";
import { enviarEmailsPendientes, procesarRecordatorios } from "@/lib/envio-recordatorios";

export const INTERVALO_MS = 60_000;

/** Una corrida: notifica los recordatorios vencidos y manda los emails pendientes. */
export async function correrCiclo(db: Db, enviar: EnviarEmail, urlBase: string, ahora = new Date()): Promise<number> {
  const procesados = await procesarRecordatorios(db, ahora);
  await enviarEmailsPendientes(db, enviar, urlBase, ahora);
  return procesados;
}

/**
 * Corre `ciclo` al iniciar y después cada minuto, sin solapar corridas en este proceso.
 * Devuelve una función para detenerlo.
 */
export function iniciarWorker(ciclo: () => Promise<number>): () => void {
  let corriendo = false;

  async function tick() {
    if (corriendo) return;
    corriendo = true;
    try {
      const procesados = await ciclo();
      if (procesados > 0) console.log(`[worker] ${procesados} recordatorio(s) procesado(s)`);
    } catch (error) {
      console.error("[worker] falló el ciclo", error);
    } finally {
      corriendo = false;
    }
  }

  void tick();
  const intervalo = setInterval(tick, INTERVALO_MS);
  return () => clearInterval(intervalo);
}

export function urlBase(): string {
  return process.env.BETTER_AUTH_URL || "http://localhost:3000";
}
