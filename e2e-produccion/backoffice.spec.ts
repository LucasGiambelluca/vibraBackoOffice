import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

// Build de producción servido en /backoffice, como en https://rsgroupenter.com/backoffice.
const RAIZ = "http://localhost:3200";
const BASE = `${RAIZ}/backoffice`;
const ADMIN = { email: "admin@e2e.test", password: "e2e-secreto-123" };

/** Junta errores de consola, de página, respuestas >= 500 y pedidos fuera de /backoffice. */
function vigilar(page: Page) {
  const problemas: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problemas.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problemas.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) problemas.push(`HTTP ${r.status()} ${r.url()}`);
    const url = new URL(r.url());
    if (url.origin === RAIZ && !url.pathname.startsWith("/backoffice")) problemas.push(`fuera de /backoffice: ${url.pathname}`);
  });
  return problemas;
}

async function ingresar(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: /Hola/ })).toBeVisible();
  await expect(page).toHaveURL(BASE);
}

test("todo funciona bajo /backoffice: login, navegación, archivos, avisos, usuarios y salir", async ({ page, browser }) => {
  const problemas = vigilar(page);

  // Sin sesión: redirige al login de /backoffice.
  await page.goto(`${BASE}/eventos`);
  await expect(page).toHaveURL(`${BASE}/login`);

  await ingresar(page);
  // El logo (next/image) carga.
  const logo = page.getByRole("img", { name: "RS Group" }).first();
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // La campanita consulta /backoffice/api/notificaciones.
  const avisos = page.waitForResponse((r) => r.url().startsWith(`${BASE}/api/notificaciones`));
  await page.goto(`${BASE}/eventos`);
  expect((await avisos).status()).toBe(200);

  // Archivos: subir una foto y un PDF al evento, ver la foto y abrir el PDF.
  await page.getByRole("link", { name: /Vibra Bolivia 2027/ }).first().click();
  await page.getByRole("link", { name: "Archivos" }).click();
  await expect(page).toHaveURL(/\/backoffice\/eventos\/.+\/archivos$/);
  const foto = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#d4ff3a" } }).jpeg().toBuffer();
  await page.getByLabel("Elegir archivos").setInputFiles([
    { name: "escenario.jpg", mimeType: "image/jpeg", buffer: foto },
    { name: "contrato.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba") },
  ]);
  await page.getByRole("button", { name: "Ver escenario.jpg" }).click();
  const grande = page.getByRole("dialog").getByRole("img", { name: "escenario.jpg" });
  await expect(grande).toBeVisible();
  await expect.poll(() => grande.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Cerrar" }).click();
  const linkPdf = page.getByRole("link", { name: "contrato.pdf" });
  const href = await linkPdf.getAttribute("href");
  expect(href).toMatch(/^\/backoffice\/api\/archivos\//);
  const pdf = await page.request.get(`${RAIZ}${href}`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // La búsqueda de proveedores (next/form) navega dentro de /backoffice.
  await page.goto(`${BASE}/proveedores`);
  await page.getByRole("searchbox").fill("nada");
  await page.getByRole("searchbox").press("Enter");
  await expect(page).toHaveURL(/\/backoffice\/proveedores\?.*nada/);

  // Usuarios: alta, y el admin le cambia la contraseña.
  await page.goto(`${BASE}/configuracion/usuarios`);
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const alta = page.getByRole("dialog", { name: "Nuevo usuario" });
  await alta.getByLabel("Nombre").fill("Editora Prod");
  await alta.getByLabel("Email").fill("editora@e2e.test");
  await alta.getByLabel("Contraseña").fill("primera-clave-1");
  await alta.getByRole("button", { name: /Crear/ }).click();
  await expect(alta.getByText("Usuario creado")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(alta).toBeHidden();
  const fila = page.getByRole("row", { name: /Editora Prod/ });
  await expect(fila).toBeVisible();
  await fila.getByRole("button", { name: "Contraseña" }).click();
  const hoja = page.getByRole("dialog", { name: /Contraseña nueva/ });
  await hoja.getByLabel("Contraseña nueva").fill("segunda-clave-2");
  await hoja.getByRole("button", { name: "Guardar contraseña" }).click();
  // Sale bien: la hoja se cierra (y abajo entra con la contraseña nueva).
  await expect(hoja).toBeHidden();

  const otro = await browser.newPage();
  await ingresar(otro, "editora@e2e.test", "segunda-clave-2");
  await otro.close();

  // Salir vuelve al login de /backoffice.
  await page.goto(`${BASE}/mas`);
  await page.getByRole("main").getByRole("button", { name: /Salir/ }).click();
  await expect(page).toHaveURL(`${BASE}/login`);

  // Un 401 del aviso de notificaciones justo al salir es esperable.
  expect(problemas.filter((p) => !p.includes("401"))).toEqual([]);
});

test("fuera de /backoffice no hay nada, y los headers de seguridad están", async ({ request }) => {
  expect((await request.get(`${RAIZ}/login`)).status()).toBe(404);
  const r = await request.get(`${BASE}/login`);
  expect(r.status()).toBe(200);
  expect(r.headers()["x-frame-options"]).toBe("DENY");
  expect(r.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(r.headers()["x-powered-by"]).toBeUndefined();
  // Better Auth también vive bajo /backoffice, con /update-user apagado.
  expect((await request.get(`${BASE}/api/auth/get-session`)).status()).toBe(200);
  expect((await request.post(`${BASE}/api/auth/update-user`, { data: { name: "x" } })).status()).toBe(404);
});

test("el login se bloquea después de 5 intentos fallidos desde la misma IP", async ({ request }) => {
  const intento = (ip: string, password: string) =>
    request.post(`${BASE}/api/auth/sign-in/email`, {
      headers: { Origin: RAIZ, "X-Forwarded-For": ip },
      data: { email: ADMIN.email, password },
    });
  for (let i = 0; i < 5; i++) expect((await intento("203.0.113.7", "incorrecta-123")).status()).toBe(401);
  expect((await intento("203.0.113.7", "incorrecta-123")).status()).toBe(429);
  // Otra IP no queda bloqueada.
  expect((await intento("203.0.113.8", ADMIN.password)).status()).toBe(200);
});
