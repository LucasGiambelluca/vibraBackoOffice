import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { usuarioActual } from "@/lib/session";
import { obtenerTarea } from "@/lib/tareas";

/** Link corto a una tarea (lo usan los emails y la campanita): lleva a la tarea dentro de su evento. */
export default async function TareaPage({ params }: PageProps<"/tareas/[tareaId]">) {
  await usuarioActual();
  const { tareaId } = await params;
  const tarea = await obtenerTarea(db, tareaId);
  if (!tarea) notFound();
  redirect(`/eventos/${tarea.eventoId}/tareas/${tareaId}`);
}
