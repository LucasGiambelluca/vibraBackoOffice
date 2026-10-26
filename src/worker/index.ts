import { cerrarDb, crearDb } from "@/db/client";
import { crearEnviador } from "@/lib/email";
import { correrCiclo, iniciarWorker, urlBase } from "./ciclo";

const url = process.env.DATABASE_URL;
if (!url) {
  // Con PGlite la base solo la puede abrir un proceso: en desarrollo usá WORKER_EN_APP=true.
  console.error("[worker] DATABASE_URL es obligatorio. En desarrollo usá WORKER_EN_APP=true con npm run dev.");
  process.exit(1);
}

const db = crearDb(url);
const enviar = crearEnviador();
// Un ciclo colgado (DB o SMTP sin responder) no se destraba solo: se sale y Docker reinicia el contenedor.
const detener = iniciarWorker(() => correrCiclo(db, enviar, urlBase()), {
  limiteMs: 30 * 60_000,
  alColgarse: () => process.exit(1),
});
console.log("[worker] iniciado");

for (const senal of ["SIGINT", "SIGTERM"] as const) {
  process.on(senal, async () => {
    detener();
    await cerrarDb(db);
    process.exit(0);
  });
}
