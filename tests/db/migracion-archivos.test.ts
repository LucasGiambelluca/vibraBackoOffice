import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

// La 0008 pasa el PDF de cada cotización (cotizacion.adjunto) a la tabla archivo.

function migracionesHasta(hasta: number): string {
  const dir = mkdtempSync(path.join(tmpdir(), "vibra-migraciones-"));
  cpSync("drizzle", dir, { recursive: true });
  const ruta = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(ruta, "utf8"));
  journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= hasta);
  writeFileSync(ruta, JSON.stringify(journal));
  return dir;
}

describe("migración 0008 (archivos)", () => {
  it("el adjunto de cada cotización pasa a ser un archivo de la cotización", async () => {
    const db = drizzle({ client: new PGlite() });
    await migrate(db, { migrationsFolder: migracionesHasta(7) });

    await db.execute(sql`insert into "user" (id, name, email, role) values ('u1', 'Ana', 'ana@vibra.bo', 'admin')`);
    await db.execute(sql`insert into proveedor (id, nombre) values ('p1', 'Sonido Andino')`);
    await db.execute(sql`
      insert into cotizacion (id, evento_rubro_id, proveedor_id, descripcion, moneda, precio_dia, adjunto, creado_por)
      select 'c1', er.id, 'p1', 'PA', 'ARS', 1000, 'a.pdf', 'u1'
      from evento_rubro er join rubro r on r.id = er.rubro_id where r.nombre = 'Sonido'`);
    await db.execute(sql`
      insert into cotizacion (id, evento_rubro_id, proveedor_id, descripcion, moneda, precio_dia)
      select 'c2', er.id, 'p1', 'Luces', 'ARS', 1000
      from evento_rubro er join rubro r on r.id = er.rubro_id where r.nombre = 'Luces'`);

    await migrate(db, { migrationsFolder: "drizzle" });

    const archivos = (
      await db.execute(sql`
        select a.cotizacion_id, a.tipo, a.nombre, a.guardado, a.subido_por, a.evento_id = e.id as del_evento
        from archivo a, evento e`)
    ).rows;
    expect(archivos).toEqual([
      { cotizacion_id: "c1", tipo: "pdf", nombre: "Cotización.pdf", guardado: "a.pdf", subido_por: "u1", del_evento: true },
    ]);
    const columnas = (
      await db.execute(sql`select column_name from information_schema.columns where table_name = 'cotizacion'`)
    ).rows.map((f) => f.column_name);
    expect(columnas).not.toContain("adjunto");
  });
});
