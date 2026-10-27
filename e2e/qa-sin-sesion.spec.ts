// QA: sin sesión no se ve ninguna página ni se lee ninguna API (ni archivos).
import { request as nuevoRequest } from "@playwright/test";
import { abrirRubro, crearEvento, expect, fotoPng, ingresarAdmin, pdf, sufijo, test, URL_BASE } from "./qa-ayudas";

const PAGINAS = [
  "/",
  "/eventos",
  "/eventos/nuevo",
  "/presupuestos",
  "/tareas",
  "/tareas/no-existe",
  "/proveedores",
  "/proveedores/no-existe",
  "/cuenta",
  "/mas",
  "/configuracion/usuarios",
  "/configuracion/grupos",
  "/eventos/no-existe",
  "/eventos/no-existe/tareas",
  "/eventos/no-existe/archivos",
  "/eventos/no-existe/ajustes",
  "/eventos/no-existe/rubros/x",
  "/eventos/no-existe/rubros/x/y",
  "/eventos/no-existe/tareas/x",
];

test("sin sesión, cada página redirige a /login", async ({ page }) => {
  for (const ruta of PAGINAS) {
    await page.goto(ruta);
    await expect(page, `GET ${ruta}`).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  }
});

test("sin sesión, las APIs privadas responden 401 y no filtran datos", async () => {
  const anonimo = await nuevoRequest.newContext({ baseURL: URL_BASE });
  const notif = await anonimo.get("/api/notificaciones");
  expect(notif.status()).toBe(401);
  const archivo = await anonimo.get("/api/archivos/cualquiera");
  expect(archivo.status()).toBe(401);
  // Better Auth: sin cookie no hay sesión.
  const sesionApi = await anonimo.get("/api/auth/get-session");
  expect(sesionApi.status()).toBeLessThan(500);
  expect(await sesionApi.text()).not.toContain("@");
  // El alta pública de usuarios está deshabilitada.
  const alta = await anonimo.post("/api/auth/sign-up/email", {
    data: { email: `intruso-${sufijo()}@e2e.test`, password: "intruso-123456", name: "Intruso" },
    headers: { origin: URL_BASE },
  });
  expect(alta.status(), await alta.text()).toBeGreaterThanOrEqual(400);
  expect(alta.status()).toBeLessThan(500);
  // Salud: pública pero sin datos.
  const salud = await anonimo.get("/api/salud");
  expect(salud.status()).toBe(200);
  expect(await salud.json()).toEqual({ ok: true });
  await anonimo.dispose();
});

test("un archivo subido no se puede bajar sin sesión (ni su miniatura) y con sesión sí", async ({ page }) => {
  await ingresarAdmin(page);
  const eventoId = await crearEvento(page, { nombre: `QA archivos privados ${sufijo()}`, rubros: { Sonido: 1 } });
  await abrirRubro(page, eventoId, "Sonido");
  await page.getByLabel("Elegir archivos").setInputFiles([await fotoPng("privada.png"), pdf("privado.pdf")]);
  await expect(page.getByRole("link", { name: "privado.pdf" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver privada.png" })).toBeVisible();

  const hrefPdf = (await page.getByRole("link", { name: "privado.pdf" }).getAttribute("href"))!;
  const srcFoto = (await page.getByRole("button", { name: "Ver privada.png" }).locator("img").getAttribute("src"))!;

  // Con sesión: se sirve.
  expect((await page.request.get(hrefPdf)).status()).toBe(200);
  const mini = await page.request.get(srcFoto);
  expect(mini.status()).toBe(200);
  expect(mini.headers()["content-type"]).toBe("image/webp");

  // Sin sesión: 401 y nada del contenido.
  const anonimo = await nuevoRequest.newContext({ baseURL: URL_BASE });
  for (const ruta of [hrefPdf, `${hrefPdf}?descargar=1`, srcFoto]) {
    const r = await anonimo.get(ruta);
    expect(r.status(), ruta).toBe(401);
    expect(await r.text()).not.toContain("%PDF");
  }
  // Una cookie inventada tampoco sirve.
  const falsa = await nuevoRequest.newContext({
    baseURL: URL_BASE,
    extraHTTPHeaders: { cookie: "better-auth.session_token=inventado.firma" },
  });
  expect((await falsa.get(hrefPdf)).status()).toBe(401);
  await anonimo.dispose();
  await falsa.dispose();
});

test("al salir, la sesión deja de valer: las páginas vuelven a /login", async ({ page }) => {
  await ingresarAdmin(page);
  await page.goto("/mas");
  await page.getByRole("button", { name: /Salir/ }).last().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/proveedores");
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/notificaciones")).status()).toBe(401);
});

test("login con clave incorrecta muestra un error y no entra", async ({ page, monitor }) => {
  // El 401 del endpoint de login lo loguea el navegador; es la respuesta esperada.
  monitor.permitir(/status of 401/);
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@e2e.test");
  await page.getByLabel("Contraseña").fill("clave-equivocada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Email o contraseña incorrectos")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
