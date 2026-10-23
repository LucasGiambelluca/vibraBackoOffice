import { esProduccion } from "@/lib/entorno";
import { crearDb, type Db } from "./client";

// Se cachea en globalThis: Next recarga módulos en dev y PGlite admite un solo proceso.
const globalDb = globalThis as unknown as { __vibraDb?: Db };

function obtenerDb(): Db {
  if (!globalDb.__vibraDb) {
    const url = process.env.DATABASE_URL || undefined;
    if (!url && esProduccion()) throw new Error("DATABASE_URL es obligatorio en producción");
    globalDb.__vibraDb = crearDb(url);
  }
  return globalDb.__vibraDb;
}

// Perezosa: importar `db` no abre la base (así `next build` no levanta PGlite en cada worker).
export const db = new Proxy({} as Db, {
  get(_destino, prop) {
    const real = obtenerDb();
    const valor = Reflect.get(real, prop, real);
    return typeof valor === "function" ? valor.bind(real) : valor;
  },
});
