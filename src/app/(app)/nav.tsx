"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, LogoRs } from "@/components/marca";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { EN_MAS, LINKS, LINKS_ADMIN, PESTANAS, type Destino } from "./destinos";

function activo(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/mas") return EN_MAS.some((r) => pathname.startsWith(r));
  return pathname.startsWith(href);
}

export function useSalir() {
  const router = useRouter();
  return async function salir() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  };
}

function ItemLateral({ link, pathname }: { link: Destino; pathname: string }) {
  const Icono = link.icono;
  const actual = activo(pathname, link.href);
  return (
    <Link
      href={link.href}
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

export function Nav({ nombre, rol, esAdmin }: { nombre: string; rol: string; esAdmin: boolean }) {
  const pathname = usePathname();
  const salir = useSalir();

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col bg-[#0a0a0a] px-4 py-6 text-white md:sticky md:top-0 md:flex md:h-dvh">
        <Link href="/" className="mb-8 flex items-center gap-3 px-2">
          <LogoRs claro className="h-8" />
          <span className="leading-tight">
            <span className="block font-display text-[0.9375rem] font-bold">Vibra 2027</span>
            <span className="block text-xs text-white/55">Back office</span>
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Principal">
          {LINKS.map((link) => (
            <ItemLateral key={link.href} link={link} pathname={pathname} />
          ))}
          {esAdmin && (
            <>
              <p className="mt-6 mb-2 px-3 text-[0.6875rem] font-semibold tracking-[0.1em] text-white/40 uppercase">
                Administración
              </p>
              {LINKS_ADMIN.map((link) => (
                <ItemLateral key={link.href} link={link} pathname={pathname} />
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
          const actual = activo(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
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
