import Link from "next/link";
import { cn } from "@/lib/utils";

/** Control segmentado hecho de links (cada segmento es un filtro en la URL). */
export function Segmentos({
  items,
  etiqueta,
  className,
}: {
  items: { href: string; texto: string; cantidad?: number; activo: boolean }[];
  etiqueta: string;
  className?: string;
}) {
  return (
    <nav aria-label={etiqueta} className={cn("-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0", className)}>
      <ul className="inline-flex gap-0.5 rounded-xl bg-[#ebebe8] p-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.activo ? "page" : undefined}
              scroll={false}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-[0.625rem] px-3.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                item.activo && "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.08)]",
              )}
            >
              {item.texto}
              {item.cantidad !== undefined && <span className="text-xs font-normal text-tinta-3">{item.cantidad}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
