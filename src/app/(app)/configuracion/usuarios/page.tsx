import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Usuarios</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevoUsuarioForm />
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                {u.id === yo.id ? (
                  <Badge variant="secondary">{u.role} (vos)</Badge>
                ) : (
                  <CambiarRolForm userId={u.id} rol={u.role} />
                )}
              </TableCell>
              <TableCell className="text-right">
                {u.id !== yo.id && <BorrarUsuarioButton userId={u.id} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
