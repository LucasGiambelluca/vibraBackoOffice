import { defineConfig, devices } from "@playwright/test";

// Prueba de humo del build de producción bajo /backoffice, como en el VPS.
// Necesita un Postgres descartable (se borra entero en cada corrida):
//   E2E_DATABASE_URL=postgres://... npx playwright test -c playwright.produccion.config.ts
export default defineConfig({
  testDir: "e2e-produccion",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { trace: "retain-on-failure", locale: "es-BO" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/e2e-servidor.mjs",
    env: { E2E_PRODUCCION: "1", E2E_DATABASE_URL: process.env.E2E_DATABASE_URL ?? "" },
    url: "http://localhost:3200/backoffice/login",
    timeout: 600_000,
    reuseExistingServer: false,
  },
});
