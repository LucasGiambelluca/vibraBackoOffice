import { Lock } from "lucide-react";
import Link from "next/link";
import { RecordarEvento } from "@/components/recordar-evento";
import { can } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";
import { cargarEvento } from "./evento";

export default async function EventoLayout({ children, params }: LayoutProps<"/eventos/[eventoId]">) {
  const usuario = await usuarioActual();
  const { eventoId } = await params;
  const evento = await cargarEvento(eventoId);

  return (
    <>
      <RecordarEvento id={eventoId} />
      {evento.cerrado && (
        <p className="mb-5 flex items-center gap-3 rounded-2xl bg-[#0a0a0a] px-4 py-3 text-sm text-white md:px-5">
          <Lock className="size-4 shrink-0 text-marca" />
          <span>
            <strong className="font-semibold">Evento cerrado · solo lectura.</strong>{" "}
            {can(usuario.role, "configurar") ? (
              <>
                Para cambiar algo, reabrilo en{" "}
                <Link href={`/eventos/${eventoId}/ajustes`} className="underline">
                  Ajustes
                </Link>
                .
              </>
            ) : (
              "Solo un admin lo puede reabrir."
            )}
          </span>
        </p>
      )}
      {children}
    </>
  );
}
