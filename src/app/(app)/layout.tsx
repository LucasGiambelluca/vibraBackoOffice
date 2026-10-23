import { can } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";
import { Nav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();

  return (
    <div className="min-h-screen md:flex">
      <Nav nombre={usuario.name} esAdmin={can(usuario.role, "configurar")} />
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
