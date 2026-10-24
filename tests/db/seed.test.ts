import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { area, rubro } from "@/db/schema";
import { crearDbPrueba } from "../helpers/db";

describe("migraciones", () => {
  it("cargan las 6 áreas y los 7 rubros iniciales", async () => {
    const db = await crearDbPrueba();
    const areas = await db.select().from(area).orderBy(asc(area.id));
    expect(areas.map((a) => a.nombre)).toEqual([
      "Marketing y Audiovisual",
      "Técnica, Escenario y Backline",
      "Logística, Hospitalidad y RRHH",
      "Infraestructura y Predio",
      "Seguridad y Prevención",
      "Gestión Presupuestaria",
    ]);

    const rubros = await db.select().from(rubro);
    expect(rubros).toHaveLength(7);
    const [sonido] = await db.select().from(rubro).where(eq(rubro.nombre, "Sonido"));
    expect(sonido).toMatchObject({ areaId: 2, dias: 2 });
  });
});
