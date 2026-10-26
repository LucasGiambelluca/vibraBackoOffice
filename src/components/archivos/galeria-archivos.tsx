"use client";

import { ChevronLeft, ChevronRight, Download, FileText, Trash, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { borrarArchivoAction } from "@/app/(app)/archivos/actions";
import { BotonAccion } from "@/components/form-accion";
import { cn } from "@/lib/utils";

export type ArchivoVista = {
  id: string;
  tipo: "pdf" | "imagen";
  nombre: string;
  conMiniatura: boolean;
  /** "1,2 MB · Ana · 26/10/26 17:40" */
  detalle: string;
  /** Dónde está, si se muestra fuera de su dueño (pestaña Archivos del evento). */
  donde: { texto: string; href: string } | null;
  borrable: boolean;
};

const url = (id: string, extra = "") => `/api/archivos/${id}${extra}`;

/** Fotos en grilla (abren el visor) y PDF en lista (abren en otra pestaña). */
export function GaleriaArchivos({
  archivos,
  mostrarDonde = false,
  vacio = "Todavía no hay archivos.",
  className,
}: {
  archivos: ArchivoVista[];
  mostrarDonde?: boolean;
  vacio?: string;
  className?: string;
}) {
  const fotos = archivos.filter((a) => a.tipo === "imagen");
  const pdfs = archivos.filter((a) => a.tipo === "pdf");
  const [abierta, setAbierta] = useState<number | null>(null);

  if (archivos.length === 0)
    return <p className={cn("border-t py-6 text-sm text-muted-foreground", className)}>{vacio}</p>;

  return (
    <div className={cn("space-y-5", className)}>
      {fotos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label="Fotos">
          {fotos.map((f, i) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setAbierta(i)}
                className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-muted ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Ver ${f.nombre}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado: no pasa por el optimizador */}
                <img
                  src={url(f.id, f.conMiniatura ? "?min=1" : "")}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-[0.98]"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {pdfs.length > 0 && (
        <ul className="divide-y border-y" aria-label="PDF">
          {pdfs.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <FileText className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <a
                  href={url(p.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate font-semibold hover:underline"
                >
                  {p.nombre}
                </a>
                <span className="block truncate text-xs text-tinta-3">
                  {mostrarDonde && p.donde && (
                    <>
                      <Link href={p.donde.href} className="underline-offset-2 hover:underline">
                        {p.donde.texto}
                      </Link>
                      {" · "}
                    </>
                  )}
                  {p.detalle}
                </span>
              </span>
              {p.borrable && <BorrarArchivo id={p.id} />}
            </li>
          ))}
        </ul>
      )}

      {abierta !== null && (
        <Visor fotos={fotos} inicial={abierta} mostrarDonde={mostrarDonde} onCerrar={() => setAbierta(null)} />
      )}
    </div>
  );
}

function BorrarArchivo({ id }: { id: string }) {
  return (
    <BotonAccion
      accion={borrarArchivoAction}
      campos={{ archivoId: id }}
      texto="Borrar"
      enviando="Borrando…"
      variant="ghost"
      icono={<Trash />}
      confirmar
    />
  );
}

/** Foto a pantalla completa: flechas (o teclado / deslizar) para pasar, Esc para cerrar. */
function Visor({
  fotos,
  inicial,
  mostrarDonde,
  onCerrar,
}: {
  fotos: ArchivoVista[];
  inicial: number;
  mostrarDonde: boolean;
  onCerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [indice, setIndice] = useState(inicial);
  const inicioToque = useRef<number | null>(null);
  // Si se borra la que se estaba viendo, la lista se achica.
  const actual = fotos[Math.min(indice, fotos.length - 1)];
  const hay = fotos.length > 1;
  const mover = (paso: number) => setIndice((i) => (i + paso + fotos.length) % fotos.length);

  useEffect(() => {
    dialogo.current?.showModal();
  }, []);

  if (!actual) return null;

  return (
    <dialog
      ref={dialogo}
      onClose={onCerrar}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") mover(1);
        if (e.key === "ArrowLeft") mover(-1);
      }}
      onPointerDown={(e) => (inicioToque.current = e.clientX)}
      onPointerUp={(e) => {
        const dx = inicioToque.current === null ? 0 : e.clientX - inicioToque.current;
        inicioToque.current = null;
        if (hay && Math.abs(dx) > 50) mover(dx < 0 ? 1 : -1);
      }}
      aria-label={actual.nombre}
      className="m-0 size-full max-h-none max-w-none bg-black p-0 text-white backdrop:bg-black"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-3 py-2 md:px-5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{actual.nombre}</p>
            <p className="truncate text-xs text-white/60">
              {hay && `${Math.min(indice, fotos.length - 1) + 1} de ${fotos.length} · `}
              {mostrarDonde && actual.donde && `${actual.donde.texto} · `}
              {actual.detalle}
            </p>
          </div>
          <a
            href={url(actual.id, "?descargar=1")}
            className="grid size-11 place-items-center rounded-full hover:bg-white/10"
            aria-label="Descargar"
          >
            <Download className="size-5" />
          </a>
          {actual.borrable && (
            <span className="[&_button]:text-white [&_span]:text-white">
              <BorrarArchivo id={actual.id} />
            </span>
          )}
          <button
            type="button"
            onClick={() => dialogo.current?.close()}
            className="grid size-11 place-items-center rounded-full hover:bg-white/10"
            aria-label="Cerrar"
            autoFocus
          >
            <X className="size-6" />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 md:p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado: no pasa por el optimizador */}
          <img
            key={actual.id}
            src={url(actual.id)}
            alt={actual.nombre}
            className="max-h-full max-w-full touch-pan-y object-contain select-none"
            draggable={false}
          />
          {hay && (
            <>
              <button
                type="button"
                onClick={() => mover(-1)}
                className="absolute left-2 grid size-12 place-items-center rounded-full bg-black/40 hover:bg-black/60 max-sm:hidden"
                aria-label="Anterior"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={() => mover(1)}
                className="absolute right-2 grid size-12 place-items-center rounded-full bg-black/40 hover:bg-black/60 max-sm:hidden"
                aria-label="Siguiente"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
