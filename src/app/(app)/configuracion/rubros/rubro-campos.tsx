import { Campo, Select } from "@/components/campos";
import { Input } from "@/components/ui/input";

type Area = { id: number; nombre: string };
type Valores = { nombre: string; areaId: number; dias: number };

/** `prefijo` hace únicos los ids cuando hay un formulario por fila. */
export function RubroCampos({ areas, valores, prefijo }: { areas: Area[]; valores?: Valores; prefijo: string }) {
  return (
    <div className="grid flex-1 gap-4 sm:grid-cols-3">
      <Campo id={`${prefijo}-nombre`} label="Nombre">
        <Input id={`${prefijo}-nombre`} name="nombre" defaultValue={valores?.nombre} required />
      </Campo>
      <Campo id={`${prefijo}-area`} label="Área">
        <Select id={`${prefijo}-area`} name="areaId" defaultValue={valores?.areaId ?? ""} required>
          <option value="" disabled>
            Elegí un área
          </option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo id={`${prefijo}-dias`} label="Días a contratar">
        <Select id={`${prefijo}-dias`} name="dias" defaultValue={valores?.dias ?? 2}>
          <option value="1">1 día</option>
          <option value="2">2 días</option>
        </Select>
      </Campo>
    </div>
  );
}
