import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { ingresar } from "./ayudas";

const PDF = { name: "plano.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 plano del predio") };

async function fotoPng(nombre: string) {
  const buffer = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#d4ff3a" } })
    .png()
    .toBuffer();
  return { name: nombre, mimeType: "image/png", buffer };
}

test("se suben fotos y PDF a un rubro, se ven en el visor y en la pestaña Archivos, y se borran", async ({ page }) => {
  await ingresar(page);
  await page.getByRole("link", { name: "Presupuestos" }).first().click();
  await page.getByRole("link", { name: "Sonido", exact: true }).click();

  await page.getByLabel("Elegir archivos").setInputFiles([await fotoPng("escenario.png"), await fotoPng("consola.png"), PDF]);
  await expect(page.getByRole("button", { name: "Ver escenario.png" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver consola.png" })).toBeVisible();
  await expect(page.getByRole("link", { name: "plano.pdf" })).toBeVisible();

  // El PDF se sirve con sesión y con su tipo.
  const href = await page.getByRole("link", { name: "plano.pdf" }).getAttribute("href");
  const respuesta = await page.request.get(href!);
  expect(respuesta.headers()["content-type"]).toBe("application/pdf");

  // Visor: abre en la foto elegida, pasa con el teclado y cierra con Esc.
  await page.getByRole("button", { name: "Ver escenario.png" }).click();
  const visor = page.getByRole("dialog");
  await expect(visor.getByText("1 de 2")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(visor.getByRole("img", { name: "consola.png" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(visor).toHaveCount(0);

  // Pestaña Archivos del evento: muestra dónde está cada uno.
  await page.getByRole("link", { name: "Vibra Bolivia 2027" }).first().click();
  await page.getByRole("link", { name: "Archivos", exact: true }).click();
  await expect(page.getByRole("link", { name: "Rubro Sonido" })).toBeVisible();

  await page.getByRole("button", { name: "Borrar" }).click();
  await page.getByRole("button", { name: "Sí" }).click();
  await expect(page.getByRole("link", { name: "plano.pdf" })).toHaveCount(0);
});

test("el PDF de una cotización nueva queda adjunto a la cotización", async ({ page }) => {
  await ingresar(page);
  await page.getByRole("link", { name: "Proveedores" }).click();
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  await page.getByLabel("Nombre").fill("Pantallas E2E");
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(page.getByRole("link", { name: "Pantallas E2E" })).toBeVisible();

  await page.getByRole("link", { name: "Presupuestos" }).first().click();
  await page.getByRole("link", { name: "Pantalla", exact: true }).click();
  await page.getByRole("button", { name: "Nueva cotización" }).click();
  await page.getByLabel("PDF o foto de la cotización").setInputFiles({ ...PDF, name: "cotizacion-pantallas.pdf" });
  // Sin MINIMAX_API_KEY el PDF no se lee con IA.
  await expect(page.getByText("Leyendo el PDF")).toHaveCount(0);
  await page.getByLabel("Proveedor").selectOption({ label: "Pantallas E2E" });
  await page.getByLabel("Qué incluye").fill("Pantalla 6x4");
  await page.getByLabel("Precio por día").fill("1000");
  await page.getByRole("button", { name: "Agregar cotización" }).click();
  await expect(page.getByRole("link", { name: "cotizacion-pantallas.pdf" })).toBeVisible();
});
