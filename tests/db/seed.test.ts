import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { evento, eventoRubro, grupo, rubro } from "@/db/schema";
import { crearDbPrueba } from "../helpers/db";

describe("migraciones", () => {
  it("cargan los 6 grupos, los 7 rubros y el evento Vibra Bolivia 2027 con todos", async () => {
    const db = await crearDbPrueba();
    const grupos = await db.select().from(grupo).orderBy(asc(grupo.orden));
    expect(grupos.map((g) => g.nombre)).toEqual([
      "Marketing y Audiovisual",
      "Técnica, Escenario y Backline",
      "Logística, Hospitalidad y RRHH",
      "Infraestructura y Predio",
      "Seguridad y Prevención",
      "Gestión Presupuestaria",
    ]);

    expect(await db.select().from(rubro)).toHaveLength(7);
    const [sonido] = await db.select().from(rubro).where(eq(rubro.nombre, "Sonido"));
    expect(sonido).toMatchObject({ grupoId: 2 });

    const [vibra] = await db.select().from(evento);
    expect(vibra).toMatchObject({ nombre: "Vibra Bolivia 2027", estado: "activo" });
    const rubrosVibra = await db.select().from(eventoRubro).where(eq(eventoRubro.eventoId, vibra.id));
    expect(rubrosVibra).toHaveLength(7);
    expect(rubrosVibra.every((r) => r.dias === 2)).toBe(true);
  });
});
