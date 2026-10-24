"use server";

import { ejecutar } from "../ejecutar";
import { altaCotizacion, aprobacion, bajaCotizacion, edicionCotizacion, reversion } from "./operaciones";

export async function crearCotizacionAction(formData: FormData) {
  return ejecutar(altaCotizacion, formData);
}

export async function editarCotizacionAction(formData: FormData) {
  return ejecutar(edicionCotizacion, formData);
}

export async function aprobarCotizacionAction(formData: FormData) {
  return ejecutar(aprobacion, formData);
}

export async function revertirAprobacionAction(formData: FormData) {
  return ejecutar(reversion, formData);
}

export async function borrarCotizacionAction(formData: FormData) {
  return ejecutar(bajaCotizacion, formData);
}
