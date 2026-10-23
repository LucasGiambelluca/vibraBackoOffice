import { crearDb, type Db } from "./client";

// En dev, Next recarga módulos: se reutiliza la conexión (PGlite admite un solo proceso).
const globalDb = globalThis as unknown as { __vibraDb?: Db };

export const db = globalDb.__vibraDb ?? crearDb(process.env.DATABASE_URL || undefined);

if (process.env.NODE_ENV !== "production") globalDb.__vibraDb = db;
