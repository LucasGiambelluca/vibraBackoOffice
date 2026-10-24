"use server";

import { ejecutar } from "../ejecutar";
import { preferenciaEmails } from "./operaciones";

export async function guardarPreferenciaEmailsAction(formData: FormData) {
  return ejecutar(preferenciaEmails, formData);
}
