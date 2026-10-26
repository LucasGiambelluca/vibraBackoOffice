"use server";

import { redirect } from "next/navigation";
import { ejecutar } from "../ejecutar";
import {
  altaEvento,
  altaRubrosEvento,
  bajaRubroEvento,
  cierreEvento,
  edicionEvento,
  edicionRubroEvento,
  guardadoTipoCambio,
  reaperturaEvento,
  registroPago,
} from "./operaciones";

export async function crearEventoAction(formData: FormData) {
  const resultado = await ejecutar(altaEvento, formData);
  if (resultado.ok && "id" in resultado) redirect(`/eventos/${resultado.id}`);
  return resultado;
}

export async function editarEventoAction(formData: FormData) {
  return ejecutar(edicionEvento, formData);
}

export async function cerrarEventoAction(formData: FormData) {
  return ejecutar(cierreEvento, formData);
}

export async function reabrirEventoAction(formData: FormData) {
  return ejecutar(reaperturaEvento, formData);
}

export async function guardarTipoCambioAction(formData: FormData) {
  return ejecutar(guardadoTipoCambio, formData);
}

export async function agregarRubrosEventoAction(formData: FormData) {
  return ejecutar(altaRubrosEvento, formData);
}

export async function quitarRubroEventoAction(formData: FormData) {
  return ejecutar(bajaRubroEvento, formData);
}

export async function editarRubroEventoAction(formData: FormData) {
  return ejecutar(edicionRubroEvento, formData);
}

export async function registrarPagoAction(formData: FormData) {
  return ejecutar(registroPago, formData);
}
