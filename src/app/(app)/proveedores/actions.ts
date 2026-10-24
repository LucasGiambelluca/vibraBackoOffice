"use server";

import { ejecutar } from "../ejecutar";
import { altaProveedor, bajaProveedor, edicionProveedor } from "./operaciones";

export async function crearProveedorAction(formData: FormData) {
  return ejecutar(altaProveedor, formData);
}

export async function editarProveedorAction(formData: FormData) {
  return ejecutar(edicionProveedor, formData);
}

export async function borrarProveedorAction(formData: FormData) {
  return ejecutar(bajaProveedor, formData);
}
