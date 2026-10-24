import Link from "next/link";
import { TotalEventoCard } from "@/components/total-evento";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { formatearMonto } from "@/lib/money";
import { resumenPresupuesto } from "@/lib/resumen";
import { usuarioActual } from "@/lib/session";

export default async function PresupuestosPage() {
  await usuarioActual();
  const { areas, total, tipos } = await resumenPresupuesto(db);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Presupuestos</h1>
      <TotalEventoCard total={total} tipos={tipos} />

      {areas
        .filter((a) => a.rubros.length > 0)
        .map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle>{a.nombre}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rubro</TableHead>
                    <TableHead>Días</TableHead>
                    <TableHead>Cotizaciones</TableHead>
                    <TableHead>Aprobada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {a.rubros.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/presupuestos/${r.id}`} className="font-medium hover:underline">
                          {r.nombre}
                        </Link>
                      </TableCell>
                      <TableCell>{r.dias}</TableCell>
                      <TableCell>{r.cotizaciones}</TableCell>
                      <TableCell>
                        {r.aprobada ? (
                          `${r.aprobada.proveedor} · ${formatearMonto(r.aprobada.total, r.aprobada.moneda)}`
                        ) : (
                          <Badge variant="outline">Sin aprobar</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
