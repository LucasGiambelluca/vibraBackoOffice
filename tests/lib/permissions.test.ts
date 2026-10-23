import { describe, expect, it } from "vitest";
import { ErrorNegocio } from "@/lib/acciones";
import { can, ErrorPermiso, esRol, exigir, type Accion } from "@/lib/permissions";

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

describe("exigir", () => {
  it("lanza ErrorPermiso (un ErrorNegocio) si el rol no tiene permiso", () => {
    expect(() => exigir({ id: "1", role: "editor" }, "configurar")).toThrow(ErrorPermiso);
    expect(new ErrorPermiso()).toBeInstanceOf(ErrorNegocio);
  });

  it("no hace nada si tiene permiso", () => {
    expect(() => exigir({ id: "1", role: "admin" }, "configurar")).not.toThrow();
  });
});
