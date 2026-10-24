import { db } from "@/db";
import { crearEnviador } from "@/lib/email";
import { correrCiclo, iniciarWorker, urlBase } from "./ciclo";

// Next recarga módulos en dev: se guarda en globalThis para no arrancar dos workers.
const global = globalThis as unknown as { __vibraWorker?: () => void };

export function iniciarWorkerEnApp(): void {
  if (global.__vibraWorker) return;
  const enviar = crearEnviador();
  global.__vibraWorker = iniciarWorker(() => correrCiclo(db, enviar, urlBase()));
  console.log("[worker] corriendo dentro de Next (WORKER_EN_APP=true)");
}
