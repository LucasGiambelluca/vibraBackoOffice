import { Select } from "@/components/campos";

type Grupo = { id: number; nombre: string };
type Rubro = { id: string; nombre: string; grupoId: number };

/**
 * Rubros del catálogo con un checkbox y los días de cada uno. Los nombres (`rubro-<id>`,
 * `dias-<id>`) los lee `rubrosElegidos` en eventos/operaciones.ts.
 */
export function ElegirRubros({ grupos, rubros }: { grupos: Grupo[]; rubros: Rubro[] }) {
  if (rubros.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay más rubros en el catálogo para agregar.</p>;
  }
  return (
    <div className="space-y-5">
      {grupos.map((g) => {
        const delGrupo = rubros.filter((r) => r.grupoId === g.id);
        if (delGrupo.length === 0) return null;
        return (
          <fieldset key={g.id}>
            <legend className="mb-2 text-xs font-semibold tracking-[0.08em] text-tinta-3 uppercase">{g.nombre}</legend>
            <ul className="divide-y rounded-xl ring-1 ring-border">
              {delGrupo.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3.5 py-2">
                  <input
                    type="checkbox"
                    id={`rubro-${r.id}`}
                    name={`rubro-${r.id}`}
                    className="size-5 shrink-0 accent-black"
                  />
                  <label htmlFor={`rubro-${r.id}`} className="min-w-0 flex-1 text-[0.9375rem]">
                    {r.nombre}
                  </label>
                  <label htmlFor={`dias-${r.id}`} className="sr-only">
                    Días de {r.nombre}
                  </label>
                  <Select id={`dias-${r.id}`} name={`dias-${r.id}`} defaultValue="1" className="w-28 [&_select]:h-9">
                    <option value="1">1 día</option>
                    <option value="2">2 días</option>
                  </Select>
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}
    </div>
  );
}
