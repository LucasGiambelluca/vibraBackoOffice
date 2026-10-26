import { redirect } from "next/navigation";
import { eventoParaAbrir } from "@/lib/evento-actual";
import { usuarioActual } from "@/lib/session";

/** "Tareas" del menú: las del último evento abierto (`?nueva=1` abre la hoja de alta). */
export default async function TareasPage({ searchParams }: PageProps<"/tareas">) {
  await usuarioActual();
  const [id, { nueva }] = await Promise.all([eventoParaAbrir(), searchParams]);
  if (!id) redirect("/eventos");
  redirect(`/eventos/${id}/tareas${nueva === "1" ? "?nueva=1" : ""}`);
}
