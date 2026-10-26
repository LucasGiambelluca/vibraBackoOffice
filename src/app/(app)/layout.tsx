import { can } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";
import { Nav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();

  return (
    <div className="min-h-dvh md:flex">
      <Nav nombre={usuario.name} rol={usuario.role} esAdmin={can(usuario.role, "configurar")} />
      <main className="min-w-0 flex-1 px-4 pt-4 pb-32 md:px-10 md:pt-9 md:pb-12">{children}</main>
    </div>
  );
}
