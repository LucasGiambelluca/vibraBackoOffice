import { describe, expect, it } from "vitest";
import {
  aBob,
  ahorroCotizacion,
  desdeBob,
  esMoneda,
  formatearMonto,
  totalCotizacion,
  totalEvento,
} from "@/lib/money";

describe("totalCotizacion y ahorroCotizacion", () => {
  it("1 día: el precio por día, sin ahorro (ignora el descuento)", () => {
    const precio = { precioDia: 1000, descuento2Dias: 10, dias: 1 };
    expect(totalCotizacion(precio)).toBe(1000);
    expect(ahorroCotizacion(precio)).toBe(0);
  });

  it("2 días: precio × 2 menos el descuento", () => {
    const precio = { precioDia: 1000, descuento2Dias: 10, dias: 2 };
    expect(totalCotizacion(precio)).toBe(1800);
    expect(ahorroCotizacion(precio)).toBe(200);
  });

  it("descuento 0 y 100", () => {
    expect(totalCotizacion({ precioDia: 1000, descuento2Dias: 0, dias: 2 })).toBe(2000);
    expect(totalCotizacion({ precioDia: 1000, descuento2Dias: 100, dias: 2 })).toBe(0);
    expect(ahorroCotizacion({ precioDia: 1000, descuento2Dias: 100, dias: 2 })).toBe(2000);
  });

  it("redondea a centavos", () => {
    // 33.33 × 2 × 0.85 = 56.661
    expect(totalCotizacion({ precioDia: 33.33, descuento2Dias: 15, dias: 2 })).toBe(56.66);
  });
});

describe("conversión", () => {
  const tipos = { USD: 6.96 };

  it("BOB vale 1 y no necesita tipo de cambio", () => {
    expect(aBob(150, "BOB", {})).toBe(150);
    expect(desdeBob(150, "BOB", {})).toBe(150);
  });

  it("convierte con el tipo de cambio", () => {
    expect(aBob(100, "USD", tipos)).toBe(696);
    expect(desdeBob(696, "USD", tipos)).toBe(100);
  });

  it("sin tipo de cambio devuelve null", () => {
    expect(aBob(100, "ARS", tipos)).toBeNull();
    expect(desdeBob(100, "ARS", tipos)).toBeNull();
  });
});

describe("totalEvento", () => {
  it("suma en BOB", () => {
    const montos = [
      { monto: 1000, moneda: "BOB" as const },
      { monto: 100, moneda: "USD" as const },
    ];
    expect(totalEvento(montos, { USD: 6.96 })).toEqual({ bob: 1696, faltan: [] });
  });

  it("sin montos da 0", () => {
    expect(totalEvento([], {})).toEqual({ bob: 0, faltan: [] });
  });

  it("si falta un tipo de cambio no da número y avisa cuáles faltan", () => {
    const montos = [
      { monto: 1, moneda: "ARS" as const },
      { monto: 1, moneda: "USD" as const },
      { monto: 2, moneda: "ARS" as const },
    ];
    expect(totalEvento(montos, {})).toEqual({ bob: null, faltan: ["ARS", "USD"] });
  });

  it("no arrastra error de punto flotante", () => {
    const montos = [
      { monto: 0.1, moneda: "BOB" as const },
      { monto: 0.2, moneda: "BOB" as const },
    ];
    expect(totalEvento(montos, {}).bob).toBe(0.3);
  });
});

describe("formato", () => {
  it("formatea con separadores de Bolivia", () => {
    expect(formatearMonto(1234.5, "USD")).toBe("USD 1.234,50");
  });

  it("esMoneda", () => {
    expect(esMoneda("ARS")).toBe(true);
    expect(esMoneda("EUR")).toBe(false);
  });
});
