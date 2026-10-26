"use server";

import { ejecutar } from "../../ejecutar";
import { altaGrupo, altaRubro, bajaGrupo, bajaRubro, edicionGrupo, edicionRubro, movimientoGrupo } from "./operaciones";

export async function crearGrupoAction(formData: FormData) {
  return ejecutar(altaGrupo, formData);
}

export async function renombrarGrupoAction(formData: FormData) {
  return ejecutar(edicionGrupo, formData);
}

export async function moverGrupoAction(formData: FormData) {
  return ejecutar(movimientoGrupo, formData);
}

export async function borrarGrupoAction(formData: FormData) {
  return ejecutar(bajaGrupo, formData);
}

export async function crearRubroAction(formData: FormData) {
  return ejecutar(altaRubro, formData);
}

export async function editarRubroAction(formData: FormData) {
  return ejecutar(edicionRubro, formData);
}

export async function borrarRubroAction(formData: FormData) {
  return ejecutar(bajaRubro, formData);
}
