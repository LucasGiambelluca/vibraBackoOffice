// Ayudas de las specs de QA (e2e/qa-*.spec.ts). No es una spec: Playwright no la corre sola.
import { test as base, expect as baseExpect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { ADMIN } from "./ayudas";

// En dev, la primera visita a cada ruta la compila: más margen que los 15 s del config.
export const expect = baseExpect.configure({ timeout: 30_000 });
export const URL_BASE = "http://localhost:3100";

/** Sufijo corto para que los nombres no choquen si se repite un test contra la misma base. */
export const sufijo = () => Math.random().toString(36).slice(2, 6);

type Monitor = {
  /** Errores de consola / de página / respuestas >= 500 que este test espera y no cuentan como falla. */
  permitir: (patron: RegExp) => void;
};

/**
 * `page` vigilada: falla el test si hay errores de consola, excepciones no atrapadas o
 * respuestas >= 500 (salvo las que el test declare con `monitor.permitir`).
 */
export const test = base.extend<{ monitor: Monitor }>({
  monitor: [
    async ({ page }, use, testInfo) => {
      const problemas: string[] = [];
      const permitidos: RegExp[] = [
        // Los 404 que el test pide a propósito los marca cada test; el resto de ruido conocido de dev:
        /Download the React DevTools/,
        /\[HMR\]/,
        /\[Fast Refresh\]/,
      ];
      vigilar(page, problemas);
      await use({ permitir: (p) => permitidos.push(p) });
      const reales = problemas.filter((p) => !permitidos.some((r) => r.test(p)));
      if (reales.length > 0) {
        await testInfo.attach("errores-de-consola-o-red", { body: reales.join("\n"), contentType: "text/plain" });
      }
      expect(reales, "errores de consola / página / red >= 500").toEqual([]);
    },
    { auto: true },
  ],
});

/** Junta en `problemas` lo que no debería pasar en una página. */
export function vigilar(page: Page, problemas: string[]) {
  page.on("console", (m) => {
    if (m.type() === "error") problemas.push(`console.error: ${m.text()} @ ${page.url()}`);
  });
  page.on("pageerror", (e) => problemas.push(`pageerror: ${e.message} @ ${page.url()}`));
  page.on("response", (r) => {
    if (r.status() >= 500) problemas.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
}

export async function ingresarComo(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  // El primer login de una corrida compila el tablero en dev: puede tardar.
  await expect(page.getByRole("heading", { name: /Hola/ })).toBeVisible({ timeout: 60_000 });
}

export const ingresarAdmin = (page: Page) => ingresarComo(page, ADMIN.email, ADMIN.password);

/** Un contexto nuevo (otra sesión), logueado con ese usuario. */
export async function sesion(browser: Browser, email: string, password: string, problemas?: string[]) {
  const contexto = await browser.newContext({ baseURL: URL_BASE, locale: "es-BO" });
  const page = await contexto.newPage();
  if (problemas) vigilar(page, problemas);
  await ingresarComo(page, email, password);
  return { contexto, page };
}

export type Usuario = { nombre: string; email: string; password: string; rol: "admin" | "editor" };

/** Da de alta un usuario desde Configuración › Usuarios (la `page` tiene que ser de un admin). */
export async function crearUsuario(page: Page, u: Usuario) {
  await page.goto("/configuracion/usuarios");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const hoja = page.getByRole("dialog", { name: "Nuevo usuario" });
  await hoja.getByLabel("Nombre").fill(u.nombre);
  await hoja.getByLabel("Email").fill(u.email);
  await hoja.getByLabel("Contraseña inicial").fill(u.password);
  await hoja.getByLabel("Rol").selectOption(u.rol);
  await hoja.getByRole("button", { name: "Crear usuario" }).click();
  await expect(hoja.getByText("Usuario creado")).toBeVisible();
  await page.keyboard.press("Escape");
}

export async function crearProveedor(page: Page, nombre: string) {
  await page.goto("/proveedores");
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  const hoja = page.getByRole("dialog", { name: "Nuevo proveedor" });
  await hoja.getByLabel("Nombre").fill(nombre);
  await hoja.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(page.getByRole("link", { name: nombre, exact: true })).toBeVisible();
}

/**
 * Crea un evento eligiendo rubros del catálogo. `rubros`: nombre → días.
 * Devuelve el id del evento (de la URL a la que redirige).
 */
export async function crearEvento(
  page: Page,
  datos: { nombre: string; rubros: Record<string, 1 | 2>; usd?: string; bob?: string; lugar?: string; inicio?: string; fin?: string },
): Promise<string> {
  await page.goto("/eventos/nuevo");
  await page.getByLabel("Nombre").fill(datos.nombre);
  if (datos.inicio) await page.getByLabel("Empieza (opcional)").fill(datos.inicio);
  if (datos.fin) await page.getByLabel("Termina (opcional)").fill(datos.fin);
  if (datos.lugar) await page.getByLabel("Lugar (opcional)").fill(datos.lugar);
  if (datos.usd) await page.getByLabel("1 USD en ARS (opcional)").fill(datos.usd);
  if (datos.bob) await page.getByLabel("1 BOB en ARS (opcional)").fill(datos.bob);
  await page.getByLabel("Elegirlos del catálogo").check();
  for (const [rubro, dias] of Object.entries(datos.rubros)) {
    await page.getByLabel(rubro, { exact: true }).check();
    await page.getByLabel(`Días de ${rubro}`, { exact: true }).selectOption(String(dias));
  }
  await page.getByRole("button", { name: "Crear evento" }).click();
  await expect(page.getByRole("heading", { name: datos.nombre, level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/eventos\/[^/]+$/);
  return new URL(page.url()).pathname.split("/")[2];
}

/** Abre el rubro del evento y devuelve su id (evento_rubro). */
export async function abrirRubro(page: Page, eventoId: string, rubro: string): Promise<string> {
  await page.goto(`/eventos/${eventoId}`);
  await page.getByRole("link", { name: rubro, exact: true }).click();
  await expect(page.getByRole("heading", { name: rubro, level: 1 })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[4];
}

export async function nuevaCotizacion(
  page: Page,
  c: { proveedor: string; descripcion: string; precio: string; moneda?: string; descuento?: string },
  { esperarCierre = true, enviar = true } = {},
) {
  await page.getByRole("button", { name: "Nueva cotización" }).click();
  const hoja = page.getByRole("dialog", { name: /Nueva cotización/ });
  await hoja.getByLabel("Proveedor").selectOption({ label: c.proveedor });
  if (c.moneda) await hoja.getByLabel("Moneda").selectOption(c.moneda);
  await hoja.getByLabel("Qué incluye").fill(c.descripcion);
  await hoja.getByLabel("Precio por día").fill(c.precio);
  if (c.descuento !== undefined) await hoja.getByLabel("% de descuento por contratar 2 días").fill(c.descuento);
  if (!enviar) return hoja;
  await hoja.getByRole("button", { name: "Agregar cotización" }).click();
  // Si sale bien, la hoja se cierra sola.
  if (esperarCierre) await expect(hoja).toBeHidden();
  return hoja;
}

/** La tarjeta (article) de la cotización de ese proveedor en la página del rubro. */
export const tarjeta = (page: Page, proveedor: string) =>
  page.locator("article").filter({ has: page.getByRole("link", { name: proveedor, exact: true }) });

export async function fotoPng(nombre: string, ancho = 64, alto = 48) {
  const buffer = await sharp({ create: { width: ancho, height: alto, channels: 3, background: "#d4ff3a" } })
    .png()
    .toBuffer();
  return { name: nombre, mimeType: "image/png", buffer };
}

export const pdf = (nombre: string) => ({
  name: nombre,
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4 documento de prueba"),
});

/** Una server action interceptada: se puede reenviar con otra sesión. */
export type AccionCapturada = { url: string; headers: Record<string, string>; body: Buffer };

/**
 * Hace `disparar()` en `page` e intercepta el POST de la server action SIN dejarlo llegar
 * al servidor (se aborta). Sirve para reenviarla después con otra sesión.
 */
export async function capturarAccion(page: Page, disparar: () => Promise<void>): Promise<AccionCapturada> {
  let capturada: AccionCapturada | null = null;
  const patron = (u: URL) => u.origin === URL_BASE;
  await page.route(patron, async (route) => {
    const req = route.request();
    const h = await req.allHeaders();
    if (req.method() === "POST" && h["next-action"] && !capturada) {
      capturada = { url: req.url(), headers: h, body: req.postDataBuffer() ?? Buffer.alloc(0) };
      await route.abort();
      return;
    }
    await route.continue();
  });
  await disparar();
  await expect.poll(() => capturada !== null, { timeout: 10_000 }).toBe(true);
  await page.unroute(patron);
  return capturada!;
}

/** Reenvía una server action capturada con la sesión de `request` (o sin sesión). */
export async function reenviar(request: APIRequestContext, a: AccionCapturada) {
  const headers: Record<string, string> = {
    "next-action": a.headers["next-action"],
    "content-type": a.headers["content-type"],
    accept: "text/x-component",
    origin: URL_BASE,
  };
  if (a.headers["next-router-state-tree"]) headers["next-router-state-tree"] = a.headers["next-router-state-tree"];
  const r = await request.post(a.url, { headers, data: a.body, maxRedirects: 0 });
  return { status: r.status(), texto: await r.text(), headers: r.headers() };
}

export async function cerrarContexto(c: BrowserContext) {
  await c.close().catch(() => {});
}

/** Abre el menú "…" de una cotización (si ya quedó abierto de antes, no lo cierra). */
export async function abrirMenu(page: Page, proveedor: string) {
  const resumen = page.getByLabel(`Más acciones · ${proveedor}`);
  const abierto = await resumen.evaluate((s) => (s.parentElement as HTMLDetailsElement).open);
  if (!abierto) await resumen.click();
}
