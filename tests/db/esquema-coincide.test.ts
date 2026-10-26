import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { crearDbPrueba } from "../helpers/db";

// La 0007 está escrita a mano: esto compara la base que dejan las migraciones con la que
// arma drizzle-kit directo desde src/db/schema (columnas, restricciones e índices).

async function estructura(db: Db) {
  const consulta = async (q: ReturnType<typeof sql>) =>
    ((await db.execute(q)) as unknown as { rows: Record<string, unknown>[] }).rows.map((r) => JSON.stringify(r)).sort();
  return {
    columnas: await consulta(sql`
      select table_name, column_name, data_type, is_nullable, column_default, is_identity, numeric_precision, numeric_scale
      from information_schema.columns where table_schema = 'public'`),
    restricciones: await consulta(sql`
      select conrelid::regclass::text as tabla, conname, pg_get_constraintdef(oid) as definicion
      from pg_constraint where connamespace = 'public'::regnamespace`),
    indices: await consulta(sql`select indexname, indexdef from pg_indexes where schemaname = 'public'`),
  };
}

describe("esquema", () => {
  it("las migraciones dejan la base igual a src/db/schema", async () => {
    const migrada = await crearDbPrueba();
    const directa = drizzle({ client: new PGlite(), schema }) as unknown as Db;
    const { apply } = await pushSchema(schema, directa as never);
    await apply();
    expect(await estructura(migrada)).toEqual(await estructura(directa));
  });
});
