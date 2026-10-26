import type { Db } from "@/db/client";
import type { EnviarEmail } from "@/lib/email";
import { enviarEmailsPendientes, procesarRecordatorios } from "@/lib/envio-recordatorios";
import { registrarLatido } from "@/lib/latido";

// Las E2E lo bajan a segundos para no esperar un minuto por cada recordatorio.
export const INTERVALO_MS = Number(process.env.WORKER_INTERVALO_MS) || 60_000;

/** Una corrida: notifica los recordatorios vencidos, manda los emails pendientes y deja el latido. */
export async function correrCiclo(db: Db, enviar: EnviarEmail, urlBase: string, ahora = new Date()): Promise<number> {
  const procesados = await procesarRecordatorios(db, ahora);
  await enviarEmailsPendientes(db, enviar, urlBase, ahora);
  await registrarLatido(db, ahora);
  return procesados;
}

/** Si un ciclo tarda más que `limiteMs`, se llama a `alColgarse` (el worker aparte sale y Docker lo reinicia). */
export type Vigilancia = { limiteMs: number; alColgarse: () => void };

/**
 * Corre `ciclo` al iniciar y después cada minuto, sin solapar corridas en este proceso.
 * Devuelve una función para detenerlo.
 */
export function iniciarWorker(ciclo: () => Promise<number>, vigilancia?: Vigilancia): () => void {
  let inicio: number | null = null;

  async function tick() {
    if (inicio !== null) {
      if (vigilancia && Date.now() - inicio > vigilancia.limiteMs) {
        console.error(`[worker] el ciclo lleva más de ${vigilancia.limiteMs / 60_000} min colgado`);
        vigilancia.alColgarse();
      }
      return;
    }
    inicio = Date.now();
    try {
      const procesados = await ciclo();
      if (procesados > 0) console.log(`[worker] ${procesados} recordatorio(s) procesado(s)`);
    } catch (error) {
      console.error("[worker] falló el ciclo", error);
    } finally {
      inicio = null;
    }
  }

  void tick();
  const intervalo = setInterval(tick, INTERVALO_MS);
  return () => clearInterval(intervalo);
}

export function urlBase(): string {
  return process.env.BETTER_AUTH_URL || "http://localhost:3000";
}
