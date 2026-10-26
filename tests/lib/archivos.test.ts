import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { borrarArchivo, listarArchivos, listarArchivosEvento, subirArchivo, type Duenio } from "@/lib/archivos";
import { guardarArchivo } from "@/lib/archivos-disco";
import { borrarCotizacion } from "@/lib/cotizaciones";
import { quitarRubro } from "@/lib/evento-rubros";
import { cerrarEvento } from "@/lib/eventos";
import type { Actor } from "@/lib/permissions";
import { borrarTarea } from "@/lib/tareas";
import { crearActores } from "../helpers/actores";
import { crearDbPrueba } from "../helpers/db";
import {
  foto,
  idEventoRubro,
  idVibra,
  nuevaCotizacion,
  nuevoProveedor,
  pdf,
  usarUploadsTemporal,
} from "../helpers/presupuestos";
import { nuevaTarea } from "../helpers/tareas";

let db: Db;
let dir: string;
let admin: Actor;
let editor: Actor;
let vibra: string;

beforeEach(async () => {
  dir = usarUploadsTemporal();
  db = await crearDbPrueba();
  ({ admin, editor } = await crearActores(db));
  vibra = await idVibra(db);
});

async function subir(d: Duenio, actor: Actor | null = editor, archivo?: File) {
  return subirArchivo(db, d, await guardarArchivo(archivo ?? pdf()), "presupuesto.pdf", actor?.id ?? null);
}

describe("subirArchivo y listarArchivos", () => {
  it("cada archivo queda en su dueño y en el evento", async () => {
    const rubro = await idEventoRubro(db);
    const cotizacion = await nuevaCotizacion(db, rubro, await nuevoProveedor(db));
    const tarea = await nuevaTarea(db);

    await subir({ tipo: "evento", id: vibra }, editor, await foto());
    await subir({ tipo: "rubro", id: rubro });
    await subir({ tipo: "cotizacion", id: cotizacion });
    await subir({ tipo: "tarea", id: tarea });

    const delEvento = await listarArchivos(db, { tipo: "evento", id: vibra });
    expect(delEvento).toMatchObject([{ tipo: "imagen", conMiniatura: true, subidor: "editor@vibra.bo", donde: null }]);
    expect(await listarArchivos(db, { tipo: "rubro", id: rubro })).toMatchObject([{ tipo: "pdf", conMiniatura: false }]);

    const todos = await listarArchivosEvento(db, vibra);
    expect(todos.map((a) => a.donde)).toEqual([
      null,
      { texto: "Rubro Sonido", href: `/eventos/${vibra}/rubros/${rubro}` },
      { texto: "Cotización de Sonido Andino · Sonido", href: `/eventos/${vibra}/rubros/${rubro}/${cotizacion}` },
      { texto: "Tarea Contratar vallas", href: `/eventos/${vibra}/tareas/${tarea}` },
    ]);
  });

  it("falla si el dueño no existe", async () => {
    await expect(subir({ tipo: "tarea", id: "no-existe" })).rejects.toThrow("No existe dónde subir el archivo");
    await expect(subir({ tipo: "evento", id: "no-existe" })).rejects.toThrow("El evento no existe");
  });

  it("la base no deja un archivo con dos dueños", async () => {
    const rubro = await idEventoRubro(db);
    const tarea = await nuevaTarea(db);
    await expect(
      db.execute(sql`insert into archivo (id, evento_id, evento_rubro_id, tarea_id, tipo, nombre, guardado)
        values ('a1', ${vibra}, ${rubro}, ${tarea}, 'pdf', 'x.pdf', 'x.pdf')`),
    ).rejects.toThrow();
  });
});

describe("borrarArchivo", () => {
  it("lo borra quien lo subió (fila y disco)", async () => {
    const id = await subir({ tipo: "evento", id: vibra }, editor, await foto());
    expect(readdirSync(dir)).toHaveLength(2);
    await borrarArchivo(db, editor, id);
    expect(await listarArchivos(db, { tipo: "evento", id: vibra })).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("un editor no borra lo que subió otro; el admin sí", async () => {
    const id = await subir({ tipo: "evento", id: vibra }, null);
    await expect(borrarArchivo(db, editor, id)).rejects.toThrow("No tenés permiso para hacer esto");
    await borrarArchivo(db, admin, id);
    await expect(borrarArchivo(db, admin, id)).rejects.toThrow("El archivo no existe");
  });
});

describe("evento cerrado", () => {
  it("no se sube ni se borra", async () => {
    const id = await subir({ tipo: "evento", id: vibra });
    await cerrarEvento(db, vibra, admin.id);
    await expect(subir({ tipo: "evento", id: vibra })).rejects.toThrow("El evento está cerrado: solo lectura");
    await expect(subir({ tipo: "rubro", id: await idEventoRubro(db) })).rejects.toThrow(
      "El evento está cerrado: solo lectura",
    );
    await expect(borrarArchivo(db, admin, id)).rejects.toThrow("El evento está cerrado: solo lectura");
    expect(await listarArchivos(db, { tipo: "evento", id: vibra })).toHaveLength(1);
  });
});

describe("al borrar el dueño", () => {
  it("se borran sus archivos del disco (cotización, rubro del evento y tarea)", async () => {
    const rubro = await idEventoRubro(db, "Luces");
    const cotizacion = await nuevaCotizacion(db, await idEventoRubro(db), await nuevoProveedor(db));
    const tarea = await nuevaTarea(db);
    await subir({ tipo: "rubro", id: rubro });
    await subir({ tipo: "cotizacion", id: cotizacion }, editor, await foto());
    await subir({ tipo: "tarea", id: tarea });
    expect(readdirSync(dir)).toHaveLength(4);

    await borrarCotizacion(db, cotizacion);
    await quitarRubro(db, rubro);
    await borrarTarea(db, tarea);

    expect(readdirSync(dir)).toEqual([]);
    expect(await listarArchivosEvento(db, vibra)).toEqual([]);
  });

  it("los archivos de otros dueños no se tocan", async () => {
    const tarea = await nuevaTarea(db);
    const id = await subir({ tipo: "evento", id: vibra });
    await subir({ tipo: "tarea", id: tarea });
    await borrarTarea(db, tarea);
    const [queda] = await listarArchivosEvento(db, vibra);
    expect(queda.id).toBe(id);
    expect(readdirSync(dir)).toHaveLength(1);
    expect(existsSync(path.join(dir, readdirSync(dir)[0]))).toBe(true);
  });
});
