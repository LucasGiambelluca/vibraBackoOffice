"use server";

import { ejecutar } from "../../ejecutar";
import { actualizacionTipoCambio } from "./operaciones";

export async function guardarTipoCambioAction(formData: FormData) {
  return ejecutar(actualizacionTipoCambio, formData);
}
