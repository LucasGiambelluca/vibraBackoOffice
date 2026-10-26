import { notFound } from "next/navigation";
import { Campo } from "@/components/campos";
import { Encabezado } from "@/components/encabezado";
import { FormAccion } from "@/components/form-accion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { MONEDAS_EXTRANJERAS } from "@/lib/money";
import { can } from "@/lib/permissions";
import { usuarioActual } from "@/lib/session";
import { listarTiposCambio } from "@/lib/tipos-cambio";
import { guardarTipoCambioAction } from "./actions";

const FECHA = new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short", timeZone: "America/La_Paz" });

export default async function TiposCambioPage() {
  const yo = await usuarioActual();
  if (!can(yo.role, "configurar")) notFound();

  const tipos = await listarTiposCambio(db);

  return (
    <div>
      <Encabezado
        volver={{ href: "/mas", texto: "Más", soloCelular: true }}
        titulo="Tipos de cambio"
        bajada="Cuántos bolivianos vale cada moneda. Los totales se calculan en BOB."
      />

      <div className="grid max-w-4xl gap-5 md:grid-cols-2">
        {MONEDAS_EXTRANJERAS.map((moneda) => {
          const actual = tipos.find((t) => t.moneda === moneda);
          return (
            <Card key={moneda}>
              <CardHeader>
                <CardTitle>1 {moneda} en BOB</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormAccion
                  accion={guardarTipoCambioAction}
                  enviar="Guardar"
                  enviando="Guardando…"
                  exito="Guardado"
                  className="flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="moneda" value={moneda} />
                  <Campo id={`valor-${moneda}`} label="Valor en BOB">
                    <Input
                      id={`valor-${moneda}`}
                      name="valorBob"
                      inputMode="decimal"
                      defaultValue={actual ? String(Number(actual.valorBob)) : ""}
                      required
                    />
                  </Campo>
                </FormAccion>
                <p className="text-xs text-tinta-3">
                  {actual
                    ? `Actualizado el ${FECHA.format(actual.updatedAt)}${actual.actualizadoPor ? ` por ${actual.actualizadoPor}` : ""}`
                    : "Todavía no se cargó"}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
