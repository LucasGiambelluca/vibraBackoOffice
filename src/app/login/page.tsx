import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LogoRs } from "@/components/marca";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const sesion = await auth.api.getSession({ headers: await headers() });
  if (sesion) redirect("/");

  return (
    <main className="grid min-h-dvh bg-card lg:grid-cols-[43%_1fr]">
      <section className="relative flex flex-col justify-between bg-[#0a0a0a] px-6 pt-10 pb-10 text-white lg:px-16 lg:py-14">
        <LogoRs claro className="h-12 self-start lg:h-16" />
        <div className="mt-14 lg:mt-0">
          <p className="text-xs font-bold tracking-[0.2em] text-marca uppercase">Vibra Bolivia 2027</p>
          <p className="mt-4 max-w-lg font-display text-[1.875rem] leading-[1.08] font-bold tracking-[-0.03em] text-balance lg:text-[2.75rem]">
            Todo el presupuesto y las tareas del festival, en un solo lugar.
          </p>
          <p className="mt-4 text-[0.9375rem] text-white/60">Back office de producción para el equipo de RS Group.</p>
        </div>
        <p className="hidden text-xs text-white/40 lg:block">© {new Date().getFullYear()} RS Group · Uso interno</p>
      </section>
      <section className="flex items-start justify-center px-6 py-10 lg:items-center">
        <div className="w-full max-w-sm">
          <h1 className="text-[1.875rem] font-bold tracking-[-0.03em]">Entrar</h1>
          <p className="mt-1.5 mb-7 text-[0.9375rem] text-muted-foreground">
            Usá el email y la contraseña que te dio el admin.
          </p>
          <LoginForm />
          <p className="mt-6 text-center text-xs text-tinta-3">
            ¿Olvidaste la contraseña? Pedile al admin que te la cambie.
          </p>
        </div>
      </section>
    </main>
  );
}
