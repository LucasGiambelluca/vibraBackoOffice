import { describe, expect, it } from "vitest";
import {
  cuandoVence,
  desdeHoraLaPaz,
  fechaLarga,
  formatearFecha,
  hoyEnLaPaz,
  mensajeRecordatorio,
  nueveDeLaPaz,
  recordatoriosAutomaticos,
  siguienteNueve,
  sumarDias,
} from "@/lib/reminders";

// 1/3/2027 08:00 en La Paz.
const AHORA = new Date("2027-03-01T12:00:00Z");
const iso = (d: Date) => d.toISOString();

describe("fechas en La Paz", () => {
  it("09:00 de La Paz es 13:00 UTC", () => {
    expect(iso(nueveDeLaPaz("2027-03-10"))).toBe("2027-03-10T13:00:00.000Z");
  });

  it("hoy en La Paz puede ser ayer en UTC", () => {
    expect(hoyEnLaPaz(new Date("2027-03-11T02:00:00Z"))).toBe("2027-03-10");
    expect(hoyEnLaPaz(AHORA)).toBe("2027-03-01");
  });

  it("sumarDias cruza meses y años", () => {
    expect(sumarDias("2027-03-01", -3)).toBe("2027-02-26");
    expect(sumarDias("2027-12-31", 1)).toBe("2028-01-01");
  });

  it("siguienteNueve: hoy si todavía no son las 9, si no mañana", () => {
    expect(iso(siguienteNueve(AHORA))).toBe("2027-03-01T13:00:00.000Z");
    expect(iso(siguienteNueve(new Date("2027-03-01T13:00:00Z")))).toBe("2027-03-02T13:00:00.000Z");
  });

  it("desdeHoraLaPaz interpreta un datetime-local como hora de La Paz", () => {
    expect(iso(desdeHoraLaPaz("2027-03-10T15:30"))).toBe("2027-03-10T19:30:00.000Z");
  });

  it("formatearFecha", () => {
    expect(formatearFecha("2027-03-10")).toBe("10/03/2027");
  });
});

describe("recordatoriosAutomaticos", () => {
  const resumen = (fecha: string, ahora = AHORA) =>
    recordatoriosAutomaticos(fecha, ahora).map((r) => [r.tipo, iso(r.fechaHora)]);

  it("fecha lejana: 3 días antes y el día del vencimiento, a las 9", () => {
    expect(resumen("2027-03-10")).toEqual([
      ["3_dias_antes", "2027-03-07T13:00:00.000Z"],
      ["dia_vencimiento", "2027-03-10T13:00:00.000Z"],
    ]);
  });

  it("no crea los que ya pasaron", () => {
    expect(resumen("2027-03-03")).toEqual([["dia_vencimiento", "2027-03-03T13:00:00.000Z"]]);
  });

  it("vence hoy antes de las 9: solo el del día", () => {
    expect(resumen("2027-03-01")).toEqual([["dia_vencimiento", "2027-03-01T13:00:00.000Z"]]);
  });

  it("vence hoy después de las 9: vencida desde mañana", () => {
    expect(resumen("2027-03-01", new Date("2027-03-01T14:00:00Z"))).toEqual([
      ["vencida_diario", "2027-03-02T13:00:00.000Z"],
    ]);
  });

  it("ya vencida: el próximo 09:00", () => {
    expect(resumen("2027-02-20")).toEqual([["vencida_diario", "2027-03-01T13:00:00.000Z"]]);
  });
});

describe("mensajeRecordatorio", () => {
  it("un texto por tipo", () => {
    expect(mensajeRecordatorio("3_dias_antes", "Vallas", "2027-03-10")).toBe('"Vallas" vence en 3 días (10/03/2027)');
    expect(mensajeRecordatorio("dia_vencimiento", "Vallas", "2027-03-10")).toBe('"Vallas" vence hoy');
    expect(mensajeRecordatorio("vencida_diario", "Vallas", "2027-03-10")).toBe(
      '"Vallas" está vencida desde el 10/03/2027',
    );
    expect(mensajeRecordatorio("manual", "Vallas", null)).toBe('Recordatorio: "Vallas"');
  });
});

describe("fechas para mostrar", () => {
  it("cuandoVence dice vencida, hoy, mañana o el día de la semana", () => {
    expect(cuandoVence("2027-02-27", "2027-03-01")).toBe("Vencida 27/02");
    expect(cuandoVence("2027-03-01", "2027-03-01")).toBe("Vence hoy");
    expect(cuandoVence("2027-03-02", "2027-03-01")).toBe("Vence mañana");
    expect(cuandoVence("2027-03-04", "2027-03-01")).toBe("Jue 04/03");
  });

  it("fechaLarga usa el día de La Paz", () => {
    // 02:00 UTC del 2/3 todavía es 1/3 en La Paz.
    expect(fechaLarga(new Date("2027-03-02T02:00:00Z"))).toBe("lunes 1 de marzo");
  });
});
