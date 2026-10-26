import { Check, Ellipsis, FileText, Image as ImageIcon, Info, RotateCcw, TrendingDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Campo, Select } from "@/components/campos";
import { SeccionArchivos } from "@/components/archivos/seccion-archivos";
import { Encabezado } from "@/components/encabezado";
import { EstadoCotizacion } from "@/components/estado-cotizacion";
import { BotonAccion, FormAccion } from "@/components/form-accion";
import { Hoja } from "@/components/hoja";
import { Desvio } from "@/components/montos";
import { Pastilla } from "@/components/pastilla";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { archivosPorCotizacion, type ArchivoListado } from "@/lib/archivos";
import { idMasBarata, listarCotizaciones, type CotizacionListada } from "@/lib/cotizaciones";
import { obtenerEventoRubro } from "@/lib/evento-rubros";
import { obtenerTiposCambio } from "@/lib/eventos";
import { hayLecturaPdf } from "@/lib/lectura-pdf";
import { formatearMonto, MONEDAS } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listarProveedores } from "@/lib/proveedores";
import { formatearFecha, formatearFechaHora } from "@/lib/reminders";
import { desvio, type Monto } from "@/lib/resumen";
import { usuarioActual } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  aprobarCotizacionAction,
  borrarCotizacionAction,
  crearCotizacionAction,
  revertirAprobacionAction,
} from "../../../../presupuestos/actions";
import { AdjuntoCotizacion } from "../../../../presupuestos/adjunto-cotizacion";
import { CotizacionCampos } from "../../../../presupuestos/cotizacion-campos";
import { editarRubroEventoAction, registrarPagoAction } from "../../../actions";
import { cargarEvento } from "../../evento";

/** Con el evento cerrado todo queda en falso: no se muestra ningún botón de edición. */
type Permisos = { editar: boolean; aprobar: boolean; borrar: boolean };

