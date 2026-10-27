// QA: caminos completos de cada pantalla (alta, edición, borrado) y el modo solo lectura del evento cerrado.
import type { Page } from "@playwright/test";
import {
  abrirRubro,
  cerrarContexto,
  crearEvento,
  crearProveedor,
  crearUsuario,
  expect,
  fotoPng,
  ingresarAdmin,
  ingresarComo,
  nuevaCotizacion,
  pdf,
  sesion,
  sufijo,
  tarjeta,
  test,
  type Usuario,
  abrirMenu,
} from "./qa-ayudas";
import { ADMIN, horaLaPaz } from "./ayudas";

/** Tarjeta de un grupo en Configuración › Grupos y rubros. */
const tarjetaGrupo = (page: Page, nombre: string) =>
  page.locator('[data-slot="card"]').filter({ has: page.locator(`input[name="nombre"][value="${nombre}"]`) }).first();

test("grupos y rubros: alta, renombrar, ordenar, mover rubro, borrar y protecciones", async ({ page }) => {
  const S = sufijo();
  const G1 = `Grupo QA ${S}`;
  const G1b = `Grupo QA renombrado ${S}`;
  const G2 = `Grupo QA dos ${S}`;
  const R1 = `Rubro QA ${S}`;
  const R1b = `Rubro QA editado ${S}`;
  await ingresarAdmin(page);
  await page.goto("/configuracion/grupos");

  for (const g of [G1, G2]) {
    await page.getByRole("button", { name: "Nuevo grupo" }).click();
    const hoja = page.getByRole("dialog", { name: "Nuevo grupo" });
    await hoja.getByLabel("Nombre").fill(g);
    await hoja.getByRole("button", { name: "Crear grupo" }).click();
    await expect(hoja).toBeHidden();
    await expect(page.locator(`input[value="${g}"]`)).toBeVisible();
  }
  // Los nuevos van al final, en orden de alta.
  const nombresGrupos = () => page.locator('input[id^="grupo-"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  let orden = await nombresGrupos();
  expect(orden.slice(-2)).toEqual([G1, G2]);

  // Renombrar.
  const card = tarjetaGrupo(page, G1);
  await card.locator('input[name="nombre"]').first().fill(G1b);
  await card.getByRole("button", { name: "Renombrar" }).click();
  await expect(page.getByText("Guardado").first()).toBeVisible();
  await page.reload();
  orden = await nombresGrupos();
  expect(orden.slice(-2)).toEqual([G1b, G2]);

  // Subir el último: queda antes del renombrado.
  await page.getByRole("button", { name: `Subir ${G2}` }).click();
  await expect.poll(async () => (await nombresGrupos()).slice(-2)).toEqual([G2, G1b]);
  await page.getByRole("button", { name: `Bajar ${G2}` }).click();
  await expect.poll(async () => (await nombresGrupos()).slice(-2)).toEqual([G1b, G2]);

  // Rubro nuevo en G1b; luego lo pasa a G2 y le cambia el nombre.
  await page.getByRole("button", { name: "Nuevo rubro" }).click();
  const hr = page.getByRole("dialog", { name: "Nuevo rubro" });
  await hr.getByLabel("Nombre").fill(R1);
  // El label "Grupo" apunta a su select (antes chocaba con el id del input de "Nuevo grupo").
  await expect(hr.getByLabel("Grupo")).toHaveCount(1);
  await hr.locator('select[name="grupoId"]').selectOption({ label: G1b });
  await hr.getByRole("button", { name: "Crear rubro" }).click();
  await expect(hr).toBeHidden();
  const cardG1 = tarjetaGrupo(page, G1b);
  await expect(cardG1.locator(`input[value="${R1}"]`)).toBeVisible();
  // Con rubros, el grupo no muestra "Borrar grupo".
  await expect(cardG1.getByRole("button", { name: "Borrar grupo" })).toHaveCount(0);

  const filaRubro = cardG1.locator("li").filter({ has: page.locator(`input[value="${R1}"]`) });
  await filaRubro.getByLabel("Nombre").fill(R1b);
  await filaRubro.getByLabel("Grupo").selectOption({ label: G2 });
  await filaRubro.getByRole("button", { name: "Guardar" }).click();
  await expect(tarjetaGrupo(page, G2).locator(`input[value="${R1b}"]`)).toBeVisible();
  await expect(tarjetaGrupo(page, G1b).getByText("Sin rubros.")).toBeVisible();

  // Un rubro usado en un evento no se borra.
  const eventoId = await crearEvento(page, { nombre: `QA Catálogo ${S}`, rubros: { [R1b]: 2 } });
  await page.goto(`/eventos/${eventoId}`);
  await expect(page.getByRole("link", { name: R1b, exact: true })).toBeVisible();
  await page.goto("/configuracion/grupos");
  const filaR = tarjetaGrupo(page, G2).locator("li").filter({ has: page.locator(`input[value="${R1b}"]`) });
  await filaR.getByRole("button", { name: "Borrar" }).click();
  await filaR.getByRole("button", { name: "Sí" }).click();
  await expect(filaR.getByText("El rubro se usa en algún evento: no se puede borrar")).toBeVisible();

  // Se quita del evento (sin cotizaciones) y ahí sí se puede borrar; después el grupo vacío.
  await page.goto(`/eventos/${eventoId}/ajustes`);
  const filaAjustes = page.locator("li").filter({ hasText: R1b });
  await filaAjustes.getByRole("button", { name: "Quitar" }).click();
  await filaAjustes.getByRole("button", { name: "Sí" }).click();
  await expect(page.getByText("Sin rubros todavía.")).toBeVisible();
  await page.goto("/configuracion/grupos");
  const filaR2 = tarjetaGrupo(page, G2).locator("li").filter({ has: page.locator(`input[value="${R1b}"]`) });
  await filaR2.getByRole("button", { name: "Borrar" }).click();
  await filaR2.getByRole("button", { name: "Sí" }).click();
  await expect(page.locator(`input[value="${R1b}"]`)).toHaveCount(0);
  for (const g of [G1b, G2]) {
    const c = tarjetaGrupo(page, g);
    await c.getByRole("button", { name: "Borrar grupo" }).click();
    await c.getByRole("button", { name: "Sí" }).click();
    await expect(page.locator(`input[value="${g}"]`)).toHaveCount(0);
  }
});

test("proveedores: alta completa, búsqueda, edición, borrado y protección con cotizaciones", async ({ page }) => {
  const S = sufijo();
  const P = `Proveedor Completo ${S}`;
  const P2 = `Proveedor Con Cotización ${S}`;
  await ingresarAdmin(page);
  await page.goto("/proveedores");
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  const hoja = page.getByRole("dialog", { name: "Nuevo proveedor" });
  await hoja.getByLabel("Nombre").fill(P);
  await hoja.getByLabel("Persona de contacto").fill(`Ramiro ${S}`);
  await hoja.getByLabel("Teléfono").fill("+591 71234567");
  await hoja.getByLabel("Email").fill(`ramiro-${S}@proveedor.bo`);
  await hoja.getByLabel("Notas").fill("Trabaja solo con anticipo");
  await hoja.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(hoja).toBeHidden();
  const fila = page.getByRole("row").filter({ hasText: P });
  await expect(fila.getByRole("cell", { name: `Ramiro ${S}`, exact: true })).toBeVisible();
  await expect(fila.getByRole("cell", { name: "+591 71234567", exact: true })).toBeVisible();
  await expect(fila.getByRole("cell", { name: `ramiro-${S}@proveedor.bo`, exact: true })).toBeVisible();

  // Búsqueda por nombre y por contacto (sin distinguir mayúsculas).
  const buscar = async (q: string) => {
    await page.getByRole("searchbox", { name: "Buscar" }).fill(q);
    await page.getByRole("searchbox", { name: "Buscar" }).press("Enter");
    await expect(page).toHaveURL(new RegExp(`q=`));
  };
  await buscar(`completo ${S}`.toUpperCase());
  await expect(page.getByRole("link", { name: P, exact: true })).toBeVisible();
  await buscar(`ramiro ${S}`);
  await expect(page.getByRole("link", { name: P, exact: true })).toBeVisible();
  await buscar(`no-existe-${S}`);
  await expect(page.getByText("Ningún proveedor coincide con la búsqueda.")).toBeVisible();

  // Edición: cambiar nombre y vaciar campos opcionales.
  await page.goto("/proveedores");
  await page.getByRole("link", { name: P, exact: true }).click();
  await expect(page.getByRole("heading", { name: P, level: 1 })).toBeVisible();
  await page.getByLabel("Nombre").fill(`${P} SRL`);
  await page.getByLabel("Teléfono").fill("");
  await page.getByLabel("Email").fill("");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Guardado")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: `${P} SRL`, level: 1 })).toBeVisible();
  await expect(page.getByLabel("Teléfono")).toHaveValue("");

  // Borrar (sin cotizaciones): vuelve a la lista y ya no está.
  await page.getByRole("button", { name: "Borrar" }).click();
  await page.getByRole("button", { name: "Sí" }).click();
  await expect(page).toHaveURL(/\/proveedores$/);
  await expect(page.getByRole("link", { name: `${P} SRL`, exact: true })).toHaveCount(0);

  // Con cotizaciones no se puede borrar; su página muestra la historia por evento.
  await crearProveedor(page, P2);
  const eventoId = await crearEvento(page, { nombre: `QA Historial prov ${S}`, rubros: { Sonido: 1 } });
  await abrirRubro(page, eventoId, "Sonido");
  await nuevaCotizacion(page, { proveedor: P2, descripcion: "Algo", precio: "100" });
  await page.goto("/proveedores");
  await expect(page.getByRole("row").filter({ hasText: P2 }).getByRole("cell").nth(4)).toHaveText("1");
  await page.getByRole("link", { name: P2, exact: true }).click();
  await expect(page.getByRole("heading", { name: P2, level: 1 })).toBeVisible();
  await expect(page.getByText("1 cotización", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: `QA Historial prov ${S}`, level: 3 })).toBeVisible();
  await page.getByRole("button", { name: "Borrar" }).click();
  await page.getByRole("button", { name: "Sí" }).click();
  await expect(page.getByText("El proveedor tiene cotizaciones: borralas primero")).toBeVisible();
});

