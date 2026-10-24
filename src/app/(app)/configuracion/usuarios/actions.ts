"use server";

import type { Resultado } from "@/lib/acciones";
import { ejecutar } from "../../ejecutar";
import { altaUsuario, bajaUsuario, cambioDeRol } from "./operaciones";

export async function crearUsuarioAction(_previo: Resultado | null, formData: FormData) {
  return ejecutar(altaUsuario, formData);
}

export async function cambiarRolAction(_previo: Resultado | null, formData: FormData) {
  return ejecutar(cambioDeRol, formData);
}

export async function borrarUsuarioAction(_previo: Resultado | null, formData: FormData) {
  return ejecutar(bajaUsuario, formData);
}
