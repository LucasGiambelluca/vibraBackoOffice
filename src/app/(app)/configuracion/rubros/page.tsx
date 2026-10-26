import { notFound } from "next/navigation";
import { Encabezado } from "@/components/encabezado";
import { BotonAccion, FormAccion } from "@/components/form-accion";
import { Hoja } from "@/components/hoja";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { can } from "@/lib/permissions";
import { listarAreas, listarRubros } from "@/lib/rubros";
import { usuarioActual } from "@/lib/session";
import { borrarRubroAction, crearRubroAction, editarRubroAction } from "./actions";
import { RubroCampos } from "./rubro-campos";

export default async function RubrosPage() {
  const yo = await usuarioActual();
  if (!can(yo.role, "configurar")) notFound();

  const [areas, rubros] = await Promise.all([listarAreas(db), listarRubros(db)]);

  return (
    <div className="space-y-5">
      <Encabezado
        volver={{ href: "/mas", texto: "Más", soloCelular: true }}
        titulo="Rubros"
        bajada="Lo que se cotiza, por área, y por cuántos días se contrata."
        acciones={
          <Hoja boton="Nuevo rubro" titulo="Nuevo rubro">
            <FormAccion accion={crearRubroAction} enviar="Crear rubro" enviando="Creando…" limpiar className="space-y-5">
              <RubroCampos areas={areas} prefijo="nuevo" />
            </FormAccion>
          </Hoja>
        }
      />

      {areas.map((a) => {
        const delArea = rubros.filter((r) => r.areaId === a.id);
        if (delArea.length === 0) return null;
        return (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle>{a.nombre}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {delArea.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-end gap-3 py-5 first:pt-0 last:pb-0">
                    <FormAccion
                      accion={editarRubroAction}
                      enviar="Guardar"
                      enviando="Guardando…"
                      exito="Guardado"
                      className="flex flex-1 flex-wrap items-end gap-3"
                    >
                      <input type="hidden" name="rubroId" value={r.id} />
                      <RubroCampos areas={areas} valores={r} prefijo={r.id} />
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
