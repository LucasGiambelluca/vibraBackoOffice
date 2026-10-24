"use server";

import { redirect } from "next/navigation";
import { ejecutar } from "../ejecutar";
import {
  altaRecordatorio,
  altaTarea,
  bajaRecordatorio,
  bajaTarea,
  cambioEstadoTarea,
  edicionTarea,
} from "./operaciones";

export async function crearTareaAction(formData: FormData) {
  return ejecutar(altaTarea, formData);
}

export async function editarTareaAction(formData: FormData) {
  return ejecutar(edicionTarea, formData);
}

export async function cambiarEstadoTareaAction(formData: FormData) {
  return ejecutar(cambioEstadoTarea, formData);
}

export async function borrarTareaAction(formData: FormData) {
  const resultado = await ejecutar(bajaTarea, formData);
  // Redirige en el servidor: si no, la revalidación re-renderiza la tarea borrada (404).
  if (resultado.ok) redirect("/tareas");
  return resultado;
}

export async function crearRecordatorioAction(formData: FormData) {
  return ejecutar(altaRecordatorio, formData);
}

export async function cancelarRecordatorioAction(formData: FormData) {
  return ejecutar(bajaRecordatorio, formData);
}