test("eventos: alta con fechas y copia con presupuesto, edición, rubros, cierre de solo lectura y reapertura", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const S = sufijo();
  const EV = `QA Ciclo ${S}`;
  const EV_COPIA = `QA Ciclo copia ${S}`;
  const PROV = `Prov ciclo ${S}`;
  const TAREA = `Tarea ciclo ${S}`;
  await ingresarAdmin(page);
  await crearProveedor(page, PROV);
  const eventoId = await crearEvento(page, {
    nombre: EV,
    rubros: { Sonido: 2, Luces: 1 },
    inicio: "2027-03-05",
    fin: "2027-03-06",
    lugar: "Santa Cruz",
    usd: "1000",
  });
  await expect(page.getByText("05/03/2027 – 06/03/2027 · Santa Cruz").first()).toBeVisible();
  await page.goto("/eventos");
  await expect(page.getByRole("link", { name: new RegExp(EV) }).first()).toBeVisible();

  // Presupuesto en Sonido para probar la copia "con presupuesto".
  await abrirRubro(page, eventoId, "Sonido");
  await page.getByRole("button", { name: "Editar presupuesto" }).click();
  const hp = page.getByRole("dialog", { name: /Presupuesto ·/ });
  await hp.getByLabel("Presupuesto objetivo").fill("5000");
  await hp.getByLabel("Moneda del presupuesto").selectOption("USD");
  await hp.getByRole("button", { name: "Guardar" }).click();
  await expect(hp).toBeHidden();
  await nuevaCotizacion(page, { proveedor: PROV, descripcion: "Cot del ciclo", precio: "100" });
  const editarHref = (await tarjeta(page, PROV).getByRole("link", { name: "Editar" }).getAttribute("href"))!;

  // Copia de rubros con presupuesto (sin cotizaciones).
  await page.goto("/eventos/nuevo");
  await page.getByLabel("Nombre").fill(EV_COPIA);
  await page.getByLabel("Evento", { exact: true }).last().selectOption({ label: EV });
  await page.getByLabel("Copiar también el presupuesto").check();
  await page.getByRole("button", { name: "Crear evento" }).click();
  await expect(page.getByRole("heading", { name: EV_COPIA, level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sonido", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Luces", exact: true })).toBeVisible();
  await expect(page.getByText("USD 5.000,00")).toBeVisible();
  await expect(page.getByText("0 cotizaciones").first()).toBeVisible();

  // Ajustes: editar datos, agregar y quitar rubros.
  await page.goto(`/eventos/${eventoId}/ajustes`);
  await page.getByLabel("Lugar (opcional)").fill("La Paz");
  await page.getByRole("button", { name: "Guardar" }).first().click();
  await expect(page.getByText("Guardado").first()).toBeVisible();
  await page.getByRole("button", { name: "Agregar rubros" }).click();
  const ha = page.getByRole("dialog", { name: /Agregar rubros/ });
  await expect(ha.getByLabel("Sonido", { exact: true })).toHaveCount(0);
  await ha.getByLabel("Pantalla", { exact: true }).check();
  await ha.getByLabel("Días de Pantalla").selectOption("2");
  await ha.getByRole("button", { name: "Agregar" }).click();
  await expect(ha).toBeHidden();
  await expect(page.locator("li:visible").filter({ hasText: /^Pantalla/ }).getByText("2 días")).toBeVisible();
  // Sonido tiene cotización: no se puede quitar.
  const sonido = page.locator("li:visible").filter({ hasText: /^Sonido/ });
  await sonido.getByRole("button", { name: "Quitar" }).click();
  await sonido.getByRole("button", { name: "Sí" }).click();
  await expect(page.getByText("El rubro tiene cotizaciones: borralas primero")).toBeVisible();
  const pantalla = page.locator("li:visible").filter({ hasText: /^Pantalla/ });
  await pantalla.getByRole("button", { name: "Quitar" }).click();
  await pantalla.getByRole("button", { name: "Sí" }).click();
  await expect(page.locator("li:visible").filter({ hasText: /^Pantalla/ })).toHaveCount(0);

  // Datos de todas las secciones antes de cerrar: tarea y archivo.
  await page.goto(`/eventos/${eventoId}/tareas`);
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  await page.getByLabel("Tarea", { exact: true }).fill(TAREA);
  await page.locator("#grupoId").selectOption({ label: "Seguridad y Prevención" });
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await expect(page.getByRole("link", { name: TAREA })).toBeVisible();
  await page.goto(`/eventos/${eventoId}/archivos`);
  await page.getByLabel("Elegir archivos").setInputFiles([pdf("plano-ciclo.pdf")]);
  await expect(page.getByRole("link", { name: "plano-ciclo.pdf" })).toBeVisible();

  // Cerrar.
  await page.goto(`/eventos/${eventoId}/ajustes`);
  await page.getByRole("button", { name: "Cerrar evento" }).click();
  await page.getByRole("button", { name: "Sí" }).click();
  await expect(page.getByText("Evento cerrado · solo lectura.")).toBeVisible();
  await expect(page.getByText("Reabrí el evento para cambiar sus datos.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Agregar rubros" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Quitar" })).toHaveCount(0);

  // Solo lectura en todas las secciones.
  await page.goto(`/eventos/${eventoId}`);
  await expect(page.getByText("Evento cerrado · solo lectura.")).toBeVisible();
  const rubroId = await abrirRubro(page, eventoId, "Sonido");
  await expect(page.getByRole("button", { name: "Nueva cotización" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar presupuesto" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Registrar pago" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Subir archivos" })).toHaveCount(0);
  await expect(tarjeta(page, PROV).getByRole("link", { name: "Editar" })).toHaveCount(0);
  await expect(tarjeta(page, PROV).getByRole("button", { name: "Aprobar" })).toHaveCount(0);
  await expect(page.getByLabel(`Más acciones · ${PROV}`)).toHaveCount(0);
  // La URL de edición de una cotización redirige al rubro.
  await page.goto(editarHref);
  await expect(page).toHaveURL(new RegExp(`/rubros/${rubroId}$`));
  await page.goto(`/eventos/${eventoId}/tareas`);
  await expect(page.getByRole("button", { name: "Nueva tarea" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Empezar" })).toHaveCount(0);
  await page.getByRole("link", { name: TAREA }).click();
  await expect(page.getByRole("heading", { name: TAREA, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Borrar" })).toHaveCount(0);
  await expect(page.getByLabel("Recordatorio manual (hora de La Paz)")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Subir archivos" })).toHaveCount(0);
  await page.goto(`/eventos/${eventoId}/archivos`);
  await expect(page.getByRole("link", { name: "plano-ciclo.pdf" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Subir archivos" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Borrar" })).toHaveCount(0);
  // El tablero ya no lo muestra; la lista de eventos sí, en Historial.
  await page.goto("/");
  await expect(page.getByRole("link", { name: EV, exact: true })).toHaveCount(0);
  await page.goto("/eventos");
  await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(EV) }).first()).toBeVisible();

  // Un editor ve el aviso de que solo un admin lo reabre.
  const ed: Usuario = { nombre: `Editor ciclo ${S}`, email: `editor-ciclo-${S}@e2e.test`, password: "editor-ciclo-1", rol: "editor" };
  await crearUsuario(page, ed);
  const editor = await sesion(browser, ed.email, ed.password);
  await editor.page.goto(`/eventos/${eventoId}`);
  await expect(editor.page.getByText("Solo un admin lo puede reabrir.")).toBeVisible();
  await cerrarContexto(editor.contexto);

  // Reabrir: vuelve a ser editable.
  await page.goto(`/eventos/${eventoId}/ajustes`);
  await page.getByRole("button", { name: "Reabrir evento" }).click();
  await page.getByRole("button", { name: "Sí" }).click();
  await expect(page.getByText("Evento cerrado · solo lectura.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cerrar evento" })).toBeVisible();
  await abrirRubro(page, eventoId, "Sonido");
  await expect(page.getByRole("button", { name: "Nueva cotización" })).toBeVisible();
  await tarjeta(page, PROV).getByRole("button", { name: "Aprobar" }).click();
  await expect(tarjeta(page, PROV).getByText("Aprobada", { exact: true })).toBeVisible();
});

test("cotizaciones: aprobar descarta las demás, aprobar una descartada, revertir, editar como admin y borrar", async ({
  page,
}) => {
  const S = sufijo();
  const [A, B, C] = [`Cot A ${S}`, `Cot B ${S}`, `Cot C ${S}`];
  await ingresarAdmin(page);
  for (const p of [A, B, C]) await crearProveedor(page, p);
  const eventoId = await crearEvento(page, { nombre: `QA Cotizaciones ${S}`, rubros: { Escenario: 2 } });
  await abrirRubro(page, eventoId, "Escenario");
  await nuevaCotizacion(page, { proveedor: A, descripcion: "Escenario A", precio: "300" });
  await nuevaCotizacion(page, { proveedor: B, descripcion: "Escenario B", precio: "200" });
  await nuevaCotizacion(page, { proveedor: C, descripcion: "Escenario C", precio: "100" });
  await expect(page.getByText("3 cotizaciones")).toBeVisible();
  await expect(tarjeta(page, C).getByText("Más barata")).toBeVisible();

  await tarjeta(page, A).getByRole("button", { name: "Aprobar" }).click();
  await expect(tarjeta(page, A).getByText("Aprobada", { exact: true })).toBeVisible();
  const descartadas = page.getByRole("complementary").filter({ hasText: "Descartadas" });
  await expect(descartadas.getByText(B)).toBeVisible();
  await expect(descartadas.getByText(C)).toBeVisible();

  // Aprobar una descartada desde su menú: pasa a aprobada y A a descartada.
  await abrirMenu(page, C);
  await descartadas.getByRole("button", { name: "Aprobar" }).click();
  await expect(tarjeta(page, C).getByText("Aprobada", { exact: true })).toBeVisible();
  await expect(descartadas.getByText(A)).toBeVisible();

  // El admin edita la aprobada: sigue aprobada.
  await tarjeta(page, C).getByRole("link", { name: "Editar" }).click();
  await expect(page.getByText("Esta cotización está aprobada.")).toHaveCount(0);
  await page.getByLabel("Qué incluye").fill("Escenario C con techo");
  await page.getByLabel("Moneda").selectOption("ARS");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(tarjeta(page, C).getByText("Escenario C con techo")).toBeVisible();
  await expect(tarjeta(page, C).getByText("Aprobada", { exact: true })).toBeVisible();

  // Revertir: vuelve a pendiente; las descartadas siguen descartadas.
  await abrirMenu(page, C);
  await tarjeta(page, C).getByRole("button", { name: "Revertir aprobación" }).click();
  await tarjeta(page, C).getByRole("button", { name: "Sí" }).click();
  await expect(tarjeta(page, C).getByText("Pendiente", { exact: true })).toBeVisible();
  await expect(descartadas.getByText(A)).toBeVisible();

  // Borrar una descartada (con su adjunto) y una vigente.
  await abrirMenu(page, B);
  await descartadas.getByRole("button", { name: "Borrar" }).click();
  await descartadas.getByRole("button", { name: "Sí" }).click();
  await expect(descartadas.getByText(B)).toHaveCount(0);
  await abrirMenu(page, C);
  await tarjeta(page, C).getByRole("button", { name: "Borrar" }).click();
  await tarjeta(page, C).getByRole("button", { name: "Sí" }).click();
  await expect(tarjeta(page, C)).toHaveCount(0);
  await expect(page.getByText("1 cotización", { exact: false }).first()).toBeVisible();
});

test("tareas: alta, filtros, edición, estados, recordatorios automáticos, tablero y borrado", async ({ page }) => {
  const S = sufijo();
  const RESP: Usuario = { nombre: `Responsable ${S}`, email: `resp-${S}@e2e.test`, password: "responsable-1", rol: "editor" };
  const T1 = `Contratar seguridad ${S}`;
  const T2 = `Vencida ${S}`;
  await ingresarAdmin(page);
  await crearUsuario(page, RESP);
  const eventoId = await crearEvento(page, { nombre: `QA Pendientes ${S}`, rubros: { Sonido: 1 } });
  await page.goto(`/eventos/${eventoId}/tareas`);
  await expect(page.getByText("No hay tareas")).toBeVisible();

  const crear = async (titulo: string, grupo: string, fecha: string) => {
    await page.getByRole("button", { name: "Nueva tarea" }).click();
    const hoja = page.getByRole("dialog", { name: /Nueva tarea/ });
    await hoja.getByLabel("Tarea", { exact: true }).fill(titulo);
    await hoja.locator("#grupoId").selectOption({ label: grupo });
    // Responsable no admin: los recordatorios de estas tareas no le llegan al admin de las otras E2E.
    await hoja.locator("#responsableId").selectOption({ label: RESP.nombre });
    await hoja.getByLabel("Fecha límite (opcional)").fill(fecha);
    await hoja.getByLabel("Notas").fill(`Notas de ${titulo}`);
    await hoja.getByRole("button", { name: "Crear tarea" }).click();
    await expect(hoja).toBeHidden();
  };
  await crear(T1, "Seguridad y Prevención", "2030-06-20");
  await crear(T2, "Marketing y Audiovisual", "2024-01-10");
  await expect(page.getByRole("cell", { name: /^10\/01.* · vencida$/ })).toBeVisible();

  // Filtros por grupo, responsable y estado.
  await page.locator("#filtro-grupo").selectOption({ label: "Marketing y Audiovisual" });
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByRole("link", { name: T2 })).toBeVisible();
  await expect(page.getByRole("link", { name: T1 })).toHaveCount(0);
  await page.goto(`/eventos/${eventoId}/tareas`);
  await page.locator("#filtro-responsable").selectOption({ label: ADMIN.nombre });
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("No hay tareas con esos filtros")).toBeVisible();
  await page.goto(`/eventos/${eventoId}/tareas?estado=hecha`);
  await expect(page.getByText("No hay tareas con esos filtros")).toBeVisible();
  // Filtros basura en la URL no rompen.
  await page.goto(`/eventos/${eventoId}/tareas?estado=xx&grupo=abc&responsable=%27`);
  await expect(page.getByRole("heading", { name: `QA Pendientes ${S}`, level: 1 })).toBeVisible();

  // Detalle: recordatorios automáticos (3 días antes y el día) a las 9 de La Paz.
  await page.goto(`/eventos/${eventoId}/tareas`);
  await page.getByRole("link", { name: T1 }).click();
  await expect(page.getByRole("heading", { name: T1, level: 1 })).toBeVisible();
  await expect(page.getByText("3 días antes")).toBeVisible();
  await expect(page.getByText("Día del vencimiento")).toBeVisible();
  await expect(page.getByText("17/6/30, 9:00").or(page.getByText(/17\/0?6\/(20)?30/)).first()).toBeVisible();
  // Editar la fecha regenera los automáticos (los viejos quedan cancelados).
  await page.getByLabel("Fecha límite (opcional)").fill("2030-07-10");
  await page.getByLabel("Tarea", { exact: true }).fill(`${T1} (editada)`);
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Guardado")).toBeVisible();
  await expect(page.getByRole("heading", { name: `${T1} (editada)`, level: 1 })).toBeVisible();
  await expect(page.getByText("Cancelado", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Pendiente", { exact: true })).toHaveCount(3);

  // Estados: pendiente → en curso → hecha (cancela recordatorios) → reabrir.
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByRole("button", { name: "Empezar" })).toHaveCount(0);
  await page.getByRole("button", { name: "Marcar hecha" }).click();
  await expect(page.getByRole("button", { name: "Reabrir" })).toBeVisible();
  await expect(page.getByText("Vencía el 10/07/2030")).toBeVisible();
  await expect(page.getByLabel("Recordatorio manual (hora de La Paz)")).toHaveCount(0);
  await page.getByRole("button", { name: "Reabrir" }).click();
  await expect(page.getByRole("button", { name: "Empezar" })).toBeVisible();

  // Tablero: la vencida cuenta y aparece en Próximas tareas.
  await page.goto("/");
  await expect(page.getByRole("link", { name: new RegExp(T2) })).toBeVisible();

  // Borrar: redirige a /tareas (del último evento) y ya no está.
  await page.goto(`/eventos/${eventoId}/tareas`);
  await page.getByRole("link", { name: T2 }).click();
  await expect(page.getByRole("heading", { name: T2, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Borrar" }).first().click();
  await page.getByRole("button", { name: "Sí" }).click();
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventoId}/tareas$`));
  await expect(page.getByRole("link", { name: T2 })).toHaveCount(0);
});

test("notificaciones: un recordatorio llega al responsable y se marcan todas como leídas", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const S = sufijo();
  const RESP: Usuario = { nombre: `Notificado ${S}`, email: `notif-${S}@e2e.test`, password: "notificado-1", rol: "editor" };
  const TAREA = `Avisar ${S}`;
  const admin = await sesion(browser, ADMIN.email, ADMIN.password);
  const a = admin.page;
  await crearUsuario(a, RESP);
  const eventoId = await crearEvento(a, { nombre: `QA Notif ${S}`, rubros: { Sonido: 1 } });
  await a.goto(`/eventos/${eventoId}/tareas`);
  await a.getByRole("button", { name: "Nueva tarea" }).click();
  await a.getByLabel("Tarea", { exact: true }).fill(TAREA);
  await a.locator("#grupoId").selectOption({ label: "Seguridad y Prevención" });
  await a.locator("#responsableId").selectOption({ label: RESP.nombre });
  await a.getByRole("button", { name: "Crear tarea" }).click();
  await a.getByRole("link", { name: TAREA }).click();
  await expect(a.getByRole("heading", { name: TAREA, level: 1 })).toBeVisible();
  for (const min of [1, 2]) {
    await a.getByLabel("Recordatorio manual (hora de La Paz)").fill(horaLaPaz(min));
    await a.getByRole("button", { name: "Agregar recordatorio" }).click();
    await expect(a.getByText("Recordatorio agregado")).toBeVisible();
  }
  await cerrarContexto(admin.contexto);

  await ingresarComo(page, RESP.email, RESP.password);
  const conDos = page.getByRole("button", { name: "Notificaciones (2 sin leer)" });
  await expect(async () => {
    await page.reload();
    await expect(conDos).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 240_000, intervals: [5_000] });
  await conDos.click();
  await expect(page.getByRole("button", { name: new RegExp(`Recordatorio: "${TAREA}"`) })).toHaveCount(2);
  await page.getByRole("button", { name: "Marcar todas como leídas" }).click();
  await expect(page.getByRole("button", { name: "Notificaciones", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Notificaciones", exact: true })).toBeVisible();
  // La API devuelve solo las suyas.
  const api = await (await page.request.get("/api/notificaciones")).json();
  expect(api.noLeidas).toBe(0);
  expect(api.items.every((n: { mensaje: string }) => n.mensaje.includes(TAREA))).toBe(true);
});

test("archivos: del evento, de una tarea y de una cotización; aparecen juntos en la pestaña Archivos", async ({ page }) => {
  const S = sufijo();
  const PROV = `Prov archivos ${S}`;
  const TAREA = `Tarea con fotos ${S}`;
  await ingresarAdmin(page);
  await crearProveedor(page, PROV);
  const eventoId = await crearEvento(page, { nombre: `QA Archivos ${S}`, rubros: { Sonido: 1 } });

  await page.goto(`/eventos/${eventoId}/archivos`);
  await expect(page.getByText("Todavía no hay archivos en rubros, cotizaciones ni tareas.")).toBeVisible();
  await page.getByLabel("Elegir archivos").setInputFiles([await fotoPng("predio.png"), pdf("contrato evento.pdf")]);
  await expect(page.getByRole("button", { name: "Ver predio.png" })).toBeVisible();
  await expect(page.getByRole("link", { name: "contrato evento.pdf" })).toBeVisible();

  await page.goto(`/eventos/${eventoId}/tareas`);
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  await page.getByLabel("Tarea", { exact: true }).fill(TAREA);
  await page.locator("#grupoId").selectOption({ label: "Seguridad y Prevención" });
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await page.getByRole("link", { name: TAREA }).click();
  await expect(page.getByRole("heading", { name: TAREA, level: 1 })).toBeVisible();
  await page.getByLabel("Elegir archivos").setInputFiles([await fotoPng("vallas.png")]);
  await expect(page.getByRole("button", { name: "Ver vallas.png" })).toBeVisible();

  await abrirRubro(page, eventoId, "Sonido");
  await nuevaCotizacion(page, { proveedor: PROV, descripcion: "Con archivos", precio: "10" });
  await tarjeta(page, PROV).getByRole("link", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: "Editar cotización" })).toBeVisible();
  await page.getByLabel("Elegir archivos").setInputFiles([pdf("anexo.pdf")]);
  await expect(page.getByRole("link", { name: "anexo.pdf" })).toBeVisible();
  // Nombre de archivo con caracteres raros: se guarda tal cual y se baja bien.
  await page.getByLabel("Elegir archivos").setInputFiles([pdf(`ñandú (1) & 'copia' 🎉.pdf`)]);
  await expect(page.getByRole("link", { name: `ñandú (1) & 'copia' 🎉.pdf` })).toBeVisible();
  const href = (await page.getByRole("link", { name: `ñandú (1) & 'copia' 🎉.pdf` }).getAttribute("href"))!;
  const r = await page.request.get(`${href}?descargar=1`);
  expect(r.headers()["content-disposition"]).toContain(encodeURIComponent(`ñandú (1) & 'copia' 🎉.pdf`));
  // El adjunto aparece en la tarjeta de la cotización.
  await abrirRubro(page, eventoId, "Sonido");
  await expect(tarjeta(page, PROV).getByRole("link", { name: "anexo.pdf" })).toBeVisible();

  // Pestaña Archivos: los del evento arriba; los demás con dónde están.
  await page.goto(`/eventos/${eventoId}/archivos`);
  await expect(page.getByRole("link", { name: `Tarea ${TAREA}` })).toHaveCount(0); // las fotos no muestran "dónde" en la grilla
  await page.getByRole("button", { name: "Ver vallas.png" }).click();
  await expect(page.getByRole("dialog", { name: "vallas.png" }).getByText(`Tarea ${TAREA}`)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: `Cotización de ${PROV} · Sonido` }).first()).toBeVisible();
  await page.getByRole("link", { name: `Cotización de ${PROV} · Sonido` }).first().click();
  await expect(page.getByRole("heading", { name: "Editar cotización" })).toBeVisible();

  // Borrar la cotización borra sus archivos (y desaparecen de la pestaña).
  await abrirRubro(page, eventoId, "Sonido");
  await abrirMenu(page, PROV);
  await tarjeta(page, PROV).getByRole("button", { name: "Borrar" }).click();
  await tarjeta(page, PROV).getByRole("button", { name: "Sí" }).click();
  await expect(tarjeta(page, PROV)).toHaveCount(0);
  await page.goto(`/eventos/${eventoId}/archivos`);
  await expect(page.getByRole("link", { name: "anexo.pdf" })).toHaveCount(0);
  expect((await page.request.get(href)).status()).toBe(404);

  // Borrar un archivo del evento.
  await page.locator("li").filter({ hasText: "contrato evento.pdf" }).getByRole("button", { name: "Borrar" }).click();
  await page.locator("li").filter({ hasText: "contrato evento.pdf" }).getByRole("button", { name: "Sí" }).click();
  await expect(page.getByRole("link", { name: "contrato evento.pdf" })).toHaveCount(0);
});
