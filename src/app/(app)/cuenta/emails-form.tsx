import { FormAccion } from "@/components/form-accion";
import { guardarPreferenciaEmailsAction } from "./actions";

export function EmailsForm({ recibirEmails }: { recibirEmails: boolean }) {
  return (
    <FormAccion
      accion={guardarPreferenciaEmailsAction}
      enviar="Guardar"
      enviando="Guardando…"
      exito="Guardado"
      className="space-y-4"
    >
      <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
        <span>
          <span className="block font-medium">Recibir los recordatorios de tareas por email</span>
          <span className="block text-sm text-tinta-3">La campanita avisa igual, aunque lo apagues.</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          name="recibirEmails"
          defaultChecked={recibirEmails}
          className="relative h-[1.875rem] w-[3.125rem] shrink-0 cursor-pointer appearance-none rounded-full bg-[#e2e2de] transition-colors duration-200 outline-none before:absolute before:top-0.5 before:left-0.5 before:size-[1.625rem] before:rounded-full before:bg-white before:shadow-[0_2px_4px_rgb(0_0_0/0.2)] before:transition-transform before:duration-200 checked:bg-marca checked:before:translate-x-5 focus-visible:ring-3 focus-visible:ring-marca/40"
        />
      </label>
    </FormAccion>
  );
}
