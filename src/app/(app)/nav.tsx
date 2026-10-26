"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, LogoRs } from "@/components/marca";
import { SelectorEvento } from "@/components/selector-evento";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { EN_MAS, LINKS, LINKS_ADMIN, PESTANAS, type Destino } from "./destinos";

type EventoNav = { id: string; nombre: string; estado: string };

/** El evento de la URL (`/eventos/<id>/…`), si hay uno. */
function eventoEnUrl(pathname: string): string | null {
  const id = pathname.match(/^\/eventos\/([^/]+)/)?.[1];
  return id && id !== "nuevo" ? id : null;
}

/** Presupuestos y Tareas apuntan al evento que se está viendo, o al último abierto. */
function resolver(link: Destino, pathname: string, recordado: string | null): { href: string; actual: boolean } {
  const enUrl = eventoEnUrl(pathname);
  const evento = enUrl ?? recordado;
  const seccion = enUrl ? pathname.split("/")[3] : undefined;
  const listaDeEventos = pathname === "/eventos" || pathname === "/eventos/nuevo";
  switch (link.href) {
    case "/":
      return { href: "/", actual: pathname === "/" };
    case "/eventos":
      return { href: link.href, actual: listaDeEventos || seccion === "ajustes" };
    case "/presupuestos":
      return {
        href: evento ? `/eventos/${evento}` : link.href,
        actual: !!enUrl && seccion !== "tareas" && seccion !== "ajustes",
      };
    case "/tareas":
      return { href: evento ? `/eventos/${evento}/tareas` : link.href, actual: seccion === "tareas" };
    case "/mas":
      return { href: link.href, actual: listaDeEventos || EN_MAS.some((r) => pathname.startsWith(r)) };
    default:
      return { href: link.href, actual: pathname.startsWith(link.href) };
  }
}

export function useSalir() {
  const router = useRouter();
  return async function salir() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  };
}

function ItemLateral({
  link,
  pathname,
  recordado,
}: {
  link: Destino;
  pathname: string;
  recordado: string | null;
}) {
  const Icono = link.icono;
  const { href, actual } = resolver(link, pathname, recordado);
  return (
    <Link
      href={href}
      aria-current={actual ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] text-white/65 transition-colors hover:bg-white/5 hover:text-white",
        actual && "bg-white/10 font-semibold text-white",
      )}
    >
      <Icono className="size-[1.125rem]" strokeWidth={1.75} />
      {link.label}
    </Link>
  );
}

export function Nav({
  nombre,
  rol,
  esAdmin,
  eventos,
  recordado,
}: {
  nombre: string;
  rol: string;
  esAdmin: boolean;
  eventos: EventoNav[];
  recordado: string | null;
}) {
  const pathname = usePathname();
  const salir = useSalir();
  const actual = eventoEnUrl(pathname) ?? recordado;

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col bg-[#0a0a0a] px-4 py-6 text-white md:sticky md:top-0 md:flex md:h-dvh">
        <Link href="/" className="mb-6 flex items-center gap-3 px-2">
          <LogoRs claro className="h-8" />
          <span className="leading-tight">
            <span className="block font-display text-[0.9375rem] font-bold">RS Group</span>
            <span className="block text-xs text-white/55">Back office de eventos</span>
          </span>
        </Link>
        {eventos.length > 0 && <SelectorEvento eventos={eventos} actual={actual} oscuro className="mb-5" />}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Principal">
          {LINKS.map((link) => (
            <ItemLateral key={link.href} link={link} pathname={pathname} recordado={recordado} />
          ))}
          {esAdmin && (
            <>
              <p className="mt-6 mb-2 px-3 text-[0.6875rem] font-semibold tracking-[0.1em] text-white/40 uppercase">
                Administración
              </p>
              {LINKS_ADMIN.map((link) => (
                <ItemLateral key={link.href} link={link} pathname={pathname} recordado={recordado} />
              ))}
            </>
          )}
        </nav>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3">
          <Avatar nombre={nombre} className="size-9 text-xs" />
          <Link href="/cuenta" className="min-w-0 flex-1 leading-tight hover:opacity-80">
            <span className="block truncate text-sm font-semibold">{nombre}</span>
            <span className="block text-xs text-white/55">{rol === "admin" ? "Admin" : "Editor"} · Mi cuenta</span>
          </Link>
          <button
            type="button"
            onClick={salir}
            aria-label="Salir"
            title="Salir"
            className="grid size-9 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-[1.125rem]" strokeWidth={1.75} />
          </button>
        </div>
      </aside>

      <nav
        aria-label="Principal"
        className="material fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-4 gap-1 rounded-[1.75rem] border border-white/60 bg-white/75 p-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.12)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
      >
        {PESTANAS.map((link) => {
          const Icono = link.icono;
          const { href, actual } = resolver(link, pathname, recordado);
          return (
            <Link
              key={link.href}
              href={href}
              aria-current={actual ? "page" : undefined}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-0.5 rounded-[1.375rem] text-[0.6875rem] font-medium text-muted-foreground transition-[background-color,transform] active:scale-95",
                actual && "bg-[#0a0a0a] font-semibold text-white",
              )}
            >
              <Icono className="size-5" strokeWidth={1.75} />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
