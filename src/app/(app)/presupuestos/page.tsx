import { redirect } from "next/navigation";
import { eventoParaAbrir } from "@/lib/evento-actual";
import { usuarioActual } from "@/lib/session";

/** "Presupuestos" del menú: el presupuesto del último evento abierto. */
export default async function PresupuestosPage() {
  await usuarioActual();
  const id = await eventoParaAbrir();
  redirect(id ? `/eventos/${id}` : "/eventos");
}
