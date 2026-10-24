import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { desdeBob, formatearMonto, MONEDAS, type TiposCambio, type TotalBob } from "@/lib/money";

export function TotalEventoCard({ total, tipos }: { total: TotalBob; tipos: TiposCambio }) {
  const bob = total.bob;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Total aprobado del evento</CardTitle>
      </CardHeader>
      <CardContent>
        {bob === null ? (
          <p className="text-sm text-destructive">
            Falta el tipo de cambio de {total.faltan.join(", ")}. Un admin lo carga en Configuración → Tipos de
            cambio.
          </p>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-3">
            {MONEDAS.map((moneda) => {
              const monto = desdeBob(bob, moneda, tipos);
              return (
                <div key={moneda}>
                  <dt className="text-sm text-muted-foreground">{moneda}</dt>
                  <dd className="text-xl font-semibold">
                    {monto === null ? "Sin tipo de cambio" : formatearMonto(monto, moneda)}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