export default async function RubroPage({ params }: PageProps<"/eventos/[eventoId]/rubros/[eventoRubroId]">) {
  const usuario = await usuarioActual();
  const { eventoId, eventoRubroId } = await params;
  const [evento, rubro] = await Promise.all([cargarEvento(eventoId), obtenerEventoRubro(db, eventoRubroId)]);
  if (!rubro || rubro.eventoId !== eventoId) notFound();

  const [cotizaciones, proveedores, tipos] = await Promise.all([
    listarCotizaciones(db, { eventoRubroId }),
    listarProveedores(db),
    obtenerTiposCambio(db, eventoId),
  ]);
  const archivos = await archivosPorCotizacion(
    db,
    cotizaciones.map((c) => c.id),
  );
  const masBarata = idMasBarata(cotizaciones);
  const abierto = !evento.cerrado;
  const permisos = {
    editar: abierto,
    aprobar: abierto && can(usuario.role, "aprobar"),
    borrar: abierto && can(usuario.role, "borrar"),
  };
  const base = `/eventos/${eventoId}/rubros/${eventoRubroId}`;
  const faltaCambio = cotizaciones.some((c) => c.totalArs === null);
  const vigentes = cotizaciones.filter((c) => c.estado !== "descartada");
  const descartadas = cotizaciones.filter((c) => c.estado === "descartada");
  const dias = rubro.dias === 1 ? "1 día" : "2 días";

  return (
    <div>
      <Encabezado
        volver={{ href: `/eventos/${eventoId}`, texto: evento.nombre }}
        titulo={rubro.nombre}
        bajada={
          <>
            {rubro.grupo} · se contrata por {dias} · {cotizaciones.length}{" "}
            {cotizaciones.length === 1 ? "cotización" : "cotizaciones"}
          </>
        }
        acciones={
          abierto &&
          proveedores.length > 0 && (
            <Hoja boton="Nueva cotización" titulo={`Nueva cotización · ${rubro.nombre}`}>
              <FormAccion
                accion={crearCotizacionAction}
                enviar="Agregar cotización"
                enviando="Guardando…"
                exito="Cotización agregada"
                limpiar
                className="space-y-5"
              >
                <input type="hidden" name="eventoRubroId" value={eventoRubroId} />
                <AdjuntoCotizacion eventoRubroId={eventoRubroId} conLectura={hayLecturaPdf()} />
                <CotizacionCampos proveedores={proveedores} dias={rubro.dias} />
              </FormAccion>
            </Hoja>
          )
        }
      />

      <PresupuestoYPago
        rubro={rubro}
        aprobada={cotizaciones.find((c) => c.estado === "aprobada") ?? null}
        tipos={tipos}
        editable={abierto && can(usuario.role, "configurar")}
      />

      <p className="mb-6 flex gap-3 rounded-2xl bg-[#ebebe8] px-4 py-3 text-sm text-muted-foreground md:items-center md:px-5">
        <Info className="mt-0.5 size-4 shrink-0 md:mt-0" />
        Comparación en pesos (ARS) con los tipos de cambio del evento. Al aprobar una cotización, las demás del rubro pasan a descartadas. Solo un admin
        aprueba.
      </p>

      {faltaCambio && (
        <p className="mb-6 rounded-2xl bg-peligro-suave px-4 py-3 text-sm font-medium text-peligro md:px-5">
          Hay cotizaciones en monedas sin tipo de cambio: no se pueden comparar en ARS. Cargá los tipos de cambio en los ajustes del evento.
        </p>
      )}

      {abierto && proveedores.length === 0 && (
        <p className="mb-6 text-sm text-muted-foreground">
          Para cargar cotizaciones primero cargá al menos un proveedor en{" "}
          <Link href="/proveedores" className="font-medium text-foreground underline">
            Proveedores
          </Link>
          .
        </p>
      )}

      {cotizaciones.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
          <p className="font-display text-lg font-bold">Todavía no hay cotizaciones</p>
          {abierto && <p className="mt-1 text-sm text-muted-foreground">Cargá la primera con “Nueva cotización”.</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
          <div
            className={cn(
              "grid flex-1 gap-4 sm:grid-cols-2 md:gap-5",
              descartadas.length > 0 ? "2xl:grid-cols-3" : "xl:grid-cols-3",
            )}
          >
            {vigentes.map((c) => (
              <TarjetaCotizacion
                key={c.id}
                c={c}
                archivos={archivos.get(c.id) ?? []}
                base={base}
                dosDias={rubro.dias === 2}
                masBarata={c.id === masBarata}
                permisos={permisos}
              />
            ))}
          </div>
          {descartadas.length > 0 && (
            <aside className="rounded-2xl bg-[#ebebe8] p-5 lg:w-64 lg:shrink-0 lg:p-6">
              <h2 className="font-sans text-[0.6875rem] font-semibold tracking-[0.1em] text-tinta-3 uppercase">
                Descartadas
              </h2>
              <ul className="mt-4 space-y-4">
                {descartadas.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3">
                    <Link href={`${base}/${c.id}`} className="min-w-0 hover:underline">
                      <span className="block font-semibold text-muted-foreground">{c.proveedor}</span>
                      <span className="block text-sm text-tinta-3 tabular-nums">
                        {formatearMonto(c.total, c.moneda)}
                      </span>
                    </Link>
                    <MenuCotizacion c={c} permisos={permisos} />
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs leading-relaxed text-tinta-3 max-lg:hidden">
                Se descartan solas cuando se aprueba otra cotización del rubro. Si el admin revierte la aprobación,
                quedan como estaban.
              </p>
            </aside>
          )}
        </div>
      )}

      <SeccionArchivos
        duenio={{ tipo: "rubro", id: eventoRubroId }}
        actor={usuario}
        abierto={abierto}
        titulo="Archivos del rubro"
        className="mt-8"
      />
    </div>
  );
}

function TarjetaCotizacion({
  c,
  archivos,
  base,
  dosDias,
  masBarata,
  permisos,
}: {
  c: CotizacionListada;
  archivos: ArchivoListado[];
  base: string;
  dosDias: boolean;
  masBarata: boolean;
  permisos: Permisos;
}) {
  const aprobada = c.estado === "aprobada";
  const filas = [
    { texto: "Precio por día", valor: formatearMonto(c.precioDia, c.moneda) },
    ...(dosDias
      ? [
          { texto: "Descuento 2 días", valor: `${c.descuento2Dias} %` },
          { texto: "Ahorro", valor: formatearMonto(c.ahorro, c.moneda) },
        ]
      : []),
  ];

  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl bg-card p-5 ring-1 ring-border md:p-6",
        masBarata && !aprobada && "ring-2 ring-marca",
        aprobada && "ring-2 ring-ok",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <EstadoCotizacion estado={c.estado} />
        {masBarata && (
          <Pastilla tono="marca" punto={false} className="bg-marca text-black">
            <TrendingDown className="size-3.5" />
            Más barata
          </Pastilla>
        )}
      </div>
      <h2 className="mt-4 text-xl font-bold tracking-tight">
        <Link href={`/proveedores/${c.proveedorId}`} className="hover:underline">
          {c.proveedor}
        </Link>
      </h2>
      <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">{c.descripcion}</p>

      <p className="mt-5 text-xs text-tinta-3">Total por {dosDias ? "2 días" : "1 día"}</p>
      <p className="font-display text-[1.875rem] leading-tight font-extrabold tracking-[-0.03em] tabular-nums">
        {formatearMonto(c.total, c.moneda)}
      </p>
      <p className="text-sm text-muted-foreground tabular-nums">
        = {c.totalArs === null ? "sin tipo de cambio" : formatearMonto(c.totalArs, "ARS")}
      </p>

      <dl className="mt-4 divide-y border-t text-sm">
        {filas.map((f) => (
          <div key={f.texto} className="flex justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">{f.texto}</dt>
            <dd className="font-semibold tabular-nums">{f.valor}</dd>
          </div>
        ))}
      </dl>

      {archivos.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {archivos.map((a) => {
            const Icono = a.tipo === "pdf" ? FileText : ImageIcon;
            return (
              <li key={a.id}>
                <a
                  href={`/api/archivos/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-2 py-1 text-sm hover:underline"
                >
                  <Icono className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{a.nombre}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {aprobada && c.aprobadaAt && (
        <p className="mt-3 text-xs text-tinta-3">
          Aprobada por {c.aprobador ?? "un usuario borrado"} · {formatearFechaHora(c.aprobadaAt)}
        </p>
      )}

      <div className="mt-auto flex items-center gap-2 pt-6">
        {permisos.aprobar && !aprobada && (
          <BotonAccion
            accion={aprobarCotizacionAction}
            campos={{ cotizacionId: c.id }}
            texto="Aprobar"
            enviando="Aprobando…"
            variant={masBarata ? "default" : "outline"}
            icono={<Check />}
            className="h-10 px-4"
          />
        )}
        {permisos.editar && (
          <Link
            href={`${base}/${c.id}`}
            className={cn(buttonVariants({ variant: "outline" }), "flex-1 sm:flex-none")}
          >
            Editar
          </Link>
        )}
        <MenuCotizacion c={c} permisos={permisos} />
      </div>
    </article>
  );
}

/** Acciones menos frecuentes (revertir, borrar) detrás de un "…". */
function MenuCotizacion({ c, permisos }: { c: CotizacionListada; permisos: Permisos }) {
  const revertir = permisos.aprobar && c.estado === "aprobada";
  const aprobar = permisos.aprobar && c.estado === "descartada";
  if (!revertir && !aprobar && !permisos.borrar) return null;

  return (
    <details className="relative ml-auto [&[open]>summary]:bg-muted">
      <summary
        aria-label={`Más acciones · ${c.proveedor}`}
        className={cn(buttonVariants({ variant: "outline", size: "icon" }), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}
      >
        <Ellipsis />
      </summary>
      <div className="absolute right-0 bottom-full z-20 mb-2 flex min-w-44 flex-col items-stretch gap-1 rounded-2xl border bg-popover p-2 shadow-[0_12px_32px_rgb(0_0_0/0.14)] [&_button]:w-full [&_button]:justify-start [&_form]:justify-start">
        {aprobar && (
          <BotonAccion
            accion={aprobarCotizacionAction}
            campos={{ cotizacionId: c.id }}
            texto="Aprobar"
            enviando="Aprobando…"
            variant="ghost"
            icono={<Check />}
          />
        )}
        {revertir && (
          <BotonAccion
            accion={revertirAprobacionAction}
            campos={{ cotizacionId: c.id }}
            texto="Revertir aprobación"
            enviando="Revirtiendo…"
            variant="ghost"
            icono={<RotateCcw />}
            confirmar
          />
        )}
        {permisos.borrar && (
          <BotonAccion
            accion={borrarCotizacionAction}
            campos={{ cotizacionId: c.id }}
            texto="Borrar"
            enviando="Borrando…"
            variant="ghost"
            className="text-destructive"
            confirmar
          />
        )}
      </div>
    </details>
  );
}

const montoDe = (valor: string | null, moneda: string | null): Monto | null =>
  valor === null || moneda === null ? null : { monto: Number(valor), moneda: moneda as Monto["moneda"] };

/** Presupuesto objetivo, lo aprobado y lo pagado del rubro; el admin los carga acá. */
function PresupuestoYPago({
  rubro,
  aprobada,
  tipos,
  editable,
}: {
  rubro: NonNullable<Awaited<ReturnType<typeof obtenerEventoRubro>>>;
  aprobada: CotizacionListada | null;
  tipos: Parameters<typeof desvio>[2];
  editable: boolean;
}) {
  const presupuesto = montoDe(rubro.presupuesto, rubro.presupuestoMoneda);
  const pagado = montoDe(rubro.pagado, rubro.pagadoMoneda);
  const aprobado = aprobada ? { monto: aprobada.total, moneda: aprobada.moneda } : null;
  const celdas = [
    { titulo: "Presupuesto", monto: presupuesto, nota: "Objetivo del rubro" },
    { titulo: "Aprobado", monto: aprobado, nota: aprobada?.proveedor ?? "Sin cotización aprobada" },
    {
      titulo: "Pagado",
      monto: pagado,
      nota: [rubro.pagadoFecha && formatearFecha(rubro.pagadoFecha), rubro.pagadoNota].filter(Boolean).join(" · ") || "Lo que se pagó de verdad",
    },
  ];

  return (
    <section className="mb-6 rounded-2xl bg-card ring-1 ring-border">
      <div className="grid gap-px overflow-hidden rounded-t-2xl bg-border sm:grid-cols-4">
        {celdas.map((c) => (
          <div key={c.titulo} className="bg-card px-5 py-4">
            <p className="text-xs text-tinta-3">{c.titulo}</p>
            <p className="mt-1 font-display text-lg font-bold tracking-tight tabular-nums">
              {c.monto ? formatearMonto(c.monto.monto, c.monto.moneda) : "—"}
            </p>
            <p className="truncate text-xs text-tinta-3">{c.nota}</p>
          </div>
        ))}
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-tinta-3">Desvío</p>
          <p className="mt-1.5">
            <Desvio valor={desvio(presupuesto, pagado ?? aprobado, tipos)} />
          </p>
        </div>
      </div>
      {editable && (
        <div className="flex flex-wrap gap-2 border-t px-4 py-3">
          <Hoja boton="Editar presupuesto" titulo={`Presupuesto · ${rubro.nombre}`} secundario>
            <FormAccion accion={editarRubroEventoAction} enviar="Guardar" enviando="Guardando…" className="space-y-5">
              <input type="hidden" name="eventoRubroId" value={rubro.id} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo id="presupuesto" label="Presupuesto objetivo" ayuda="Vacío = sin presupuesto" className="sm:col-span-2">
                  <Input id="presupuesto" name="presupuesto" inputMode="decimal" defaultValue={rubro.presupuesto ?? ""} />
                </Campo>
                <Campo id="presupuestoMoneda" label="Moneda del presupuesto">
                  <Select id="presupuestoMoneda" name="presupuestoMoneda" defaultValue={rubro.presupuestoMoneda ?? "ARS"}>
                    {MONEDAS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </Select>
                </Campo>
                <Campo id="dias" label="Días a contratar" className="sm:col-span-3">
                  <Select id="dias" name="dias" defaultValue={String(rubro.dias)}>
                    <option value="1">1 día</option>
                    <option value="2">2 días</option>
                  </Select>
                </Campo>
              </div>
            </FormAccion>
          </Hoja>
          <Hoja boton="Registrar pago" titulo={`Pago · ${rubro.nombre}`} secundario>
            <FormAccion accion={registrarPagoAction} enviar="Guardar pago" enviando="Guardando…" className="space-y-5">
              <input type="hidden" name="eventoRubroId" value={rubro.id} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo id="pagado" label="Monto pagado" ayuda="Vacío = todavía no se pagó" className="sm:col-span-2">
                  <Input id="pagado" name="pagado" inputMode="decimal" defaultValue={rubro.pagado ?? ""} />
                </Campo>
                <Campo id="pagadoMoneda" label="Moneda del pago">
                  <Select id="pagadoMoneda" name="pagadoMoneda" defaultValue={rubro.pagadoMoneda ?? aprobada?.moneda ?? "ARS"}>
                    {MONEDAS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </Select>
                </Campo>
                <Campo id="pagadoFecha" label="Fecha (opcional)">
                  <Input id="pagadoFecha" name="pagadoFecha" type="date" defaultValue={rubro.pagadoFecha ?? ""} />
                </Campo>
                <Campo id="pagadoNota" label="Nota (opcional)" className="sm:col-span-2">
                  <Input id="pagadoNota" name="pagadoNota" defaultValue={rubro.pagadoNota ?? ""} placeholder="Ej. extra por horas" />
                </Campo>
              </div>
            </FormAccion>
          </Hoja>
        </div>
      )}
    </section>
  );
}
