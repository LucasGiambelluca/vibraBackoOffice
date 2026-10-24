import { Campo, Select, Textarea } from "@/components/campos";
import { Input } from "@/components/ui/input";

type Valores = {
  titulo: string;
  areaId: number;
  responsableId: string | null;
  fechaLimite: string | null;
  notas: string | null;
};

export function TareaCampos({
  areas,
  usuarios,
  valores,
}: {
  areas: { id: number; nombre: string }[];
  usuarios: { id: string; name: string }[];
  valores?: Valores;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo id="titulo" label="Tarea" className="sm:col-span-2">
        <Input id="titulo" name="titulo" defaultValue={valores?.titulo} required />
      </Campo>
      <Campo id="areaId" label="Área">
        <Select id="areaId" name="areaId" defaultValue={valores?.areaId ?? ""} required>
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
      <Campo id="responsableId" label="Responsable">
        <Select id="responsableId" name="responsableId" defaultValue={valores?.responsableId ?? ""}>
          <option value="">Sin responsable (avisa a los admins)</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo id="fechaLimite" label="Fecha límite (opcional)">
        <Input id="fechaLimite" name="fechaLimite" type="date" defaultValue={valores?.fechaLimite ?? ""} />
      </Campo>
      <Campo id="notas" label="Notas" className="sm:col-span-2">
        <Textarea id="notas" name="notas" defaultValue={valores?.notas ?? ""} />
      </Campo>
    </div>
  );
}
