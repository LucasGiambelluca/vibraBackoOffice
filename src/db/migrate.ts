import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { crearDb } from "./client";

const MIGRACIONES = { migrationsFolder: "drizzle" };

async function main() {
  const url = process.env.DATABASE_URL || undefined;
  const db = crearDb(url);
  if (url) await migratePostgres(db, MIGRACIONES);
  else await migratePglite(db as never, MIGRACIONES);
  console.log("Migraciones aplicadas");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
