"use server";

import { ejecutar } from "../ejecutar";
import { lecturaNotificacion, lecturaTodas } from "./operaciones";

export async function marcarLeidaAction(formData: FormData) {
  return ejecutar(lecturaNotificacion, formData);
}

export async function marcarTodasLeidasAction(formData: FormData) {
  return ejecutar(lecturaTodas, formData);
}
