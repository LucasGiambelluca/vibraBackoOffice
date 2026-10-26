import { Encabezado } from "@/components/encabezado";
import { Avatar } from "@/components/marca";
import { Card } from "@/components/ui/card";
import { usuarioActual } from "@/lib/session";
import { EmailsForm } from "./emails-form";
import { PasswordForm } from "./password-form";

export default async function CuentaPage() {
  const usuario = await usuarioActual();
  const datos = [
    { texto: "Nombre", valor: usuario.name },
    { texto: "Email", valor: usuario.email },
    { texto: "Rol", valor: usuario.role === "admin" ? "Admin" : "Editor" },
  ];

  return (
    <div className="max-w-4xl">
      <Encabezado volver={{ href: "/mas", texto: "Más", soloCelular: true }} titulo="Mi cuenta" />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="px-(--card-spacing)">
            <div className="mb-5 flex items-center gap-4">
              <Avatar nombre={usuario.name} className="size-14 text-lg" />
              <h2 className="text-lg font-bold tracking-tight">Tus datos y avisos</h2>
            </div>
            <dl className="mb-5 divide-y border-y text-[0.9375rem]">
              {datos.map((d) => (
                <div key={d.texto} className="flex justify-between gap-4 py-3">
                  <dt className="text-muted-foreground">{d.texto}</dt>
                  <dd className="truncate font-medium">{d.valor}</dd>
                </div>
              ))}
            </dl>
            <EmailsForm recibirEmails={usuario.recibirEmails ?? true} />
          </div>
        </Card>

        <Card>
          <div className="px-(--card-spacing)">
            <h2 className="mb-5 text-lg font-bold tracking-tight">Contraseña</h2>
            <PasswordForm />
          </div>
        </Card>
      </div>
    </div>
  );
}
