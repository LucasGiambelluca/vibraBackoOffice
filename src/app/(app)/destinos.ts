import {
  Building,
  CalendarDays,
  Ellipsis,
  LayoutGrid,
  ListChecks,
  Tag,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type Destino = { href: string; label: string; icono: LucideIcon };

// "Presupuestos" y "Tareas" son del evento que se está viendo (o del último abierto):
// nav.tsx reemplaza su href por el del evento.
export const LINKS: Destino[] = [
  { href: "/", label: "Tablero", icono: LayoutGrid },
  { href: "/eventos", label: "Eventos", icono: CalendarDays },
  { href: "/presupuestos", label: "Presupuestos", icono: Wallet },
  { href: "/tareas", label: "Tareas", icono: ListChecks },
  { href: "/proveedores", label: "Proveedores", icono: Building },
];

export const LINKS_ADMIN: Destino[] = [
  { href: "/configuracion/usuarios", label: "Usuarios", icono: Users },
  { href: "/configuracion/grupos", label: "Grupos y rubros", icono: Tag },
];

// En el celular, Eventos, Proveedores, la cuenta y la administración viven en "Más".
export const PESTANAS: Destino[] = [
  { href: "/", label: "Tablero", icono: LayoutGrid },
  { href: "/presupuestos", label: "Presupuestos", icono: Wallet },
  { href: "/tareas", label: "Tareas", icono: ListChecks },
  { href: "/mas", label: "Más", icono: Ellipsis },
];
export const EN_MAS = ["/mas", "/proveedores", "/cuenta", "/configuracion"];
