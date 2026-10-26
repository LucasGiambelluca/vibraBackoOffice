import { expect, test } from "@playwright/test";
import { ingresar } from "./ayudas";

test("un evento nuevo copia los rubros de otro y, cerrado, queda de solo lectura", async ({ page }) => {
  await ingresar(page);

  await page.getByRole("link", { name: "Proveedores" }).click();
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  await page.getByLabel("Nombre").fill("Luces E2E");
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(page.getByRole("link", { name: "Luces E2E" })).toBeVisible();

  // Por defecto copia los rubros del evento más reciente (Vibra Bolivia 2027, el de la migración).
  await page.getByRole("link", { name: "Eventos", exact: true }).click();
  await page.getByRole("link", { name: "Nuevo evento" }).click();
  await page.getByLabel("Nombre").fill("Fiesta E2E 2028");
  await page.getByRole("button", { name: "Crear evento" }).click();
  await expect(page.getByRole("heading", { name: "Fiesta E2E 2028" })).toBeVisible();

  await page.getByRole("link", { name: "Luces", exact: true }).click();
  await page.getByRole("button", { name: "Nueva cotización" }).click();
  await page.getByLabel("Proveedor").selectOption({ label: "Luces E2E" });
  await page.getByLabel("Qué incluye").fill("Parrilla de luces");
  await page.getByLabel("Precio por día").fill("500");
  await page.getByRole("button", { name: "Agregar cotización" }).click();
  await expect(page.getByText("Parrilla de luces")).toBeVisible();

  await page.getByRole("link", { name: "Fiesta E2E 2028" }).click();
  await page.getByRole("link", { name: "Ajustes" }).click();
  await page.getByRole("button", { name: "Cerrar evento" }).click();
  await page.getByRole("button", { name: "Sí" }).click();
  await expect(page.getByText("Evento cerrado · solo lectura.")).toBeVisible();

  await page.getByRole("link", { name: "Presupuesto", exact: true }).click();
  await page.getByRole("link", { name: "Luces", exact: true }).click();
  await expect(page.getByText("Parrilla de luces")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nueva cotización" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
});
