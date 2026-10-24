import { FormAccion } from "@/components/form-accion";
import { guardarPreferenciaEmailsAction } from "./actions";

export function EmailsForm({ recibirEmails }: { recibirEmails: boolean }) {
  return (
    <FormAccion
      accion={guardarPreferenciaEmailsAction}
      enviar="Guardar"
      enviando="Guardando…"
      exito="Guardado"
      className="max-w-sm space-y-4"
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="recibirEmails" defaultChecked={recibirEmails} />
        Recibir los recordatorios de tareas por email
      </label>
    </FormAccion>
  );
}
