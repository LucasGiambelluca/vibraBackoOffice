import { Campo } from "@/components/campos";
import { Input } from "@/components/ui/input";

type Valores = { nombre: string; fechaInicio: string | null; fechaFin: string | null; lugar: string | null };

export function EventoCampos({ valores }: { valores?: Valores }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo id="nombre" label="Nombre" ayuda="Ej. Vibra Bolivia 2028" className="sm:col-span-2">
        <Input id="nombre" name="nombre" defaultValue={valores?.nombre} required />
      </Campo>
      <Campo id="fechaInicio" label="Empieza (opcional)">
        <Input id="fechaInicio" name="fechaInicio" type="date" defaultValue={valores?.fechaInicio ?? ""} />
      </Campo>
      <Campo id="fechaFin" label="Termina (opcional)">
        <Input id="fechaFin" name="fechaFin" type="date" defaultValue={valores?.fechaFin ?? ""} />
      </Campo>
      <Campo id="lugar" label="Lugar (opcional)" className="sm:col-span-2">
        <Input id="lugar" name="lugar" defaultValue={valores?.lugar ?? ""} />
      </Campo>
    </div>
  );
}
