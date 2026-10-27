import { Campo } from "@/components/campos";
import { FormAccion } from "@/components/form-accion";
import { Hoja } from "@/components/hoja";
import { Input } from "@/components/ui/input";
import { cambiarContraseniaAction } from "./actions";

/** El admin le pone una contraseña nueva a quien la olvidó (se la pasa por otro medio). */
export function ContraseniaForm({ userId, nombre }: { userId: string; nombre: string }) {
  return (
    <Hoja boton="Contraseña" titulo={`Contraseña nueva · ${nombre}`} secundario>
      <FormAccion
        accion={cambiarContraseniaAction}
        enviar="Guardar contraseña"
        enviando="Guardando…"
        exito="Contraseña cambiada. Se cerraron sus sesiones abiertas."
        limpiar
        className="space-y-5"
      >
        <input type="hidden" name="userId" value={userId} />
        <Campo id={`password-${userId}`} label="Contraseña nueva" ayuda="Mínimo 8 caracteres. Pedile que la cambie en Mi cuenta.">
          <Input id={`password-${userId}`} name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Campo>
      </FormAccion>
    </Hoja>
  );
}
