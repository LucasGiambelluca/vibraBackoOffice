// QA: celular (390×844). Sin scroll horizontal y con las acciones principales a mano.
import type { Page } from "@playwright/test";
import { abrirRubro, crearEvento, crearProveedor, expect, ingresarAdmin, sufijo, tarjeta, test } from "./qa-ayudas";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function sinScrollHorizontal(page: Page, ruta: string) {
  const { ancho, visible, culpables } = await page.evaluate(() => {
    const visible = document.documentElement.clientWidth;
    const culpables = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        // Lo que está dentro de un contenedor con scroll propio (tablas, segmentos) no cuenta.
        let p = el.parentElement;
        while (p) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return false;
          p = p.parentElement;
        }
        return r.width > 0 && r.right > visible + 1;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    return { ancho: document.documentElement.scrollWidth, visible, culpables };
  });
  expect(ancho, `scroll horizontal en ${ruta}: ${culpables.join(" | ")}`).toBeLessThanOrEqual(visible);
}

test("las pantallas principales entran en 390 px y la barra inferior navega", async ({ page, monitor }) => {
  test.setTimeout(240_000);
  // Al salir, el aviso de notificaciones puede preguntar justo después de cerrar la sesión: 401 esperado.
  monitor.permitir(/status of 401 .*@ .*\/mas$/);
  const S = sufijo();
  const PROV = `Proveedor con un nombre bastante largo para celular ${S}`;
  await ingresarAdmin(page);
  await crearProveedor(page, PROV);
  const eventoId = await crearEvento(page, {
    nombre: `QA Celular con nombre largo para ver cómo corta ${S}`,
    rubros: { Sonido: 2, "Vallas freestanding": 1 },
    usd: "1000",
  });
  const rubroId = await abrirRubro(page, eventoId, "Sonido");

  // Alta de cotización desde el celular: el botón "+" está a mano y la hoja entra.
  const nueva = page.getByRole("button", { name: "Nueva cotización" });
  await expect(nueva).toBeInViewport();
  await nueva.click();
  const hoja = page.getByRole("dialog", { name: /Nueva cotización/ });
  await hoja.getByLabel("Proveedor").selectOption({ label: PROV });
  await hoja.getByLabel("Moneda").selectOption("USD");
  await hoja.getByLabel("Qué incluye").fill("Equipo de sonido completo con monitores y técnico de sala");
  await hoja.getByLabel("Precio por día").fill("123456789,99");
  await hoja.getByRole("button", { name: "Agregar cotización" }).scrollIntoViewIfNeeded();
  await hoja.getByRole("button", { name: "Agregar cotización" }).click();
  await expect(hoja).toBeHidden();
  await expect(tarjeta(page, PROV)).toBeVisible();
  await expect(tarjeta(page, PROV).getByRole("button", { name: "Aprobar" })).toBeVisible();

  const rutas = [
    "/",
    "/eventos",
    `/eventos/${eventoId}`,
    `/eventos/${eventoId}/rubros/${rubroId}`,
    `/eventos/${eventoId}/tareas`,
    `/eventos/${eventoId}/archivos`,
    `/eventos/${eventoId}/ajustes`,
    "/eventos/nuevo",
    "/proveedores",
    "/mas",
    "/cuenta",
    "/configuracion/usuarios",
    "/configuracion/grupos",
  ];
  const problemas: string[] = [];
  for (const ruta of rutas) {
    await page.goto(ruta);
    await expect(page.locator("h1").first()).toBeVisible();
    try {
      await sinScrollHorizontal(page, ruta);
    } catch (e) {
      problemas.push((e as Error).message.split("\n")[0]);
    }
  }
  expect(problemas).toEqual([]);

  // Barra inferior: 4 pestañas, visibles y navegables.
  await page.goto("/");
  const barra = page.getByRole("navigation", { name: "Principal" }).last();
  await expect(barra).toBeInViewport();
  for (const [pestana, url] of [
    ["Presupuestos", new RegExp(`/eventos/${eventoId}$`)],
    ["Tareas", new RegExp(`/eventos/${eventoId}/tareas$`)],
    ["Más", /\/mas$/],
    ["Tablero", /\/$/],
  ] as const) {
    await barra.getByRole("link", { name: pestana }).click();
    await expect(page).toHaveURL(url);
  }

  // "Más" lleva a Proveedores, Eventos, la cuenta y la administración.
  await page.goto("/mas");
  for (const link of ["Eventos", "Proveedores", "Usuarios", "Grupos y rubros"]) {
    await expect(page.getByRole("main").getByRole("link", { name: link })).toBeVisible();
  }
  await page.getByRole("main").getByRole("link", { name: "Proveedores" }).click();
  await expect(page.getByRole("heading", { name: "Proveedores", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nuevo proveedor" })).toBeInViewport();

  // Nueva tarea desde el celular.
  await page.goto(`/eventos/${eventoId}/tareas`);
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  const ht = page.getByRole("dialog", { name: /Nueva tarea/ });
  await ht.getByLabel("Tarea", { exact: true }).fill(`Tarea desde el celu ${S}`);
  await ht.locator("#grupoId").selectOption({ label: "Seguridad y Prevención" });
  await ht.getByRole("button", { name: "Crear tarea" }).scrollIntoViewIfNeeded();
  await ht.getByRole("button", { name: "Crear tarea" }).click();
  await expect(ht).toBeHidden();
  await expect(page.getByRole("link", { name: `Tarea desde el celu ${S}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Empezar" }).first()).toBeVisible();

  // Selector de evento del encabezado (solo celular).
  await expect(page.getByRole("main").getByLabel("Evento", { exact: true })).toBeVisible();

  // Salir desde "Más".
  await page.goto("/mas");
  await page.getByRole("main").getByRole("button", { name: /Salir/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  await sinScrollHorizontal(page, "/login");
});
