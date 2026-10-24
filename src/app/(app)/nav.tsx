"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Campanita } from "@/components/campanita";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Tablero" },
  { href: "/presupuestos", label: "Presupuestos" },
  { href: "/proveedores", label: "Proveedores" },
  { href: "/tareas", label: "Tareas" },
  { href: "/cuenta", label: "Mi cuenta" },
];

const LINKS_ADMIN = [
  { href: "/configuracion/usuarios", label: "Usuarios" },
  { href: "/configuracion/rubros", label: "Rubros" },
  { href: "/configuracion/tipos-cambio", label: "Tipos de cambio" },
];

function activo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav({ nombre, esAdmin }: { nombre: string; esAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = esAdmin ? [...LINKS, ...LINKS_ADMIN] : LINKS;

  async function salir() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="border-b bg-muted/40 p-4 md:w-56 md:shrink-0 md:border-b-0 md:border-r">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="font-semibold">Vibra 2027</p>
        <Campanita />
      </div>
      <nav className="flex flex-wrap gap-1 md:flex-col">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm hover:bg-muted",
              activo(pathname, link.href) && "bg-muted font-medium",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="mt-6 text-sm text-muted-foreground">{nombre}</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={salir}>
        Salir
      </Button>
    </aside>
  );
}
