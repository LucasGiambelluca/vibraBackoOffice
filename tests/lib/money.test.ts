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

  it("redondea el medio centavo hacia arriba", () => {
    // 75 × 2 × 0.7203 = 108.045
    expect(totalCotizacion({ precioDia: 75, descuento2Dias: 27.97, dias: 2 })).toBe(108.05);
    // 992.5 × 2 × 0.243 = 482.355
    expect(totalCotizacion({ precioDia: 992.5, descuento2Dias: 75.7, dias: 2 })).toBe(482.36);
  });

  it("total + ahorro es exactamente 2 × precio", () => {
    // 135640.10 × 0.95 = 128858.095 → 128858.10; el ahorro es lo que falta para 135640.10
    const precio = { precioDia: 67820.05, descuento2Dias: 5, dias: 2 };
    expect(totalCotizacion(precio)).toBe(128858.1);
    expect(ahorroCotizacion(precio)).toBe(6782);
  });

  it("total + ahorro = 2 × precio en centavos para muchos precios", () => {
    // Generador congruencial: determinístico y sin dependencias.
    let semilla = 12345;
    const azar = (max: number) => {
      semilla = (semilla * 1103515245 + 12345) % 2 ** 31;
      return semilla % max;
    };
    for (let i = 0; i < 500; i++) {
      // Mitad con descuentos múltiplos de 5, que suelen caer en medio centavo.
      const descuento2Dias = i % 2 ? azar(10001) / 100 : azar(21) * 5;
      const precio = { precioDia: (azar(10 ** 9) + 1) / 100, descuento2Dias, dias: 2 };
      const total = Math.round(totalCotizacion(precio) * 100);
      const ahorro = Math.round(ahorroCotizacion(precio) * 100);
      expect(total + ahorro, JSON.stringify(precio)).toBe(Math.round(precio.precioDia * 100) * 2);
    }
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

  it("redondea el medio centavo hacia arriba", () => {
    // 1024.85 × 0.5 = 512.425; 1044.87 / 6.96 = 150.125
    expect(aBob(1024.85, "USD", { USD: 0.5 })).toBe(512.43);
    expect(desdeBob(1044.87, "USD", tipos)).toBe(150.13);
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
