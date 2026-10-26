import { z } from "zod";
import type { Db } from "@/db/client";
import { ErrorNegocio, intentar, validar, type Resultado } from "@/lib/acciones";
import { borrarArchivo, duenioSchema, subirArchivo } from "@/lib/archivos";
import { conArchivoNuevo, hayArchivo } from "@/lib/archivos-disco";
import { exigir, type Actor } from "@/lib/permissions";

// Un archivo por llamada: el cliente sube de a uno (muestra el avance y no pasa el límite del body).

export function subidaArchivo(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    exigir(actor, "editar");
    const { archivo, ...campos } = datos as Record<string, unknown>;
    const { duenioTipo, duenioId } = validar(duenioSchema, campos);
    if (!hayArchivo(archivo)) throw new ErrorNegocio("Elegí un archivo");
    await conArchivoNuevo(archivo, (guardado) =>
      subirArchivo(db, { tipo: duenioTipo, id: duenioId }, guardado!, archivo.name, actor.id),
    );
  });
}

const idSchema = z.object({ archivoId: z.string("Archivo inválido").min(1, "Archivo inválido") });

export function bajaArchivo(db: Db, actor: Actor, datos: unknown): Promise<Resultado> {
  return intentar(async () => {
    await borrarArchivo(db, actor, validar(idSchema, datos).archivoId);
  });
}
