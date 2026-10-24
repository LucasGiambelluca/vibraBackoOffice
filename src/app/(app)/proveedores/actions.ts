"use server";

import { redirect } from "next/navigation";
import { ejecutar } from "../ejecutar";
import { altaProveedor, bajaProveedor, edicionProveedor } from "./operaciones";

export async function crearProveedorAction(formData: FormData) {
  return ejecutar(altaProveedor, formData);
}

export async function editarProveedorAction(formData: FormData) {
  return ejecutar(edicionProveedor, formData);
}

/**
 * Se borra desde la página del proveedor: si saliera bien y el cliente navegara después,
 * la revalidación re-renderizaría esa página ya inexistente (404). Por eso redirige el servidor.
 */
export async function borrarProveedorAction(formData: FormData) {
  const resultado = await ejecutar(bajaProveedor, formData);
  if (resultado.ok) redirect("/proveedores");
  return resultado;
}
