import Form from "next/form";
import Link from "next/link";
import { Campo, Select } from "@/components/campos";
import { EstadoTareaBadge, TEXTO_ESTADO_TAREA } from "@/components/estado-tarea";
import { FormAccion } from "@/components/form-accion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { formatearFecha, hoyEnLaPaz } from "@/lib/reminders";
import { listarAreas } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import { ESTADOS_TAREA, listarTareas, type EstadoTarea } from "@/lib/tareas";
import { listarUsuarios } from "@/lib/users";
import { cn } from "@/lib/utils";
import { AccionesEstado } from "./acciones-estado";
import { crearTareaAction } from "./actions";
import { TareaCampos } from "./tarea-campos";

const texto = (valor: string | string[] | undefined) => (typeof valor === "string" ? valor : "");

export default async function TareasPage({ searchParams }: PageProps<"/tareas">) {
  await usuarioActual();
  const filtros = await searchParams;
  const area = texto(filtros.area);
  const responsable = texto(filtros.responsable);
  const estado = texto(filtros.estado);

  const [areas, usuarios, tareas] = await Promise.all([
    listarAreas(db),
    listarUsuarios(db),
    listarTareas(db, {
      areaId: Number(area) || undefined,
      responsableId: responsable || undefined,
      estado: (ESTADOS_TAREA as readonly string[]).includes(estado) ? (estado as EstadoTarea) : undefined,
    }),
  ]);
  const hoy = hoyEnLaPaz(new Date());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tareas</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nueva tarea</CardTitle>
        </CardHeader>
        <CardContent>
          <FormAccion
            accion={crearTareaAction}
            enviar="Crear tarea"
            enviando="Creando…"
            exito="Tarea creada"
            limpiar
            className="space-y-4"
          >
            <TareaCampos areas={areas} usuarios={usuarios} />
          </FormAccion>
        </CardContent>
      </Card>

      <Form action="/tareas" className="flex flex-wrap items-end gap-3">
        <Campo id="filtro-area" label="Área">
          <Select id="filtro-area" name="area" defaultValue={area}>
            <option value="">Todas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="filtro-responsable" label="Responsable">
          <Select id="filtro-responsable" name="responsable" defaultValue={responsable}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="filtro-estado" label="Estado">
          <Select id="filtro-estado" name="estado" defaultValue={estado}>
            <option value="">Todos</option>
            {ESTADOS_TAREA.map((e) => (
              <option key={e} value={e}>
                {TEXTO_ESTADO_TAREA[e]}
              </option>
            ))}
          </Select>
        </Campo>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </Form>

      {tareas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay tareas con esos filtros.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tarea</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Fecha límite</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tareas.map((t) => {
              const vencida = t.estado !== "hecha" && !!t.fechaLimite && t.fechaLimite < hoy;
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/tareas/${t.id}`} className="font-medium hover:underline">
                      {t.titulo}
                    </Link>
                  </TableCell>
                  <TableCell>{t.area}</TableCell>
                  <TableCell>{t.responsable ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className={cn(vencida && "font-medium text-destructive")}>
                    {t.fechaLimite ? formatearFecha(t.fechaLimite) : "—"}
                    {vencida && " (vencida)"}
                  </TableCell>
                  <TableCell>
                    <EstadoTareaBadge estado={t.estado} />
                  </TableCell>
                  <TableCell>
                    <AccionesEstado tareaId={t.id} estado={t.estado} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
