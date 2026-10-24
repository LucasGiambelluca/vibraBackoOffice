import { describe, expect, it } from "vitest";
import { decimal, textoOpcional } from "@/lib/validacion";

describe("decimal", () => {
  const precio = decimal("Precio inválido", 2);

  it("acepta punto o coma decimal y devuelve string con punto", () => {
    expect(precio.parse("1500")).toBe("1500");
    expect(precio.parse(" 1500,5 ")).toBe("1500.5");
    expect(precio.parse("0.25")).toBe("0.25");
  });

  it("rechaza separadores de miles, negativos, texto y decimales de más", () => {
    for (const valor of ["1.500,50", "-3", "abc", "1.234", ""]) {
      expect(precio.safeParse(valor).success).toBe(false);
    }
  });
});

describe("textoOpcional", () => {
  const texto = textoOpcional(10);

  it("vacío o ausente es null; el resto se recorta", () => {
    expect(texto.parse(undefined)).toBeNull();
    expect(texto.parse("   ")).toBeNull();
    expect(texto.parse(" hola ")).toBe("hola");
  });

  it("respeta el máximo", () => {
    expect(texto.safeParse("x".repeat(11)).success).toBe(false);
  });
});
