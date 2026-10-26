import { Campo, Select, Textarea } from "@/components/campos";
import { Input } from "@/components/ui/input";
import { MONEDAS } from "@/lib/money";

type Valores = { proveedorId: string; descripcion: string; moneda: string; precioDia: string; descuento2Dias: string };

/** Si el rubro es de 1 día no se pide descuento (no aplica al total). */
export function CotizacionCampos({
  proveedores,
  dias,
  valores,
}: {
  proveedores: { id: string; nombre: string }[];
  dias: number;
  valores?: Valores;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo id="proveedorId" label="Proveedor">
        <Select id="proveedorId" name="proveedorId" defaultValue={valores?.proveedorId ?? ""} required>
          <option value="" disabled>
            Elegí un proveedor
          </option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo id="moneda" label="Moneda">
        <Select id="moneda" name="moneda" defaultValue={valores?.moneda ?? "ARS"}>
          {MONEDAS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo id="descripcion" label="Qué incluye" className="sm:col-span-2">
        <Textarea id="descripcion" name="descripcion" defaultValue={valores?.descripcion} required />
      </Campo>
      <Campo id="precioDia" label="Precio por día">
        <Input id="precioDia" name="precioDia" inputMode="decimal" defaultValue={valores?.precioDia} required />
      </Campo>
      {dias === 2 ? (
        <Campo id="descuento2Dias" label="% de descuento por contratar 2 días">
          <Input
            id="descuento2Dias"
            name="descuento2Dias"
            inputMode="decimal"
            defaultValue={valores?.descuento2Dias ?? "0"}
          />
        </Campo>
      ) : (
        <input type="hidden" name="descuento2Dias" value={valores?.descuento2Dias ?? "0"} />
      )}
      <Campo id="adjunto" label="Cotización en PDF (opcional, hasta 10 MB)" className="sm:col-span-2">
        <Input id="adjunto" name="adjunto" type="file" accept="application/pdf" />
      </Campo>
    </div>
  );
}
