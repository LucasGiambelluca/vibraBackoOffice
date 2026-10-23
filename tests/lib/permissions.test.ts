import { describe, expect, it } from "vitest";
import { can, esRol, type Accion } from "@/lib/permissions";

const TODAS: Accion[] = ["ver", "editar", "aprobar", "borrar", "configurar"];

describe("can", () => {
  it("admin puede todo", () => {
    for (const accion of TODAS) expect(can("admin", accion)).toBe(true);
  });

  it("editor solo ve y edita", () => {
    expect(can("editor", "ver")).toBe(true);
    expect(can("editor", "editar")).toBe(true);
    expect(can("editor", "aprobar")).toBe(false);
    expect(can("editor", "borrar")).toBe(false);
    expect(can("editor", "configurar")).toBe(false);
  });

  it("rol desconocido no puede nada", () => {
    for (const accion of TODAS) expect(can("invitado", accion)).toBe(false);
  });
});

describe("esRol", () => {
  it("reconoce solo admin y editor", () => {
    expect(esRol("admin")).toBe(true);
    expect(esRol("editor")).toBe(true);
    expect(esRol("Admin")).toBe(false);
    expect(esRol("")).toBe(false);
  });
});
