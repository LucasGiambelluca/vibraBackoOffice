import Form from "next/form";
import Link from "next/link";
import { FormAccion } from "@/components/form-accion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { listarProveedores } from "@/lib/proveedores";
import { usuarioActual } from "@/lib/session";
import { crearProveedorAction } from "./actions";
import { ProveedorCampos } from "./proveedor-campos";

export default async function ProveedoresPage({ searchParams }: PageProps<"/proveedores">) {
  await usuarioActual();
  const { q } = await searchParams;
  const busqueda = typeof q === "string" ? q.trim() : "";
  const proveedores = await listarProveedores(db, busqueda);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Proveedores</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <FormAccion
            accion={crearProveedorAction}
            enviar="Crear proveedor"
            enviando="Creando…"
            exito="Proveedor creado"
            limpiar
            className="space-y-4"
          >
            <ProveedorCampos />
          </FormAccion>
        </CardContent>
      </Card>

      <Form action="/proveedores" className="flex max-w-md gap-2" role="search">
        <Input name="q" defaultValue={busqueda} placeholder="Buscar por nombre o contacto" aria-label="Buscar" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </Form>

      {proveedores.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {busqueda ? "Ningún proveedor coincide con la búsqueda." : "Todavía no hay proveedores."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {proveedores.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/proveedores/${p.id}`} className="font-medium hover:underline">
                    {p.nombre}
                  </Link>
                </TableCell>
                <TableCell>{p.contacto}</TableCell>
                <TableCell>{p.telefono}</TableCell>
                <TableCell>{p.email}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
