import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

// La 0007 pasa lo cargado con el esquema de un solo evento a "Vibra Bolivia 2027".
// Se arma una base en la 0006, se cargan datos con SQL crudo y se aplica la 0007 (sola: la 0008
// saca cotizacion.adjunto, que esta prueba revisa).

/** Carpeta de migraciones recortada hasta `hasta` (inclusive). */
function migracionesHasta(hasta: number): string {
  const dir = mkdtempSync(path.join(tmpdir(), "vibra-migraciones-"));
  cpSync("drizzle", dir, { recursive: true });
  const ruta = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(ruta, "utf8"));
  journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= hasta);
  writeFileSync(ruta, JSON.stringify(journal));
  return dir;
}

async function baseEn0006() {
  const db = drizzle({ client: new PGlite() });
  await migrate(db, { migrationsFolder: migracionesHasta(6) });
  return db;
}

type Db = Awaited<ReturnType<typeof baseEn0006>>;

async function filas<T>(db: Db, consulta: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(consulta)).rows as T[];
}

async function cargarDatos(db: Db, tipos: { usd?: string; ars?: string }) {
  await db.execute(sql`insert into "user" (id, name, email, role) values ('u1', 'Ana', 'ana@vibra.bo', 'admin')`);
  await db.execute(sql`insert into proveedor (id, nombre) values ('p1', 'Sonido Andino'), ('p2', 'LED Show')`);
  await db.execute(sql`
    insert into cotizacion (id, rubro_id, proveedor_id, descripcion, moneda, precio_dia, estado, aprobada_por, aprobada_at, adjunto)
    select 'c1', id, 'p1', 'PA completo', 'BOB', 9000, 'aprobada', 'u1', now(), 'x.pdf' from rubro where nombre = 'Sonido'`);
  await db.execute(sql`
    insert into cotizacion (id, rubro_id, proveedor_id, descripcion, moneda, precio_dia)
    select 'c2', id, 'p2', 'Pantalla 6x4', 'USD', 4150 from rubro where nombre = 'Pantalla'`);
  await db.execute(sql`insert into tarea (id, titulo, area_id) values ('t1', 'Contratar vallas', 4)`);
  await db.execute(
    sql`insert into recordatorio (id, tarea_id, fecha_hora, origen) values ('r1', 't1', now(), 'manual')`,
  );
  if (tipos.usd) await db.execute(sql`insert into tipo_cambio (moneda, valor_bob) values ('USD', ${tipos.usd})`);
  if (tipos.ars) await db.execute(sql`insert into tipo_cambio (moneda, valor_bob) values ('ARS', ${tipos.ars})`);
}

describe("migración 0007 (multi-evento)", () => {
  it("pasa lo cargado a Vibra Bolivia 2027 sin perder nada", async () => {
    const db = await baseEn0006();
    await cargarDatos(db, { usd: "6.96", ars: "0.0052" });
    await migrate(db, { migrationsFolder: migracionesHasta(7) });

    const eventos = await filas<{ id: string; nombre: string; estado: string }>(db, sql`select id, nombre, estado from evento`);
    expect(eventos).toEqual([{ id: expect.any(String), nombre: "Vibra Bolivia 2027", estado: "activo" }]);
    const vibra = eventos[0].id;

    const rubros = await filas<{ nombre: string; dias: number; evento_id: string }>(
      db,
      sql`select r.nombre, er.dias, er.evento_id from evento_rubro er join rubro r on r.id = er.rubro_id order by r.nombre`,
    );
    expect(rubros).toHaveLength(7);
    expect(rubros.every((r) => r.dias === 2 && r.evento_id === vibra)).toBe(true);

    const cotizaciones = await filas<Record<string, unknown>>(
      db,
      sql`select c.id, r.nombre as rubro, c.estado, c.aprobada_por, c.adjunto
          from cotizacion c join evento_rubro er on er.id = c.evento_rubro_id join rubro r on r.id = er.rubro_id
          order by c.id`,
    );
    expect(cotizaciones).toEqual([
      { id: "c1", rubro: "Sonido", estado: "aprobada", aprobada_por: "u1", adjunto: "x.pdf" },
      { id: "c2", rubro: "Pantalla", estado: "pendiente", aprobada_por: null, adjunto: null },
    ]);

    expect(await filas(db, sql`select evento_id, grupo_id from tarea`)).toEqual([{ evento_id: vibra, grupo_id: 4 }]);
    expect(await filas(db, sql`select id from recordatorio`)).toEqual([{ id: "r1" }]);

    expect(await filas(db, sql`select nombre, orden from grupo order by id`)).toEqual([
      { nombre: "Marketing y Audiovisual", orden: 1 },
      { nombre: "Técnica, Escenario y Backline", orden: 2 },
      { nombre: "Logística, Hospitalidad y RRHH", orden: 3 },
      { nombre: "Infraestructura y Predio", orden: 4 },
      { nombre: "Seguridad y Prevención", orden: 5 },
      { nombre: "Gestión Presupuestaria", orden: 6 },
    ]);
    // Los grupos nuevos siguen después de los 6 originales.
    expect(await filas(db, sql`insert into grupo (nombre) values ('Prensa') returning id`)).toEqual([{ id: 7 }]);

    expect(
      await filas(db, sql`select moneda, valor_ars from evento_tipo_cambio where evento_id = ${vibra} order by moneda`),
    ).toEqual([
      { moneda: "BOB", valor_ars: "192.307692" },
      { moneda: "USD", valor_ars: "1338.461538" },
    ]);

    const tablas = await filas<{ table_name: string }>(
      db,
      sql`select table_name from information_schema.tables where table_name in ('area', 'tipo_cambio')`,
    );
    expect(tablas).toEqual([]);
    const columnas = await filas(
      db,
      sql`select column_name from information_schema.columns where table_name = 'rubro' and column_name = 'dias'`,
    );
    expect(columnas).toEqual([]);
  });

  it("sin tipo de cambio del ARS no carga tipos (se piden en el evento)", async () => {
    const db = await baseEn0006();
    await cargarDatos(db, { usd: "6.96" });
    await migrate(db, { migrationsFolder: migracionesHasta(7) });
    expect(await filas(db, sql`select * from evento_tipo_cambio`)).toEqual([]);
  });
});
