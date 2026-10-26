import Form from "next/form";
import Link from "next/link";
import { Campo, Select } from "@/components/campos";
import { Encabezado } from "@/components/encabezado";
import { EstadoTareaBadge } from "@/components/estado-tarea";
import { FormAccion } from "@/components/form-accion";
import { Hoja } from "@/components/hoja";
import { Segmentos } from "@/components/segmentos";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { fechaCorta, hoyEnLaPaz } from "@/lib/reminders";
import { listarAreas } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import { ESTADOS_TAREA, listarTareas, type EstadoTarea } from "@/lib/tareas";
import { listarUsuarios } from "@/lib/users";
import { cn } from "@/lib/utils";
import { AccionesEstado } from "./acciones-estado";
import { crearTareaAction } from "./actions";
import { TareaCampos } from "./tarea-campos";

const texto = (valor: string | string[] | undefined) => (typeof valor === "string" ? valor : "");

const PESTANA: Record<EstadoTarea, string> = { pendiente: "Pendientes", en_curso: "En curso", hecha: "Hechas" };

export default async function TareasPage({ searchParams }: PageProps<"/tareas">) {
  await usuarioActual();
  const filtros = await searchParams;
  const area = texto(filtros.area);
  const responsable = texto(filtros.responsable);
  const estado = (ESTADOS_TAREA as readonly string[]).includes(texto(filtros.estado))
    ? (texto(filtros.estado) as EstadoTarea)
    : undefined;

  // El estado se filtra acá para poder contar las tareas de cada pestaña.
  const [areas, usuarios, todas] = await Promise.all([
    listarAreas(db),
    listarUsuarios(db),
    listarTareas(db, { areaId: Number(area) || undefined, responsableId: responsable || undefined }),
  ]);
  const tareas = estado ? todas.filter((t) => t.estado === estado) : todas;
  const hoy = hoyEnLaPaz(new Date());

  function enlace(nuevo: EstadoTarea | undefined) {
    const params = new URLSearchParams();
    if (nuevo) params.set("estado", nuevo);
    if (area) params.set("area", area);
    if (responsable) params.set("responsable", responsable);
    const consulta = params.toString();
    return consulta ? `/tareas?${consulta}` : "/tareas";
  }

  return (
    <div>
      <Encabezado
        titulo="Tareas"
        bajada="El to-do general del evento. Con fecha límite, el sistema recuerda solo."
        acciones={
          <Hoja boton="Nueva tarea" titulo="Nueva tarea" abierta={texto(filtros.nueva) === "1"}>
            <FormAccion
              accion={crearTareaAction}
              enviar="Crear tarea"
              enviando="Creando…"
              exito="Tarea creada"
              limpiar
              className="space-y-5"
            >
              <TareaCampos areas={areas} usuarios={usuarios} />
            </FormAccion>
          </Hoja>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Segmentos
          etiqueta="Estado"
          items={[
            { href: enlace(undefined), texto: "Todas", cantidad: todas.length, activo: !estado },
            ...ESTADOS_TAREA.map((e) => ({
              href: enlace(e),
              texto: PESTANA[e],
              cantidad: todas.filter((t) => t.estado === e).length,
              activo: estado === e,
            })),
          ]}
        />
        <Form action="/tareas" className="grid grid-cols-2 items-end gap-2 sm:flex">
          {estado && <input type="hidden" name="estado" value={estado} />}
          <Campo id="filtro-area" label="Área" className="space-y-1 [&_label]:text-xs [&_label]:text-tinta-3">
            <Select id="filtro-area" name="area" defaultValue={area} className="sm:w-48">
              <option value="">Todas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo
            id="filtro-responsable"
            label="Responsable"
            className="space-y-1 [&_label]:text-xs [&_label]:text-tinta-3"
          >
            <Select id="filtro-responsable" name="responsable" defaultValue={responsable} className="sm:w-44">
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Campo>
          <Button type="submit" variant="outline" className="h-11 max-sm:col-span-2">
            Filtrar
          </Button>
        </Form>
      </div>

      {tareas.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
          <p className="font-display text-lg font-bold">No hay tareas{estado || area || responsable ? " con esos filtros" : ""}</p>
          <p className="mt-1 text-sm text-muted-foreground">Creá una con “Nueva tarea”.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-card px-1 py-2 ring-1 ring-border md:px-3">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tarea</TableHead>
                <TableHead className="max-lg:hidden">Área</TableHead>
                <TableHead className="max-lg:hidden">Responsable</TableHead>
                <TableHead className="max-md:hidden">Fecha límite</TableHead>
                <TableHead className="max-sm:hidden">Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tareas.map((t) => {
                const vencida = t.estado !== "hecha" && !!t.fechaLimite && t.fechaLimite < hoy;
                const fecha = t.fechaLimite ? `${fechaCorta(t.fechaLimite)}${vencida ? " · vencida" : ""}` : "—";
                return (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-normal">
                      <Link href={`/tareas/${t.id}`} className="font-semibold hover:underline">
                        {t.titulo}
                      </Link>
                      {t.notas && <span className="block max-w-xs truncate text-xs text-tinta-3 max-md:hidden">{t.notas}</span>}
                      <span className="block text-xs text-tinta-3 lg:hidden">
                        <span className={cn("md:hidden", vencida && "font-semibold text-peligro")}>{fecha} · </span>
                        {t.area}
                        {t.responsable && ` · ${t.responsable}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-lg:hidden">{t.area}</TableCell>
                    <TableCell className="text-muted-foreground max-lg:hidden">
                      {t.responsable ?? <span className="text-tinta-3">—</span>}
                    </TableCell>
                    <TableCell className={cn("tabular-nums max-md:hidden", vencida && "font-semibold text-peligro")}>
                      {fecha}
                    </TableCell>
                    <TableCell className="max-sm:hidden">
                      <EstadoTareaBadge estado={t.estado} />
                    </TableCell>
                    <TableCell>
                      <AccionesEstado tareaId={t.id} estado={t.estado} compacto />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
