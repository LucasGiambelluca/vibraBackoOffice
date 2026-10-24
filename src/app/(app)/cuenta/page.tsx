import { usuarioActual } from "@/lib/session";
import { EmailsForm } from "./emails-form";
import { PasswordForm } from "./password-form";

export default async function CuentaPage() {
  const usuario = await usuarioActual();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Mi cuenta</h1>
        <p className="text-muted-foreground">
          {usuario.name} · {usuario.email} · {usuario.role}
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Emails</h2>
        <EmailsForm recibirEmails={usuario.recibirEmails ?? true} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Contraseña</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
