import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { obtenerEvento } from "@/lib/eventos";

/** El evento de la URL (una consulta por request, la comparten el layout y la página). */
export const cargarEvento = cache(async (id: string) => {
  const evento = await obtenerEvento(db, id);
  if (!evento) notFound();
  return { ...evento, cerrado: evento.estado === "cerrado" };
});
