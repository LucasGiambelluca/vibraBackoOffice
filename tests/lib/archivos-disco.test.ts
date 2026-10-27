import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { borrarDelDisco, conArchivoNuevo, guardarArchivo, hayArchivo, leerArchivo } from "@/lib/archivos-disco";
import { MAX_ARCHIVO } from "@/lib/limites";
import { foto, pdf, usarUploadsTemporal } from "../helpers/presupuestos";

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

describe("guardarArchivo", () => {
  it("un PDF se guarda tal cual, sin miniatura", async () => {
    const g = await guardarArchivo(pdf("%PDF-1.4 hola"));
    expect(g).toEqual({ tipo: "pdf", guardado: expect.stringMatching(/^[0-9a-f-]{36}\.pdf$/), miniatura: null, bytes: 13 });
    expect((await leerArchivo(g.guardado))?.toString()).toBe("%PDF-1.4 hola");
  });

  it("una foto se gira según la cámara, pierde los metadatos y lleva miniatura", async () => {
    // 400×200 con orientación 6 (girada 90°) y datos EXIF.
    const g = await guardarArchivo(await foto({ ancho: 400, alto: 200, orientacion: 6 }));
    expect(g).toMatchObject({ tipo: "imagen", guardado: expect.stringMatching(/\.jpg$/), miniatura: expect.stringMatching(/-min\.webp$/) });

    const guardada = await sharp(readFileSync(path.join(dir, g.guardado))).metadata();
    expect({ ancho: guardada.width, alto: guardada.height }).toEqual({ ancho: 200, alto: 400 });
    expect(guardada.exif).toBeUndefined();
    expect(guardada.orientation).toBeUndefined();
    const miniatura = await sharp(readFileSync(path.join(dir, g.miniatura!))).metadata();
    expect(miniatura).toMatchObject({ format: "webp", width: 200, height: 400 });
  });

  it("achica las fotos grandes", async () => {
    const g = await guardarArchivo(await foto({ ancho: 4000, alto: 3000, formato: "png" }));
    expect(g.guardado).toMatch(/\.png$/);
    const guardada = await sharp(readFileSync(path.join(dir, g.guardado))).metadata();
    expect({ ancho: guardada.width, alto: guardada.height }).toEqual({ ancho: 2560, alto: 1920 });
    const miniatura = await sharp(readFileSync(path.join(dir, g.miniatura!))).metadata();
    expect(miniatura.width).toBe(480);
  });

  it("decide por el contenido: un texto con nombre .jpg no pasa", async () => {
    const falso = new File(["hola"], "foto.jpg", { type: "image/jpeg" });
    await expect(guardarArchivo(falso)).rejects.toThrow("Solo se aceptan PDF o fotos (JPG, PNG o WebP)");
    const gif = new File([await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).gif().toBuffer()], "x.gif");
    await expect(guardarArchivo(gif)).rejects.toThrow("Solo se aceptan PDF o fotos (JPG, PNG o WebP)");
  });

  it("rechaza fotos de demasiados píxeles sin decodificarlas (bomba de descompresión)", async () => {
    // PNG chico al que se le cambia el tamaño declarado a 20.000 × 20.000 en el encabezado.
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    png.writeUInt32BE(20_000, 16);
    png.writeUInt32BE(20_000, 20);
    png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
    await expect(guardarArchivo(new File([png], "bomba.png"))).rejects.toThrow("La foto tiene demasiados píxeles");
  });

  it("rechaza lo que supera 10 MB", async () => {
    const grande = new File([new Uint8Array(MAX_ARCHIVO + 1)], "x.pdf");
    await expect(guardarArchivo(grande)).rejects.toThrow("El archivo supera los 10 MB");
  });
});

describe("leerArchivo / borrarDelDisco", () => {
  it("borra foto y miniatura", async () => {
    const g = await guardarArchivo(await foto());
    await borrarDelDisco([g.guardado, g.miniatura, null]);
    expect(existsSync(path.join(dir, g.guardado))).toBe(false);
    expect(existsSync(path.join(dir, g.miniatura!))).toBe(false);
  });

  it("no falla si un archivo no se puede borrar", async () => {
    const nombre = `${crypto.randomUUID()}.pdf`;
    mkdirSync(path.join(dir, nombre));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(borrarDelDisco([nombre])).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("no lee ni borra nombres que no generó (path traversal)", async () => {
    expect(await leerArchivo("../../.env.local")).toBeNull();
    expect(await leerArchivo(`${crypto.randomUUID()}.exe`)).toBeNull();
    await expect(borrarDelDisco(["../../.env.local"])).resolves.toBeUndefined();
  });
});

describe("conArchivoNuevo", () => {
  it("si la operación falla borra lo recién guardado", async () => {
    let guardado: string | null = null;
    const fallar = conArchivoNuevo(await foto(), async (g) => {
      guardado = g!.guardado;
      throw new Error("falló");
    });
    await expect(fallar).rejects.toThrow("falló");
    expect(existsSync(path.join(dir, guardado!))).toBe(false);
  });

  it("sin archivo llama con null", async () => {
    expect(await conArchivoNuevo(new File([], ""), async (g) => g)).toBeNull();
  });
});
