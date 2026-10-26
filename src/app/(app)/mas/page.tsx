import { Building, CalendarDays, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { Avatar } from "@/components/marca";
import { can } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";
import { LINKS_ADMIN } from "../destinos";
import { Salir } from "./salir";

/** En el celular, lo que no entra en la barra de pestañas. */
export default async function MasPage() {
  const usuario = await usuarioActual();

  return (
    <div className="mx-auto max-w-xl">
      <Encabezado titulo="Más" />

      <div className="space-y-5">
        <Link
          href="/cuenta"
          className="flex items-center gap-4 rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:bg-muted/40"
        >
          <Avatar nombre={usuario.name} className="size-12" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-lg font-bold">{usuario.name}</span>
            <span className="block text-sm text-tinta-3">
              {usuario.role === "admin" ? "Admin" : "Editor"} · Mi cuenta
            </span>
          </span>
          <ChevronRight className="size-5 text-tinta-3" />
        </Link>

        <Grupo
          items={[
            { href: "/eventos", label: "Eventos", icono: CalendarDays },
            { href: "/proveedores", label: "Proveedores", icono: Building },
          ]}
        />

        {can(usuario.role, "configurar") && (
          <section>
            <h2 className="mb-2 px-1 font-sans text-xs font-semibold tracking-[0.1em] text-tinta-3 uppercase">
              Administración
            </h2>
            <Grupo items={LINKS_ADMIN} />
          </section>
        )}

        <Salir />
      </div>
    </div>
  );
}

function Grupo({ items }: { items: { href: string; label: string; icono: typeof Building }[] }) {
  return (
    <ul className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
      {items.map(({ href, label, icono: Icono }) => (
        <li key={href} className="border-b last:border-b-0">
          <Link href={href} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40">
            <span className="grid size-9 place-items-center rounded-[0.625rem] bg-[#0a0a0a] text-white">
              <Icono className="size-[1.125rem]" strokeWidth={1.75} />
            </span>
            <span className="flex-1 text-[0.9375rem] font-medium">{label}</span>
            <ChevronRight className="size-5 text-tinta-3" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
