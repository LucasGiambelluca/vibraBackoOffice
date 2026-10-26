import { expect, type Page } from "@playwright/test";

// Credenciales de prueba: las crea scripts/e2e-servidor.mjs en una base descartable.
export const ADMIN = { email: "admin@e2e.test", password: "e2e-secreto-123", nombre: "Admin E2E" };

export async function ingresar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Contraseña").fill(ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: /Hola/ })).toBeVisible();
}

/** "YYYY-MM-DDTHH:mm" en hora de La Paz dentro de `minutos` (valor de un datetime-local). */
export function horaLaPaz(minutos: number): string {
  const formato = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/La_Paz",
    dateStyle: "short",
    timeStyle: "short",
  });
  return formato.format(new Date(Date.now() + minutos * 60_000)).replace(" ", "T");
}
