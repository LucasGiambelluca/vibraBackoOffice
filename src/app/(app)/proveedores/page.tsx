import { ChevronRight, Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { FormAccion } from "@/components/form-accion";
import { Hoja } from "@/components/hoja";
import { iniciales } from "@/components/marca";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { listarCotizaciones } from "@/lib/cotizaciones";
import { listarProveedores } from "@/lib/proveedores";
import { usuarioActual } from "@/lib/session";
import { crearProveedorAction } from "./actions";
import { ProveedorCampos } from "./proveedor-campos";

export default async function ProveedoresPage({ searchParams }: PageProps<"/proveedores">) {
  await usuarioActual();
  const { q } = await searchParams;
  const busqueda = typeof q === "string" ? q.trim() : "";
  const [proveedores, cotizaciones] = await Promise.all([listarProveedores(db, busqueda), listarCotizaciones(db)]);

  const cantidad = new Map<string, number>();
  for (const c of cotizaciones) cantidad.set(c.proveedorId, (cantidad.get(c.proveedorId) ?? 0) + 1);

  return (
    <div>
      <Encabezado
        titulo="Proveedores"
        bajada="Contactos de quienes cotizan para el evento."
        acciones={
          <Hoja boton="Nuevo proveedor" titulo="Nuevo proveedor">
            <FormAccion
              accion={crearProveedorAction}
              enviar="Crear proveedor"
              enviando="Creando…"
              exito="Proveedor creado"
              limpiar
              className="space-y-5"
            >
              <ProveedorCampos />
            </FormAccion>
          </Hoja>
        }
      />

      <div className="mb-5 flex items-center justify-between gap-4">
        <Form action="/proveedores" className="relative w-full max-w-md" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tinta-3" />
          <Input
            name="q"
            type="search"
            defaultValue={busqueda}
            placeholder="Buscar por nombre o contacto"
            aria-label="Buscar"
            className="pl-10"
          />
        </Form>
        <p className="shrink-0 text-sm text-tinta-3 max-sm:hidden">
          {proveedores.length} {proveedores.length === 1 ? "proveedor" : "proveedores"}
        </p>
      </div>

      {proveedores.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {busqueda ? "Ningún proveedor coincide con la búsqueda." : "Todavía no hay proveedores."}
        </p>
      ) : (
        <div className="rounded-2xl bg-card px-1 py-2 ring-1 ring-border md:px-3">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nombre</TableHead>
                <TableHead className="max-md:hidden">Contacto</TableHead>
                <TableHead className="max-lg:hidden">Teléfono</TableHead>
                <TableHead className="max-lg:hidden">Email</TableHead>
                <TableHead className="max-sm:hidden">Cotizaciones</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {proveedores.map((p) => (
                <TableRow key={p.id} className="relative">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold text-muted-foreground"
                      >
                        {iniciales(p.nombre)}
                      </span>
                      <span className="min-w-0">
                        <Link href={`/proveedores/${p.id}`} className="font-semibold after:absolute after:inset-0 hover:underline">
                          {p.nombre}
                        </Link>
                        <span className="block truncate text-xs text-tinta-3 md:hidden">
                          {[p.contacto, p.telefono].filter(Boolean).join(" · ") || "Sin contacto"}
                        </span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-md:hidden">{p.contacto ?? <Vacio />}</TableCell>
                  <TableCell className="tabular-nums max-lg:hidden">{p.telefono ?? <Vacio />}</TableCell>
                  <TableCell className="max-lg:hidden">{p.email ?? <Vacio />}</TableCell>
                  <TableCell className="tabular-nums max-sm:hidden">{cantidad.get(p.id) ?? 0}</TableCell>
                  <TableCell className="pl-0">
                    <ChevronRight className="ml-auto size-4 text-tinta-3" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Vacio() {
  return <span className="text-tinta-3">—</span>;
}
