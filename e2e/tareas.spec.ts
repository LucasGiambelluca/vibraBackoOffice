import { expect, test } from "@playwright/test";
import { ADMIN, horaLaPaz, ingresar } from "./ayudas";

test("un recordatorio manual llega a la campanita", async ({ page }) => {
  await ingresar(page);

  await page.getByRole("link", { name: "Tareas" }).click();
  await page.getByLabel("Tarea", { exact: true }).fill("Pedir permisos E2E");
  // Hay selects de Área y Responsable también en los filtros: se usan los ids del alta.
  await page.locator("#areaId").selectOption({ label: "Seguridad y Prevención" });
  await page.locator("#responsableId").selectOption({ label: ADMIN.nombre });
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await expect(page.getByText("Tarea creada")).toBeVisible();

  await page.getByRole("link", { name: "Pedir permisos E2E" }).click();
  await page.getByLabel("Recordatorio manual (hora de La Paz)").fill(horaLaPaz(1));
  await page.getByRole("button", { name: "Agregar recordatorio" }).click();
  await expect(page.getByText("Recordatorio agregado")).toBeVisible();

  // El worker de E2E corre cada 2 s; la campanita consulta al cargar la página.
  const campanitaConUna = page.getByRole("button", { name: "Notificaciones (1 sin leer)" });
  await expect(async () => {
    await page.reload();
    await expect(campanitaConUna).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 150_000, intervals: [5_000] });

  await campanitaConUna.click();
  await page.getByRole("button", { name: /Recordatorio: "Pedir permisos E2E"/ }).click();
  await expect(page).toHaveURL(/\/tareas\//);
  await expect(page.getByRole("button", { name: "Notificaciones", exact: true })).toBeVisible();
});
