import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

export const PGLITE_DIR = process.env.PGLITE_DIR ?? "./.data/pglite";

export function crearDb(databaseUrl?: string): Db {
  if (databaseUrl) return drizzlePostgres({ client: postgres(databaseUrl), schema });

  // Desarrollo local sin Docker: Postgres embebido. La API de Drizzle es la misma,
  // por eso se tipa como un único `Db`.
  mkdirSync(PGLITE_DIR, { recursive: true });
  return drizzlePglite({ client: new PGlite(PGLITE_DIR), schema }) as unknown as Db;
}
