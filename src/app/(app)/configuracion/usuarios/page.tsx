import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { can } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";
import { listarUsuarios } from "@/lib/users";
import { borrarUsuarioAction, cambiarRolAction } from "./actions";
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
                  <form action={cambiarRolAction.bind(null, u.id)} className="flex items-center gap-2">
                    <select
                      name="rol"
                      defaultValue={u.role}
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button type="submit" variant="outline" size="sm">
                      Guardar
                    </Button>
                  </form>
                )}
              </TableCell>
              <TableCell className="text-right">
                {u.id !== yo.id && (
                  <form action={borrarUsuarioAction.bind(null, u.id)}>
                    <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                      Borrar
                    </Button>
                  </form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
