import { notFound } from "next/navigation";
import { Campo, Select } from "@/components/campos";
import { Encabezado } from "@/components/encabezado";
import { FormAccion } from "@/components/form-accion";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { eventosDelRequest } from "@/lib/evento-actual";
import { listarGrupos } from "@/lib/grupos";
import { MONEDAS_CAMBIO } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listarRubros } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import { crearEventoAction } from "../actions";
import { ElegirRubros } from "../elegir-rubros";
import { EventoCampos } from "../evento-campos";

export default async function NuevoEventoPage() {
  const usuario = await usuarioActual();
  if (!can(usuario.role, "configurar")) notFound();
  const [eventos, grupos, rubros] = await Promise.all([eventosDelRequest(), listarGrupos(db), listarRubros(db)]);
  const hayEventos = eventos.length > 0;

  return (
    <div className="max-w-3xl">
      <Encabezado volver={{ href: "/eventos", texto: "Eventos" }} titulo="Nuevo evento" />

      <FormAccion accion={crearEventoAction} enviar="Crear evento" enviando="Creando…" className="space-y-5">
        <Card>
          <div className="space-y-4 px-(--card-spacing)">
            <h2 className="text-lg font-bold tracking-tight">Datos</h2>
            <EventoCampos />
          </div>
        </Card>

        <Card>
          <div className="space-y-4 px-(--card-spacing)">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Tipos de cambio</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Cuántos pesos vale cada moneda en este evento. Se pueden cargar después en Ajustes; para cerrar el
                evento tienen que estar los de las monedas que use.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {MONEDAS_CAMBIO.map((m) => (
                <Campo key={m} id={`valor-${m}`} label={`1 ${m} en ARS (opcional)`}>
                  <Input id={`valor-${m}`} name={`valor-${m}`} inputMode="decimal" />
                </Campo>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <div className="group space-y-4 px-(--card-spacing)">
            <h2 className="text-lg font-bold tracking-tight">Rubros</h2>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem]">
              {hayEventos && (
                <label className="flex items-center gap-2.5">
                  <input type="radio" id="origen-copiar" name="origen" value="copiar" defaultChecked className="size-4 accent-black" />
                  Copiar los de otro evento
                </label>
              )}
              <label className="flex items-center gap-2.5">
                <input
                  type="radio"
                  id="origen-elegir"
                  name="origen"
                  value="elegir"
                  defaultChecked={!hayEventos}
                  className="size-4 accent-black"
                />
                Elegirlos del catálogo
              </label>
            </div>

            {hayEventos && (
              <div className="hidden space-y-3 group-has-[#origen-copiar:checked]:block">
                <Campo id="copiarDe" label="Evento" ayuda="Se copian los rubros y sus días. Las cotizaciones no.">
                  <Select id="copiarDe" name="copiarDe" defaultValue={eventos[0].id}>
                    {eventos.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <label className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" name="conPresupuesto" className="size-4 accent-black" />
                  Copiar también el presupuesto de cada rubro, como punto de partida
                </label>
              </div>
            )}

            <div className="hidden group-has-[#origen-elegir:checked]:block">
              <ElegirRubros grupos={grupos} rubros={rubros} />
            </div>
          </div>
        </Card>
      </FormAccion>
    </div>
  );
}
