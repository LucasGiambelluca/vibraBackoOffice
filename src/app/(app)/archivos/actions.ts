"use server";

import { ejecutar } from "../ejecutar";
import { bajaArchivo, subidaArchivo } from "./operaciones";

export async function subirArchivoAction(formData: FormData) {
  return ejecutar(subidaArchivo, formData);
}

export async function borrarArchivoAction(formData: FormData) {
  return ejecutar(bajaArchivo, formData);
}
