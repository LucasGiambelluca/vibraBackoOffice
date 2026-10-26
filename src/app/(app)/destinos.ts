import {
  ArrowLeftRight,
  Building,
  Ellipsis,
  LayoutGrid,
  ListChecks,
  Tag,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type Destino = { href: string; label: string; icono: LucideIcon };

export const LINKS: Destino[] = [
  { href: "/", label: "Tablero", icono: LayoutGrid },
  { href: "/presupuestos", label: "Presupuestos", icono: Wallet },
  { href: "/proveedores", label: "Proveedores", icono: Building },
  { href: "/tareas", label: "Tareas", icono: ListChecks },
];

export const LINKS_ADMIN: Destino[] = [
  { href: "/configuracion/usuarios", label: "Usuarios", icono: Users },
  { href: "/configuracion/rubros", label: "Rubros", icono: Tag },
  { href: "/configuracion/tipos-cambio", label: "Tipos de cambio", icono: ArrowLeftRight },
];

// En el celular, Proveedores, la cuenta y la administración viven en "Más".
export const PESTANAS: Destino[] = [
  { href: "/", label: "Tablero", icono: LayoutGrid },
  { href: "/presupuestos", label: "Presupuestos", icono: Wallet },
  { href: "/tareas", label: "Tareas", icono: ListChecks },
  { href: "/mas", label: "Más", icono: Ellipsis },
];
export const EN_MAS = ["/mas", "/proveedores", "/cuenta", "/configuracion"];

