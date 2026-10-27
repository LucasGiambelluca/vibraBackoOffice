import Image from "next/image";
import { cn } from "@/lib/utils";
import { conBase } from "@/lib/base-path";

/** Logo de RS Group: blanco sobre negro, negro sobre claro. */
export function LogoRs({ claro = false, className }: { claro?: boolean; className?: string }) {
  return (
    <Image
      src={conBase(claro ? "/marca/rsgroup-blanco.png" : "/marca/rsgroup-negro.png")}
      alt="RS Group"
      width={752}
      height={504}
      priority
      className={cn("h-9 w-auto", className)}
    />
  );
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes.at(-1)![0] : "")).toUpperCase();
}

export function Avatar({ nombre, className }: { nombre: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full bg-marca font-display text-sm font-bold text-black",
        className,
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}
