import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // El test de recordatorios espera al worker (hasta ~2 minutos por la precisión de minutos).
  timeout: 240_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", locale: "es-BO" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/e2e-servidor.mjs",
    url: "http://localhost:3100/login",
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
