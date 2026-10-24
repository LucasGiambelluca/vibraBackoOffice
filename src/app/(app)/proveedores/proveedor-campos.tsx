import { Campo, Textarea } from "@/components/campos";
import { Input } from "@/components/ui/input";

type Valores = { nombre: string; contacto: string | null; telefono: string | null; email: string | null; notas: string | null };

export function ProveedorCampos({ valores }: { valores?: Valores }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo id="nombre" label="Nombre">
        <Input id="nombre" name="nombre" defaultValue={valores?.nombre} required />
      </Campo>
      <Campo id="contacto" label="Persona de contacto">
        <Input id="contacto" name="contacto" defaultValue={valores?.contacto ?? ""} />
      </Campo>
      <Campo id="telefono" label="Teléfono">
        <Input id="telefono" name="telefono" type="tel" defaultValue={valores?.telefono ?? ""} />
      </Campo>
      <Campo id="email" label="Email">
        <Input id="email" name="email" type="email" defaultValue={valores?.email ?? ""} />
      </Campo>
      <Campo id="notas" label="Notas" className="sm:col-span-2">
        <Textarea id="notas" name="notas" defaultValue={valores?.notas ?? ""} />
      </Campo>
    </div>
  );
}
