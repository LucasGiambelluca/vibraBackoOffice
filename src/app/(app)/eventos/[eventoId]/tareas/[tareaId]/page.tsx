import { AlarmClock, Hand, Trash } from "lucide-react";
import { notFound } from "next/navigation";
import { SeccionArchivos } from "@/components/archivos/seccion-archivos";
import { Campo } from "@/components/campos";
import { Encabezado } from "@/components/encabezado";
import { EstadoTareaBadge } from "@/components/estado-tarea";
import { BotonAccion, FormAccion } from "@/components/form-accion";
import { Pastilla } from "@/components/pastilla";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { can } from "@/lib/permissions";
import { listarRecordatorios, puedeGestionarRecordatorios } from "@/lib/recordatorios";
import { cuandoVence, formatearFecha, formatearFechaHora, hoyEnLaPaz } from "@/lib/reminders";
import { listarGrupos } from "@/lib/grupos";
import { usuarioActual } from "@/lib/session";
import { obtenerTarea } from "@/lib/tareas";
import { listarUsuarios } from "@/lib/users";
import { AccionesEstado } from "../../../../tareas/acciones-estado";
import {
  borrarTareaAction,
  cancelarRecordatorioAction,
  crearRecordatorioAction,
  editarTareaAction,
} from "../../../../tareas/actions";
import { TareaCampos } from "../../../../tareas/tarea-campos";
import { cargarEvento } from "../../evento";

const TIPO: Record<string, string> = {
  "3_dias_antes": "3 días antes",
  dia_vencimiento: "Día del vencimiento",
  vencida_diario: "Vencida (diario)",
  manual: "Manual",
};

const TONO = { Enviado: "ok", Cancelado: "neutro", Pendiente: "neutro" } as const;

export default async function TareaPage({ params }: PageProps<"/eventos/[eventoId]/tareas/[tareaId]">) {
  const usuario = await usuarioActual();
  const { eventoId, tareaId } = await params;
  const [evento, tarea] = await Promise.all([cargarEvento(eventoId), obtenerTarea(db, tareaId)]);
  if (!tarea || tarea.eventoId !== eventoId) notFound();
  const abierto = !evento.cerrado;

  const [grupos, usuarios, recordatorios] = await Promise.all([
    listarGrupos(db),
    listarUsuarios(db),
    listarRecordatorios(db, tareaId),
  ]);
  const gestiona = abierto && puedeGestionarRecordatorios(usuario, tarea.creadoPor);
  const creador = usuarios.find((u) => u.id === tarea.creadoPor)?.name;
  const vence = tarea.fechaLimite
    ? tarea.estado === "hecha"
      ? `Vencía el ${tarea.fechaLimite.split("-").reverse().join("/")}`
      : cuandoVence(tarea.fechaLimite, hoyEnLaPaz(new Date()))
    : "Sin fecha límite";

  return (
    <div>
      <Encabezado
        volver={{ href: `/eventos/${eventoId}/tareas`, texto: `Tareas · ${evento.nombre}` }}
        titulo={tarea.titulo}
        acciones={
          abierto &&
          can(usuario.role, "borrar") && (
            <BotonAccion
              accion={borrarTareaAction}
              campos={{ tareaId }}
              texto="Borrar"
              enviando="Borrando…"
              variant="destructive"
              icono={<Trash />}
              className="h-10"
              confirmar
            />
          )
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <EstadoTareaBadge estado={tarea.estado} />
          <span className="text-sm text-muted-foreground">
            {vence} · {tarea.grupo}
            {creador && ` · creada por ${creador}`}
          </span>
        </div>
      </Encabezado>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <div className="px-(--card-spacing)">
            <h2 className="mb-5 text-lg font-bold tracking-tight">Datos</h2>
            {abierto ? (
              <>
                <FormAccion
                  accion={editarTareaAction}
                  enviar="Guardar cambios"
                  enviando="Guardando…"
                  exito="Guardado"
                  className="space-y-5"
                >
                  <input type="hidden" name="tareaId" value={tareaId} />
                  <TareaCampos grupos={grupos} usuarios={usuarios} valores={tarea} />
                </FormAccion>
                <div className="mt-5 border-t pt-5">
                  <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-tinta-3 uppercase">Estado</p>
                  <div className="[&>div]:justify-start">
                    <AccionesEstado tareaId={tareaId} estado={tarea.estado} />
                  </div>
                </div>
              </>
            ) : (
              <dl className="divide-y border-y text-[0.9375rem]">
                {[
                  ["Grupo", tarea.grupo],
                  ["Responsable", tarea.responsable ?? "—"],
                  ["Fecha límite", tarea.fechaLimite ? formatearFecha(tarea.fechaLimite) : "—"],
                  ["Notas", tarea.notas ?? "—"],
                ].map(([dt, dd]) => (
                  <div key={dt} className="flex justify-between gap-4 py-3">
                    <dt className="text-muted-foreground">{dt}</dt>
                    <dd className="text-right whitespace-pre-line">{dd}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex h-full flex-col px-(--card-spacing)">
            <h2 className="text-lg font-bold tracking-tight">Recordatorios</h2>
            <p className="mt-1 text-sm text-muted-foreground">Por email y en la campanita. Hora de La Paz.</p>

            {recordatorios.length === 0 ? (
              <p className="mt-4 border-t py-6 text-sm text-muted-foreground">
                Sin recordatorios. Los automáticos se crean al poner una fecha límite.
              </p>
            ) : (
              <ul className="mt-4 divide-y border-t">
                {recordatorios.map((r) => {
                  const estado = r.canceladoAt ? "Cancelado" : r.enviadoAt ? "Enviado" : "Pendiente";
                  const Icono = r.origen === "manual" ? Hand : AlarmClock;
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-3.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Icono className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold tabular-nums">{formatearFechaHora(r.fechaHora)}</span>
                        <span className="block text-sm text-tinta-3">{TIPO[r.tipoAutomatico ?? r.origen]}</span>
                      </span>
                      {gestiona && r.origen === "manual" && estado === "Pendiente" ? (
                        <BotonAccion
                          accion={cancelarRecordatorioAction}
                          campos={{ recordatorioId: r.id }}
                          texto="Cancelar"
                          enviando="Cancelando…"
                          variant="ghost"
                        />
                      ) : (
                        <Pastilla tono={TONO[estado]}>{estado}</Pastilla>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {gestiona && tarea.estado !== "hecha" && (
              <FormAccion
                accion={crearRecordatorioAction}
                enviar="Agregar recordatorio"
                enviando="Agregando…"
                exito="Recordatorio agregado"
                limpiar
                className="mt-auto space-y-3 border-t pt-5"
              >
                <input type="hidden" name="tareaId" value={tareaId} />
                <Campo id="fechaHora" label="Recordatorio manual (hora de La Paz)">
                  <Input id="fechaHora" name="fechaHora" type="datetime-local" required />
                </Campo>
              </FormAccion>
            )}
          </div>
        </Card>
      </div>

      <SeccionArchivos duenio={{ tipo: "tarea", id: tareaId }} actor={usuario} abierto={abierto} className="mt-5" />
    </div>
  );
}
