// QA: cuentas de plata con varias monedas, descuento de 2 días, totales del evento y del tablero.
// Los valores esperados están calculados a mano (y coinciden con src/lib/money.ts).
import type { Page } from "@playwright/test";
import {
  abrirRubro,
  crearEvento,
  crearProveedor,
  expect,
  ingresarAdmin,
  nuevaCotizacion,
  sufijo,
  tarjeta,
  test,
  abrirMenu,
} from "./qa-ayudas";

/** Celda de una cifra del evento ("Presupuestado", "Aprobado", "Pagado"). */
const cifra = (page: Page, titulo: string) =>
  page.locator("section > div").filter({ has: page.getByText(titulo, { exact: true }) });

test("totales con ARS/USD/BOB, descuento de 2 días, presupuesto, pago y desvío", async ({ page }) => {
  test.setTimeout(300_000);
  const S = sufijo();
  const EVENTO = `QA Plata ${S}`;
  const P1 = `Sonido USD ${S}`;
  const P2 = `Sonido ARS ${S}`;
  const P3 = `Luces BOB ${S}`;
  const P4 = `Pantalla ARS ${S}`;
  await ingresarAdmin(page);
  for (const p of [P1, P2, P3, P4]) await crearProveedor(page, p);

  // 1 USD = 1250,50 ARS; 1 BOB = 180 ARS (con coma decimal).
  const eventoId = await crearEvento(page, {
    nombre: EVENTO,
    rubros: { Sonido: 2, Luces: 1, Pantalla: 2 },
    usd: "1250,50",
    bob: "180",
  });

  // Sonido (2 días): USD 1000/día −10 % = USD 1.800,00 = ARS 2.250.900,00 (1800 × 1250,5).
  await abrirRubro(page, eventoId, "Sonido");
  await nuevaCotizacion(page, { proveedor: P1, moneda: "USD", descripcion: "PA en dólares", precio: "1000", descuento: "10" });
  // ARS 2.000.000/día −5 % = ARS 3.800.000,00.
  await page.keyboard.press("Escape");
  await nuevaCotizacion(page, { proveedor: P2, descripcion: "PA en pesos", precio: "2000000", descuento: "5" });
  await page.keyboard.press("Escape");
  const a = tarjeta(page, P1);
  await expect(a.getByText("USD 1.800,00")).toBeVisible();
  await expect(a.getByText("= ARS 2.250.900,00")).toBeVisible();
  await expect(a.getByText("USD 1.000,00")).toBeVisible();
  await expect(a.getByText("10 %")).toBeVisible();
  await expect(a.getByText("USD 200,00")).toBeVisible();
  await expect(a.getByText("Más barata")).toBeVisible();
  const b = tarjeta(page, P2);
  await expect(b.getByText("ARS 3.800.000,00").first()).toBeVisible();
  await expect(b.getByText("ARS 200.000,00")).toBeVisible();
  await expect(b.getByText("Más barata")).toHaveCount(0);

  // Aprobar la más barata descarta la otra.
  await a.getByRole("button", { name: "Aprobar" }).click();
  await expect(a.getByText("Aprobada", { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary").getByText(P2)).toBeVisible();

  // Presupuesto USD 2.000 y pago USD 1.800 → desvío −10 %.
  await page.getByRole("button", { name: "Editar presupuesto" }).click();
  let hoja = page.getByRole("dialog", { name: /Presupuesto ·/ });
  await hoja.getByLabel("Presupuesto objetivo").fill("2000");
  await hoja.getByLabel("Moneda del presupuesto").selectOption("USD");
  await hoja.getByRole("button", { name: "Guardar" }).click();
  await expect(hoja).toBeHidden();
  await page.getByRole("button", { name: "Registrar pago" }).click();
  hoja = page.getByRole("dialog", { name: /Pago ·/ });
  // La moneda del pago es la de la cotización recién aprobada, sin recargar.
  await expect(hoja.getByLabel("Moneda del pago")).toHaveValue("USD");
  await page.reload();
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(hoja.getByLabel("Moneda del pago"), "después de recargar").toHaveValue("USD");
  await hoja.getByLabel("Monto pagado").fill("1800");
  await hoja.getByLabel("Fecha (opcional)").fill("2027-03-01");
  await hoja.getByLabel("Nota (opcional)").fill("Transferencia");
  await hoja.getByRole("button", { name: "Guardar pago" }).click();
  await expect(hoja).toBeHidden();
  await expect(page.getByText("USD 2.000,00")).toBeVisible();
  await expect(page.getByText("01/03/2027 · Transferencia")).toBeVisible();
  await expect(page.getByText("−10 %")).toBeVisible();

  // Luces (1 día, sin descuento): BOB 3.333,33 = ARS 599.999,40 (3333,33 × 180). Presupuesto ARS 600.000 → 0 %.
  await abrirRubro(page, eventoId, "Luces");
  await page.getByRole("button", { name: "Nueva cotización" }).click();
  await expect(page.getByLabel("% de descuento por contratar 2 días")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await nuevaCotizacion(page, { proveedor: P3, moneda: "BOB", descripcion: "Parrilla", precio: "3333,33" });
  await page.keyboard.press("Escape");
  const l = tarjeta(page, P3);
  await expect(l.getByText("Total por 1 día")).toBeVisible();
  await expect(l.getByText("BOB 3.333,33").first()).toBeVisible();
  await expect(l.getByText("= ARS 599.999,40")).toBeVisible();
  await l.getByRole("button", { name: "Aprobar" }).click();
  await expect(l.getByText("Aprobada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar presupuesto" }).click();
  hoja = page.getByRole("dialog", { name: /Presupuesto ·/ });
  await hoja.getByLabel("Presupuesto objetivo").fill("600000");
  await hoja.getByRole("button", { name: "Guardar" }).click();
  await expect(hoja).toBeHidden();
  await expect(page.getByText("0 %", { exact: true })).toBeVisible();

  // Pantalla (2 días): ARS 1.234,56 −12,5 % = 2.469,12 × 0,875 = ARS 2.160,48; ahorro 308,64.
  await abrirRubro(page, eventoId, "Pantalla");
  await nuevaCotizacion(page, { proveedor: P4, descripcion: "LED", precio: "1234,56", descuento: "12,5" });
  await page.keyboard.press("Escape");
  const p = tarjeta(page, P4);
  await expect(p.getByText("ARS 2.160,48").first()).toBeVisible();
  await expect(p.getByText("ARS 308,64")).toBeVisible();
  // es-AR: el porcentaje debería usar coma decimal como el resto de los montos.
  await expect(p.getByText("12,5 %")).toBeVisible();
  await p.getByRole("button", { name: "Aprobar" }).click();
  await expect(p.getByText("Aprobada", { exact: true })).toBeVisible();

  // Totales del evento:
  //   aprobado 2.250.900 + 599.999,40 + 2.160,48 = ARS 2.853.059,88 ≈ USD 2.281,54
  //   presupuestado USD 2.000 (2.501.000) + 600.000 = ARS 3.101.000,00 ≈ USD 2.479,81
  //   pagado USD 1.800 = ARS 2.250.900,00 ≈ USD 1.800,00
  await page.goto(`/eventos/${eventoId}`);
  await expect(cifra(page, "Aprobado").getByText("ARS 2.853.059,88")).toBeVisible();
  await expect(cifra(page, "Aprobado").getByText("≈ USD 2.281,54")).toBeVisible();
  await expect(cifra(page, "Presupuestado").getByText("ARS 3.101.000,00")).toBeVisible();
  await expect(cifra(page, "Presupuestado").getByText("≈ USD 2.479,81")).toBeVisible();
  await expect(cifra(page, "Pagado").getByText("ARS 2.250.900,00")).toBeVisible();
  await expect(cifra(page, "Pagado").getByText("≈ USD 1.800,00")).toBeVisible();
  await expect(page.getByText("0 de 3")).toBeVisible();

  // Tablero: la tarjeta del evento.
  await page.goto("/");
  const card = page.locator("section").filter({ has: page.getByRole("link", { name: EVENTO, exact: true }) });
  await expect(card.getByText("ARS 2.853.059,88")).toBeVisible();
  await expect(card.getByText("≈ USD 2.281,54")).toBeVisible();
  await expect(card.getByText("ARS 3,1 M")).toBeVisible();
  await expect(card.getByText("ARS 2,3 M")).toBeVisible();
  await expect(card.getByText("100% de los rubros con cotización aprobada")).toBeVisible();

  // Pasar Pantalla a 1 día: el descuento deja de aplicar → ARS 1.234,56; el total baja 925,92.
  await abrirRubro(page, eventoId, "Pantalla");
  await page.getByRole("button", { name: "Editar presupuesto" }).click();
  hoja = page.getByRole("dialog", { name: /Presupuesto ·/ });
  await hoja.getByLabel("Días a contratar").selectOption("1");
  await hoja.getByRole("button", { name: "Guardar" }).click();
  await expect(hoja).toBeHidden();
  await expect(p.getByText("Total por 1 día")).toBeVisible();
  await expect(p.getByText("ARS 1.234,56").first()).toBeVisible();
  await page.goto(`/eventos/${eventoId}`);
  await expect(cifra(page, "Aprobado").getByText("ARS 2.852.133,96")).toBeVisible();

  // Revertir la aprobación de Sonido: deja de sumar (2.852.133,96 − 2.250.900 = 601.233,96).
  await abrirRubro(page, eventoId, "Sonido");
  await abrirMenu(page, P1);
  await a.getByRole("button", { name: "Revertir aprobación" }).click();
  await a.getByRole("button", { name: "Sí" }).click();
  await expect(a.getByText("Pendiente", { exact: true })).toBeVisible();
  await page.goto(`/eventos/${eventoId}`);
  await expect(cifra(page, "Aprobado").getByText("ARS 601.233,96")).toBeVisible();
  await expect(page.getByText("1 de 3")).toBeVisible();
});

test("montos límite: centavos, coma decimal y el máximo de 12 enteros", async ({ page }) => {
  const S = sufijo();
  const PROV = `Prov límite ${S}`;
  await ingresarAdmin(page);
  await crearProveedor(page, PROV);
  const eventoId = await crearEvento(page, { nombre: `QA Límites ${S}`, rubros: { Sonido: 2, Luces: 2 } });

  // 0,01/día con 50 %: 0,02 × 0,5 = 0,01; ahorro 0,01.
  await abrirRubro(page, eventoId, "Sonido");
  await nuevaCotizacion(page, { proveedor: PROV, descripcion: "Mínimo", precio: "0,01", descuento: "50" });
  await page.keyboard.press("Escape");
  // Total, "= ARS", precio por día y ahorro.
  await expect(tarjeta(page, PROV).getByText("ARS 0,01")).toHaveCount(4);

  // 999.999.999.999,99/día (12 enteros, el máximo) × 2 días.
  await abrirRubro(page, eventoId, "Luces");
  await nuevaCotizacion(page, { proveedor: PROV, descripcion: "Máximo", precio: "999999999999,99", descuento: "0" });
  await page.keyboard.press("Escape");
  await expect(tarjeta(page, PROV).getByText("ARS 1.999.999.999.999,98").first()).toBeVisible();
  await tarjeta(page, PROV).getByRole("button", { name: "Aprobar" }).click();
  await page.goto(`/eventos/${eventoId}`);
  await expect(cifra(page, "Aprobado").getByText("ARS 1.999.999.999.999,98")).toBeVisible();
});

test("sin tipo de cambio: se avisa en rubro, evento y tablero, y no deja cerrar hasta cargarlo", async ({ page }) => {
  const S = sufijo();
  const EVENTO = `QA Sin cambio ${S}`;
  const PROV = `Prov BOB ${S}`;
  await ingresarAdmin(page);
  await crearProveedor(page, PROV);
  const eventoId = await crearEvento(page, { nombre: EVENTO, rubros: { Sonido: 1 } });
  await abrirRubro(page, eventoId, "Sonido");
  await nuevaCotizacion(page, { proveedor: PROV, moneda: "BOB", descripcion: "En bolivianos", precio: "500" });
  await page.keyboard.press("Escape");
  await expect(tarjeta(page, PROV).getByText("= sin tipo de cambio")).toBeVisible();
  await expect(page.getByText("Hay cotizaciones en monedas sin tipo de cambio")).toBeVisible();
  await tarjeta(page, PROV).getByRole("button", { name: "Aprobar" }).click();
  await expect(tarjeta(page, PROV).getByText("Aprobada", { exact: true })).toBeVisible();

  await page.goto(`/eventos/${eventoId}`);
  await expect(cifra(page, "Aprobado").getByText("Falta el tipo de cambio de BOB")).toBeVisible();
  await page.goto("/");
  const card = page.locator("section").filter({ has: page.getByRole("link", { name: EVENTO, exact: true }) });
  await expect(card.getByText("Falta el tipo de cambio de BOB. Cargalo en los ajustes del evento.")).toBeVisible();

  await page.goto(`/eventos/${eventoId}/ajustes`);
  await expect(page.getByText("Para cerrarlo falta el tipo de cambio de BOB.")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar evento" }).click();
  await page.getByRole("button", { name: "Sí" }).click();
  await expect(page.getByText("Falta el tipo de cambio de BOB", { exact: true })).toBeVisible();

  await page.getByLabel("1 BOB en ARS").fill("181,5");
  await page.getByLabel("1 BOB en ARS").press("Enter");
  await expect(page.getByText(/Actualizado el .* por Admin E2E/)).toBeVisible();
  await page.goto(`/eventos/${eventoId}`);
  // 500 × 181,5 = 90.750,00
  await expect(cifra(page, "Aprobado").getByText("ARS 90.750,00")).toBeVisible();
  await page.goto(`/eventos/${eventoId}/ajustes`);
  await page.getByRole("button", { name: "Cerrar evento" }).click();
  await page.getByRole("button", { name: "Sí" }).click();
  await expect(page.getByText("Evento cerrado · solo lectura.")).toBeVisible();
  // Cerrado, el tipo de cambio queda fijo y se muestra.
  await expect(page.getByText("ARS 181,5")).toBeVisible();
  // Y el evento cerrado no aparece en el tablero.
  await page.goto("/");
  await expect(page.getByRole("link", { name: EVENTO, exact: true })).toHaveCount(0);
});
