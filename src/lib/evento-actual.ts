import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/db";
import { COOKIE_EVENTO } from "@/lib/evento-cookie";
import { listarEventos } from "@/lib/eventos";

/** Todos los eventos (activos primero), una sola consulta por request. */
export const eventosDelRequest = cache(() => listarEventos(db));

/** El último evento abierto; si no hay (o ya no existe), el activo más reciente. */
export async function eventoParaAbrir(): Promise<string | null> {
  const [eventos, galletas] = await Promise.all([eventosDelRequest(), cookies()]);
  const recordado = galletas.get(COOKIE_EVENTO)?.value;
  return eventos.find((e) => e.id === recordado)?.id ?? eventos[0]?.id ?? null;
}
