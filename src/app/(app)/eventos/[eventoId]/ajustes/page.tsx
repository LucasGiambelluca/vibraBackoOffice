import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Campo } from "@/components/campos";
import { EncabezadoEvento } from "@/components/encabezado-evento";
import { BotonAccion, FormAccion } from "@/components/form-accion";
import { Hoja } from "@/components/hoja";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { eventoRubro, rubro } from "@/db/schema";
import { listarTiposCambio, monedasUsadas } from "@/lib/eventos";
import { listarGrupos } from "@/lib/grupos";
import { MONEDAS_CAMBIO } from "@/lib/money";
import { can } from "@/lib/permissions";
import { formatearFechaHora } from "@/lib/reminders";
import { listarRubros } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import {
  agregarRubrosEventoAction,
  cerrarEventoAction,
  editarEventoAction,
  guardarTipoCambioAction,
  quitarRubroEventoAction,
  reabrirEventoAction,
} from "../../actions";
import { ElegirRubros } from "../../elegir-rubros";
import { EventoCampos } from "../../evento-campos";
import { cargarEvento } from "../evento";

export default async function AjustesEventoPage({ params }: PageProps<"/eventos/[eventoId]/ajustes">) {
  const usuario = await usuarioActual();
  if (!can(usuario.role, "configurar")) notFound();
  const { eventoId } = await params;
  const evento = await cargarEvento(eventoId);
  const abierto = !evento.cerrado;

  const [tipos, usadas, grupos, catalogo, rubrosEvento] = await Promise.all([
    listarTiposCambio(db, eventoId),
    monedasUsadas(db, eventoId),
    listarGrupos(db),
    listarRubros(db),
    db
      .select({ id: eventoRubro.id, rubroId: eventoRubro.rubroId, nombre: rubro.nombre, dias: eventoRubro.dias })
      .from(eventoRubro)
      .innerJoin(rubro, eq(eventoRubro.rubroId, rubro.id))
      .where(eq(eventoRubro.eventoId, eventoId))
      .orderBy(asc(rubro.nombre)),
  ]);
  const enEvento = new Set(rubrosEvento.map((r) => r.rubroId));
  const disponibles = catalogo.filter((r) => !enEvento.has(r.id));
  const faltan = usadas.filter((m) => !tipos.some((t) => t.moneda === m));

  return (
    <div>
      <EncabezadoEvento evento={evento} seccion="ajustes" esAdmin />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <div className="px-(--card-spacing)">
            <h2 className="mb-5 text-lg font-bold tracking-tight">Datos</h2>
            {abierto ? (
              <FormAccion accion={editarEventoAction} enviar="Guardar" enviando="Guardando…" exito="Guardado" className="space-y-5">
                <input type="hidden" name="eventoId" value={eventoId} />
                <EventoCampos valores={evento} />
              </FormAccion>
            ) : (
              <p className="text-sm text-muted-foreground">Reabrí el evento para cambiar sus datos.</p>
            )}
          </div>
        </Card>

        <Card>
          <div className="space-y-5 px-(--card-spacing)">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Tipos de cambio</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Cuántos pesos vale cada moneda en este evento. Con ellos se suma en ARS y se compara en USD con otros
                eventos.
              </p>
            </div>
            {MONEDAS_CAMBIO.map((moneda) => {
              const actual = tipos.find((t) => t.moneda === moneda);
              return (
                <div key={moneda} className="space-y-2">
                  {abierto ? (
                    <FormAccion
                      accion={guardarTipoCambioAction}
                      enviar="Guardar"
                      enviando="Guardando…"
                      exito="Guardado"
                      className="flex flex-wrap items-end gap-3"
                    >
                      <input type="hidden" name="eventoId" value={eventoId} />
                      <input type="hidden" name="moneda" value={moneda} />
                      <Campo id={`valor-${moneda}`} label={`1 ${moneda} en ARS`} className="min-w-48 flex-1">
                        <Input
                          id={`valor-${moneda}`}
                          name="valorArs"
                          inputMode="decimal"
                          defaultValue={actual ? String(Number(actual.valorArs)) : ""}
                          required
                        />
                      </Campo>
                    </FormAccion>
                  ) : (
                    <p className="text-[0.9375rem]">
                      1 {moneda} = <strong>ARS {actual ? Number(actual.valorArs).toLocaleString("es-AR") : "—"}</strong>
                    </p>
                  )}
                  <p className="text-xs text-tinta-3">
                    {actual
                      ? `Actualizado el ${formatearFechaHora(actual.updatedAt)}${actual.actualizadoPor ? ` por ${actual.actualizadoPor}` : ""}`
                      : "Todavía no se cargó"}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="px-(--card-spacing)">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold tracking-tight">Rubros del evento</h2>
              {abierto && (
                <Hoja boton="Agregar rubros" titulo={`Agregar rubros · ${evento.nombre}`}>
                  <FormAccion accion={agregarRubrosEventoAction} enviar="Agregar" enviando="Agregando…" className="space-y-5">
                    <input type="hidden" name="eventoId" value={eventoId} />
                    <ElegirRubros grupos={grupos} rubros={disponibles} />
                  </FormAccion>
                </Hoja>
              )}
            </div>
            {rubrosEvento.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin rubros todavía.</p>
            ) : (
              <ul className="divide-y border-y">
                {rubrosEvento.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span>
                      <span className="font-medium">{r.nombre}</span>
                      <span className="ml-2 text-sm text-tinta-3">{r.dias === 1 ? "1 día" : "2 días"}</span>
                    </span>
                    {abierto && (
                      <BotonAccion
                        accion={quitarRubroEventoAction}
                        campos={{ eventoRubroId: r.id }}
                        texto="Quitar"
                        enviando="Quitando…"
                        variant="ghost"
                        confirmar
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-tinta-3">
              Los días y el presupuesto de cada rubro se cambian desde su página. Un rubro con cotizaciones no se
              puede quitar.
            </p>
          </div>
        </Card>

        <Card>
          <div className="space-y-4 px-(--card-spacing)">
            <h2 className="text-lg font-bold tracking-tight">{abierto ? "Cerrar el evento" : "Evento cerrado"}</h2>
            {abierto ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Al cerrarlo queda como historial: nadie lo puede editar y sus tipos de cambio quedan fijos para
                  comparar con otros eventos. Lo podés reabrir.
                </p>
                {faltan.length > 0 && (
                  <p className="rounded-xl bg-aviso-suave px-4 py-3 text-sm font-medium text-aviso">
                    Para cerrarlo falta el tipo de cambio de {faltan.join(", ")}.
                  </p>
                )}
                <BotonAccion
                  accion={cerrarEventoAction}
                  campos={{ eventoId }}
                  texto="Cerrar evento"
                  enviando="Cerrando…"
                  variant="default"
                  confirmar
                />
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {evento.cerradoAt && `Se cerró el ${formatearFechaHora(evento.cerradoAt)}. `}Reabrilo solo para
                  corregir algo: mientras esté abierto, el historial se puede modificar.
                </p>
                <BotonAccion
                  accion={reabrirEventoAction}
                  campos={{ eventoId }}
                  texto="Reabrir evento"
                  enviando="Reabriendo…"
                  confirmar
                />
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
