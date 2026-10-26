import { notFound } from "next/navigation";
import { Encabezado } from "@/components/encabezado";
import { Hoja } from "@/components/hoja";
import { Avatar } from "@/components/marca";
import { Pastilla } from "@/components/pastilla";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { can } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";
import { listarUsuarios } from "@/lib/users";
import { BorrarUsuarioButton } from "./borrar-usuario-button";
import { CambiarRolForm } from "./cambiar-rol-form";
import { NuevoUsuarioForm } from "./nuevo-usuario-form";

export default async function UsuariosPage() {
  const yo = await usuarioActual();
  if (!can(yo.role, "configurar")) notFound();

  const usuarios = await listarUsuarios(db);

  return (
    <div>
      <Encabezado
        volver={{ href: "/mas", texto: "Más", soloCelular: true }}
        titulo="Usuarios"
        bajada="Quiénes entran al back office. Los admins aprueban, borran y configuran."
        acciones={
          <Hoja boton="Nuevo usuario" titulo="Nuevo usuario">
            <NuevoUsuarioForm />
          </Hoja>
        }
      />

      <div className="rounded-2xl bg-card px-1 py-2 ring-1 ring-border md:px-3">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Nombre</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead className="max-lg:hidden">Avisos por email</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar nombre={u.name} className="size-9 bg-muted text-xs text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block font-semibold">{u.name}</span>
                      <span className="block truncate text-xs text-tinta-3">{u.email}</span>
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {u.id === yo.id ? (
                    <Pastilla tono="marca" className="capitalize">
                      {u.role} (vos)
                    </Pastilla>
                  ) : (
                    <CambiarRolForm userId={u.id} rol={u.role} />
                  )}
                </TableCell>
                <TableCell className="max-lg:hidden">
                  {u.recibirEmails ? <Pastilla tono="ok">Activados</Pastilla> : <Pastilla>Apagados</Pastilla>}
                </TableCell>
                <TableCell className="text-right">{u.id !== yo.id && <BorrarUsuarioButton userId={u.id} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
