import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { borrarPdf, conPdfNuevo, guardarPdf, hayArchivo, leerPdf } from "@/lib/adjuntos";
import { MAX_ADJUNTO } from "@/lib/limites";
import { pdf, usarUploadsTemporal } from "../helpers/presupuestos";

let dir: string;
beforeEach(() => {
  dir = usarUploadsTemporal();
});

describe("hayArchivo", () => {
  it("un input file vacío no cuenta", () => {
    expect(hayArchivo(new File([], ""))).toBe(false);
    expect(hayArchivo("texto")).toBe(false);
    expect(hayArchivo(pdf())).toBe(true);
  });
});

describe("guardarPdf / leerPdf / borrarPdf", () => {
  it("guarda con nombre aleatorio, lo lee y lo borra", async () => {
    const nombre = await guardarPdf(pdf("%PDF-1.4 hola"));
    expect(nombre).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect((await leerPdf(nombre))?.toString()).toBe("%PDF-1.4 hola");

    await borrarPdf(nombre);
    expect(existsSync(path.join(dir, nombre))).toBe(false);
    expect(await leerPdf(nombre)).toBeNull();
  });

  it("rechaza lo que no es PDF y lo que supera 10 MB", async () => {
    await expect(guardarPdf(new File(["hola"], "x.pdf"))).rejects.toThrow("El adjunto debe ser un PDF");
    const grande = new File([new Uint8Array(MAX_ADJUNTO + 1)], "x.pdf");
    await expect(guardarPdf(grande)).rejects.toThrow("El adjunto supera los 10 MB");
  });

  it("borrarPdf no falla si el archivo no se puede borrar", async () => {
    const nombre = `${crypto.randomUUID()}.pdf`;
    mkdirSync(path.join(dir, nombre));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(borrarPdf(nombre)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("no lee nombres que no generó (path traversal)", async () => {
    expect(await leerPdf("../../.env.local")).toBeNull();
    await expect(borrarPdf("../../.env.local")).resolves.toBeUndefined();
  });
});

describe("conPdfNuevo", () => {
  it("si la operación falla borra el PDF recién guardado", async () => {
    let guardado: string | null = null;
    const fallar = conPdfNuevo(pdf(), async (nombre) => {
      guardado = nombre;
      throw new Error("falló");
    });
    await expect(fallar).rejects.toThrow("falló");
    expect(existsSync(path.join(dir, guardado!))).toBe(false);
  });

  it("sin archivo llama con null", async () => {
    let recibido: string | null | undefined;
    await conPdfNuevo(new File([], ""), async (nombre) => {
      recibido = nombre;
    });
    expect(recibido).toBeNull();
  });
});
