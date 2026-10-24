"use server";

import { ejecutar } from "../../ejecutar";
import { altaRubro, bajaRubro, edicionRubro } from "./operaciones";

export async function crearRubroAction(formData: FormData) {
  return ejecutar(altaRubro, formData);
}

export async function editarRubroAction(formData: FormData) {
  return ejecutar(edicionRubro, formData);
}

export async function borrarRubroAction(formData: FormData) {
  return ejecutar(bajaRubro, formData);
}
