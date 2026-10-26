// Funciones puras de fechas de recordatorios. Sin DB ni Next.

export const ZONA_EVENTO = "America/La_Paz";
// La Paz es UTC−4 todo el año (Bolivia no tiene horario de verano).
const DESFASE_HORAS = 4;
const HORA_RECORDATORIO = 9;
const HORA_MS = 3_600_000;

export const TIPOS_AUTOMATICOS = ["3_dias_antes", "dia_vencimiento", "vencida_diario"] as const;
export type TipoAutomatico = (typeof TIPOS_AUTOMATICOS)[number];

export type RecordatorioPlanificado = { tipo: TipoAutomatico; fechaHora: Date };

/** 09:00 en La Paz del día `fecha` ("YYYY-MM-DD"), como instante. */
export function nueveDeLaPaz(fecha: string): Date {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia, HORA_RECORDATORIO + DESFASE_HORAS));
}

/** Día calendario en La Paz ("YYYY-MM-DD") del instante `ahora`. */
export function hoyEnLaPaz(ahora: Date): string {
  return new Date(ahora.getTime() - DESFASE_HORAS * HORA_MS).toISOString().slice(0, 10);
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** El próximo 09:00 de La Paz estrictamente posterior a `ahora`. */
export function siguienteNueve(ahora: Date): Date {
  const hoy = hoyEnLaPaz(ahora);
  const nueveHoy = nueveDeLaPaz(hoy);
  return nueveHoy > ahora ? nueveHoy : nueveDeLaPaz(sumarDias(hoy, 1));
}

/** Valor de un `<input type="datetime-local">` ("YYYY-MM-DDTHH:mm") interpretado como hora de La Paz. */
export function desdeHoraLaPaz(valor: string): Date {
  return new Date(`${valor}:00-0${DESFASE_HORAS}:00`);
}

/**
 * Recordatorios automáticos de una fecha límite: 3 días antes y el día del vencimiento,
 * a las 09:00 de La Paz, salvo los que ya pasaron. Si pasaron los dos, la tarea está
 * (o va a estar) vencida: se planifica el primer recordatorio diario de vencida.
 */
export function recordatoriosAutomaticos(fechaLimite: string, ahora: Date): RecordatorioPlanificado[] {
  const candidatos: RecordatorioPlanificado[] = [
    { tipo: "3_dias_antes", fechaHora: nueveDeLaPaz(sumarDias(fechaLimite, -3)) },
    { tipo: "dia_vencimiento", fechaHora: nueveDeLaPaz(fechaLimite) },
  ];
  const futuros = candidatos.filter((r) => r.fechaHora > ahora);
  if (futuros.length > 0) return futuros;
  return [{ tipo: "vencida_diario", fechaHora: siguienteNueve(ahora) }];
}

export function formatearFecha(fecha: string): string {
  return fecha.split("-").reverse().join("/");
}

const FECHA_HORA = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: ZONA_EVENTO,
});

export function formatearFechaHora(instante: Date): string {
  return FECHA_HORA.format(instante);
}

export function mensajeRecordatorio(
  tipo: TipoAutomatico | "manual",
  titulo: string,
  fechaLimite: string | null,
): string {
  const fecha = fechaLimite ? formatearFecha(fechaLimite) : "";
  switch (tipo) {
    case "3_dias_antes":
      return `"${titulo}" vence en 3 días (${fecha})`;
    case "dia_vencimiento":
      return `"${titulo}" vence hoy`;
    case "vencida_diario":
      return `"${titulo}" está vencida desde el ${fecha}`;
    case "manual":
      return `Recordatorio: "${titulo}"`;
  }
}

const DIA_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "dd/mm" de una fecha "YYYY-MM-DD". */
export function fechaCorta(fecha: string): string {
  return formatearFecha(fecha).slice(0, 5);
}

/** Cuándo vence una tarea, dicho como lo diría una persona: "Vence hoy", "Vence mañana", "Jue 29/10". */
export function cuandoVence(fecha: string, hoy: string): string {
  if (fecha < hoy) return `Vencida ${fechaCorta(fecha)}`;
  if (fecha === hoy) return "Vence hoy";
  if (fecha === sumarDias(hoy, 1)) return "Vence mañana";
  return `${DIA_SEMANA[new Date(`${fecha}T00:00:00Z`).getUTCDay()]} ${fechaCorta(fecha)}`;
}

const FECHA_LARGA = new Intl.DateTimeFormat("es-BO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: ZONA_EVENTO,
});

/** "lunes 26 de octubre" en La Paz. */
export function fechaLarga(instante: Date): string {
  return FECHA_LARGA.format(instante).replace(",", "");
}
