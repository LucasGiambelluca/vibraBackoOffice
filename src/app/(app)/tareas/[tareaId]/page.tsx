import Link from "next/link";
import { notFound } from "next/navigation";
import { Campo } from "@/components/campos";
import { EstadoTareaBadge } from "@/components/estado-tarea";
import { BotonAccion, FormAccion } from "@/components/form-accion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { can } from "@/lib/permissions";
import { listarRecordatorios, puedeGestionarRecordatorios } from "@/lib/recordatorios";
import { formatearFechaHora } from "@/lib/reminders";
import { listarAreas } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import { obtenerTarea } from "@/lib/tareas";
import { listarUsuarios } from "@/lib/users";
import { AccionesEstado } from "../acciones-estado";
import {
  borrarTareaAction,
  cancelarRecordatorioAction,
  crearRecordatorioAction,
  editarTareaAction,
} from "../actions";
import { TareaCampos } from "../tarea-campos";

const TIPO: Record<string, string> = {
  "3_dias_antes": "3 días antes",
  dia_vencimiento: "Día del vencimiento",
  vencida_diario: "Vencida (diario)",
  manual: "Manual",
};

export default async function TareaPage({ params }: PageProps<"/tareas/[tareaId]">) {
  const usuario = await usuarioActual();
  const { tareaId } = await params;
  const tarea = await obtenerTarea(db, tareaId);
  if (!tarea) notFound();

  const [areas, usuarios, recordatorios] = await Promise.all([
    listarAreas(db),
    listarUsuarios(db),
    listarRecordatorios(db, tareaId),
  ]);
  const gestiona = puedeGestionarRecordatorios(usuario, tarea.creadoPor);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/tareas" className="text-sm text-muted-foreground hover:underline">
            ← Tareas
          </Link>
          <h1 className="text-2xl font-semibold">{tarea.titulo}</h1>
          <div className="mt-1 flex items-center gap-2">
            <EstadoTareaBadge estado={tarea.estado} />
            <AccionesEstado tareaId={tareaId} estado={tarea.estado} />
          </div>
        </div>
        {can(usuario.role, "borrar") && (
          <BotonAccion
            accion={borrarTareaAction}
            campos={{ tareaId }}
            texto="Borrar tarea"
            enviando="Borrando…"
            variant="destructive"
            confirmar
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent>
          <FormAccion
            accion={editarTareaAction}
            enviar="Guardar cambios"
            enviando="Guardando…"
            exito="Guardado"
            className="space-y-4"
          >
            <input type="hidden" name="tareaId" value={tareaId} />
            <TareaCampos areas={areas} usuarios={usuarios} valores={tarea} />
          </FormAccion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recordatorios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {recordatorios.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin recordatorios. Los automáticos se crean al poner una fecha límite.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuándo (hora de La Paz)</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordatorios.map((r) => {
                  const estado = r.canceladoAt ? "Cancelado" : r.enviadoAt ? "Enviado" : "Pendiente";
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{formatearFechaHora(r.fechaHora)}</TableCell>
                      <TableCell>{TIPO[r.tipoAutomatico ?? r.origen]}</TableCell>
                      <TableCell>{estado}</TableCell>
                      <TableCell>
                        {gestiona && r.origen === "manual" && estado === "Pendiente" && (
                          <BotonAccion
                            accion={cancelarRecordatorioAction}
                            campos={{ recordatorioId: r.id }}
                            texto="Cancelar"
                            enviando="Cancelando…"
                            variant="ghost"
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {gestiona && tarea.estado !== "hecha" && (
            <FormAccion
              accion={crearRecordatorioAction}
              enviar="Agregar recordatorio"
              enviando="Agregando…"
              exito="Recordatorio agregado"
              limpiar
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="tareaId" value={tareaId} />
              <Campo id="fechaHora" label="Recordatorio manual (hora de La Paz)">
                <Input id="fechaHora" name="fechaHora" type="datetime-local" required />
              </Campo>
            </FormAccion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
