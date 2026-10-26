import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Campanita } from "@/components/campanita";
import { LogoRs } from "@/components/marca";
import { cn } from "@/lib/utils";

/**
 * Encabezado de cada pantalla: volver, título, bajada y acciones con la campanita.
 * En el celular las acciones suben a la fila de arriba (al lado de volver o del logo).
 */
export function Encabezado({
  titulo,
  bajada,
  antetitulo,
  volver,
  acciones,
  children,
}: {
  titulo: string;
  bajada?: React.ReactNode;
  antetitulo?: string;
  /** `soloCelular`: en la computadora el menú lateral ya lleva ahí (p. ej. volver a "Más"). */
  volver?: { href: string; texto: string; soloCelular?: boolean };
  acciones?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6 grid grid-cols-[1fr_auto] items-center gap-x-4 [grid-template-areas:'nav_acc''tit_tit'] md:mb-8 md:items-end md:[grid-template-areas:'nav_.''tit_acc']">
      <div className="min-h-11 [grid-area:nav] md:min-h-0">
        {volver ? (
          <Link
            href={volver.href}
            className={cn(
              "-ml-1 inline-flex h-11 items-center gap-1 text-[0.9375rem] text-foreground hover:text-muted-foreground md:h-auto md:text-sm md:text-muted-foreground md:hover:text-foreground",
              volver.soloCelular && "md:hidden",
            )}
          >
            <ChevronLeft className="size-5 md:size-4" />
            {volver.texto}
          </Link>
        ) : (
          <Link href="/" className="flex h-11 items-center md:hidden" aria-label="Tablero">
            <LogoRs className="h-8" />
          </Link>
        )}
      </div>
      <div className="mt-3 min-w-0 [grid-area:tit] md:mt-1">
        {antetitulo && <p className="mb-1 text-sm text-tinta-3 first-letter:uppercase">{antetitulo}</p>}
        <h1 className="text-[2rem] leading-[1.1] font-bold tracking-[-0.03em] text-balance md:text-[2.375rem]">
          {titulo}
        </h1>
        {bajada && <div className="mt-1.5 text-[0.9375rem] text-muted-foreground">{bajada}</div>}
        {children}
      </div>
      <div className="flex items-center gap-2 [grid-area:acc] md:gap-3">
        <Campanita />
        {acciones}
      </div>
    </header>
  );
}
