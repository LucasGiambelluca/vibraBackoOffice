import { expect, test } from "@playwright/test";
import { ingresar } from "./ayudas";

test("cargar y aprobar una cotización suma al total del evento", async ({ page }) => {
  await ingresar(page);

  await page.getByRole("link", { name: "Proveedores" }).click();
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  await page.getByLabel("Nombre").fill("Sonido E2E");
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  // La hoja se cierra al crear y el proveedor aparece en la lista.
  await expect(page.getByRole("link", { name: "Sonido E2E" })).toBeVisible();

  await page.getByRole("link", { name: "Presupuestos" }).click();
  await page.getByRole("link", { name: "Sonido", exact: true }).click();
  await page.getByRole("button", { name: "Nueva cotización" }).click();
  await page.getByLabel("Proveedor").selectOption({ label: "Sonido E2E" });
  await page.getByLabel("Qué incluye").fill("PA completo");
  await page.getByLabel("Precio por día").fill("1000");
  await page.getByLabel("% de descuento por contratar 2 días").fill("10");
  await page.getByRole("button", { name: "Agregar cotización" }).click();
  await expect(page.getByText("PA completo")).toBeVisible();

  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText("Aprobada", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Tablero" }).click();
  await expect(page.getByText("BOB 1.800,00").first()).toBeVisible();
});
