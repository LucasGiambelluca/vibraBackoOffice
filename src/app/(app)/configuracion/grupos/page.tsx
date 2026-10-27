import { ArrowDown, ArrowUp } from "lucide-react";
import { notFound } from "next/navigation";
import { Campo, Select } from "@/components/campos";
import { Encabezado } from "@/components/encabezado";
import { BotonAccion, FormAccion } from "@/components/form-accion";
import { Hoja } from "@/components/hoja";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { listarGrupos } from "@/lib/grupos";
import { can } from "@/lib/permissions";
import { listarRubros } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import {
  borrarGrupoAction,
  borrarRubroAction,
  crearGrupoAction,
  crearRubroAction,
  editarRubroAction,
  moverGrupoAction,
  renombrarGrupoAction,
} from "./actions";

type Grupo = { id: number; nombre: string };

/** Nombre y grupo de un rubro del catálogo. `prefijo` hace únicos los ids cuando hay un formulario por fila. */
function RubroCampos({ grupos, valores, prefijo }: { grupos: Grupo[]; valores?: { nombre: string; grupoId: number }; prefijo: string }) {
  return (
    <div className="grid flex-1 gap-4 sm:grid-cols-2">
      <Campo id={`${prefijo}-nombre`} label="Nombre">
        <Input id={`${prefijo}-nombre`} name="nombre" defaultValue={valores?.nombre} required />
      </Campo>
      <Campo id={`${prefijo}-grupo`} label="Grupo">
        <Select id={`${prefijo}-grupo`} name="grupoId" defaultValue={valores?.grupoId ?? ""} required>
          <option value="" disabled>
            Elegí un grupo
          </option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nombre}
            </option>
          ))}
        </Select>
      </Campo>
    </div>
  );
}

export default async function GruposPage() {
  const yo = await usuarioActual();
  if (!can(yo.role, "configurar")) notFound();

  const [grupos, rubros] = await Promise.all([listarGrupos(db), listarRubros(db)]);

  return (
    <div className="space-y-5">
      <Encabezado
        volver={{ href: "/mas", texto: "Más", soloCelular: true }}
        titulo="Grupos y rubros"
        bajada="El catálogo de la productora: cada evento elige qué rubros usa. Los grupos ordenan presupuestos y tareas."
        acciones={
          <>
            <Hoja boton="Nuevo grupo" titulo="Nuevo grupo">
              <FormAccion accion={crearGrupoAction} enviar="Crear grupo" enviando="Creando…" limpiar className="space-y-5">
                <Campo id="grupo-nuevo-nombre" label="Nombre">
                  <Input id="grupo-nuevo-nombre" name="nombre" required />
                </Campo>
              </FormAccion>
            </Hoja>
            <Hoja boton="Nuevo rubro" titulo="Nuevo rubro">
              <FormAccion accion={crearRubroAction} enviar="Crear rubro" enviando="Creando…" limpiar className="space-y-5">
                <RubroCampos grupos={grupos} prefijo="nuevo" />
              </FormAccion>
            </Hoja>
          </>
        }
      />

      {grupos.map((g, i) => {
        const delGrupo = rubros.filter((r) => r.grupoId === g.id);
        return (
          <Card key={g.id}>
            <div className="space-y-5 px-(--card-spacing)">
              <div className="flex flex-wrap items-end gap-3">
                <FormAccion
                  accion={renombrarGrupoAction}
                  enviar="Renombrar"
                  enviando="Guardando…"
                  exito="Guardado"
                  className="flex flex-1 flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="grupoId" value={g.id} />
                  <Campo id={`grupo-${g.id}`} label="Grupo" className="min-w-56 flex-1">
                    <Input
                      id={`grupo-${g.id}`}
                      name="nombre"
                      defaultValue={g.nombre}
                      required
                      className="font-display text-lg font-bold md:text-lg"
                    />
                  </Campo>
                </FormAccion>
                <div className="flex items-center gap-1">
                  {i > 0 && (
                    <BotonAccion
                      accion={moverGrupoAction}
                      campos={{ grupoId: String(g.id), direccion: "arriba" }}
                      texto=""
                      enviando="…"
                      variant="ghost"
                      icono={<ArrowUp aria-label={`Subir ${g.nombre}`} />}
                    />
                  )}
                  {i < grupos.length - 1 && (
                    <BotonAccion
                      accion={moverGrupoAction}
                      campos={{ grupoId: String(g.id), direccion: "abajo" }}
                      texto=""
                      enviando="…"
                      variant="ghost"
                      icono={<ArrowDown aria-label={`Bajar ${g.nombre}`} />}
                    />
                  )}
                  {delGrupo.length === 0 && (
                    <BotonAccion
                      accion={borrarGrupoAction}
                      campos={{ grupoId: String(g.id) }}
                      texto="Borrar grupo"
                      enviando="Borrando…"
                      variant="ghost"
                      confirmar
                    />
                  )}
                </div>
              </div>

              {delGrupo.length === 0 ? (
                <p className="border-t pt-4 text-sm text-muted-foreground">Sin rubros.</p>
              ) : (
                <ul className="divide-y border-t">
                  {delGrupo.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-end gap-3 py-5 last:pb-0">
                      <FormAccion
                        accion={editarRubroAction}
                        enviar="Guardar"
                        enviando="Guardando…"
                        exito="Guardado"
                        className="flex flex-1 flex-wrap items-end gap-3"
                      >
                        <input type="hidden" name="rubroId" value={r.id} />
                        <RubroCampos grupos={grupos} valores={r} prefijo={r.id} />
                      </FormAccion>
                      <BotonAccion
                        accion={borrarRubroAction}
                        campos={{ rubroId: r.id }}
                        texto="Borrar"
                        enviando="Borrando…"
                        variant="ghost"
                        confirmar
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
