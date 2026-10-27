// QA: matriz de roles (admin / editor; no existe un rol "lector") en la UI y en el servidor.
import { request as nuevoRequest, type Page } from "@playwright/test";
import {
  abrirRubro,
  capturarAccion,
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
  reenviar,
  sesion,
  sufijo,
  tarjeta,
  test,
  URL_BASE,
  type AccionCapturada,
  type Usuario,
  abrirMenu,
} from "./qa-ayudas";
import { ADMIN } from "./ayudas";

test.describe.configure({ mode: "serial" });

const S = sufijo();
const EDITOR: Usuario = { nombre: `Editora QA ${S}`, email: `editora-${S}@e2e.test`, password: "editora-123", rol: "editor" };
const EVENTO = `QA Roles ${S}`;
const PROV_ADMIN = `Prov Admin ${S}`;
const PROV_EDITOR = `Prov Editora ${S}`;
const TAREA_ADMIN = `Tarea del admin ${S}`;
const TAREA_EDITOR = `Tarea de la editora ${S}`;

let eventoId = "";
let rubroId = "";

const NO_PERMISO = /No ten.s permiso para hacer esto/;

async function noEncontrada(page: Page, ruta: string) {
  const r = await page.goto(ruta);
  expect(r?.status(), `GET ${ruta}`).toBe(404);
  await expect(page.getByText(/could not be found|no se encontr/i).first()).toBeVisible();
}

test("admin da de alta usuarios: validaciones del formulario y del servidor", async ({ page }) => {
  await ingresarAdmin(page);
  await crearUsuario(page, EDITOR);
  await expect(page.getByText(EDITOR.email)).toBeVisible();

  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const hoja = page.getByRole("dialog", { name: "Nuevo usuario" });
  // Saltea la validación del navegador para probar la del servidor.
  await hoja.locator("form").evaluate((f: HTMLFormElement) => (f.noValidate = true));

  const intentar = async (nombre: string, email: string, password: string, error: RegExp) => {
    await hoja.getByLabel("Nombre").fill(nombre);
    await hoja.getByLabel("Email").fill(email);
    await hoja.getByLabel("Contraseña inicial").fill(password);
    await hoja.getByRole("button", { name: "Crear usuario" }).click();
    await expect(hoja.getByText(error)).toBeVisible();
  };
  await intentar("Otra", EDITOR.email.toUpperCase(), "clave-larga-1", /Ya existe un usuario con ese email/);
  await intentar("Otra", `corta-${S}@e2e.test`, "1234567", /al menos 8 caracteres/);
  await intentar("Otra", "no-es-un-email", "clave-larga-1", /Email inválido/);
  await intentar("", `vacio-${S}@e2e.test`, "clave-larga-1", /nombre es muy corto/);
  await intentar("Otra", `larga-${S}@e2e.test`, "x".repeat(129), /más de 128/);
});

test("editor: no ve administración ni acciones de admin; las páginas de admin dan 404", async ({ page, browser, monitor }) => {
  monitor.permitir(/status of 404/);
  // El admin prepara un evento con datos suyos.
  const admin = await sesion(browser, ADMIN.email, ADMIN.password);
  eventoId = await crearEvento(admin.page, { nombre: EVENTO, rubros: { Sonido: 2, Luces: 1 } });
  await crearProveedor(admin.page, PROV_ADMIN);
  rubroId = await abrirRubro(admin.page, eventoId, "Sonido");
  await nuevaCotizacion(admin.page, { proveedor: PROV_ADMIN, descripcion: "Cotización del admin", precio: "1000" });
  await expect(tarjeta(admin.page, PROV_ADMIN)).toBeVisible();
  await admin.page.getByLabel("Elegir archivos").setInputFiles([pdf("del-admin.pdf")]);
  await expect(admin.page.getByRole("link", { name: "del-admin.pdf" })).toBeVisible();
  await admin.page.goto(`/eventos/${eventoId}/tareas`);
  await admin.page.getByRole("button", { name: "Nueva tarea" }).click();
  await admin.page.getByLabel("Tarea", { exact: true }).fill(TAREA_ADMIN);
  await admin.page.locator("#grupoId").selectOption({ label: "Seguridad y Prevención" });
  await admin.page.getByRole("button", { name: "Crear tarea" }).click();
  await expect(admin.page.getByRole("link", { name: TAREA_ADMIN })).toBeVisible();
  await cerrarContexto(admin.contexto);

  await ingresarComo(page, EDITOR.email, EDITOR.password);
  await expect(page.getByText("Editor · Mi cuenta").first()).toBeVisible();
  await expect(page.getByText("Administración")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Grupos y rubros" })).toHaveCount(0);

  await page.goto("/eventos");
  await expect(page.getByRole("heading", { name: "Eventos", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nuevo evento" })).toHaveCount(0);

  await page.goto(`/eventos/${eventoId}`);
  await expect(page.getByRole("link", { name: "Ajustes" })).toHaveCount(0);

  await page.goto(`/eventos/${eventoId}/rubros/${rubroId}`);
  const t = tarjeta(page, PROV_ADMIN);
  await expect(t).toBeVisible();
  await expect(t.getByRole("button", { name: "Aprobar" })).toHaveCount(0);
  await expect(t.getByRole("link", { name: "Editar" })).toBeVisible();
  await expect(page.getByLabel(`Más acciones · ${PROV_ADMIN}`)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar presupuesto" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Registrar pago" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nueva cotización" })).toBeVisible();
  // El archivo del admin se ve pero el editor no lo puede borrar.
  await expect(page.getByRole("link", { name: "del-admin.pdf" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Borrar" })).toHaveCount(0);

  await page.goto("/proveedores");
  await page.getByRole("link", { name: PROV_ADMIN, exact: true }).click();
  await expect(page.getByRole("heading", { name: PROV_ADMIN, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Borrar" })).toHaveCount(0);

  await page.goto(`/eventos/${eventoId}/tareas`);
  await page.getByRole("link", { name: TAREA_ADMIN }).click();
  await expect(page.getByRole("heading", { name: TAREA_ADMIN, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Borrar" })).toHaveCount(0);
  // Los recordatorios manuales los gestiona quien creó la tarea o un admin.
  await expect(page.getByLabel("Recordatorio manual (hora de La Paz)")).toHaveCount(0);

  for (const ruta of ["/configuracion/usuarios", "/configuracion/grupos", "/eventos/nuevo", `/eventos/${eventoId}/ajustes`]) {
    await noEncontrada(page, ruta);
  }
});

test("editor: carga proveedores, cotizaciones, tareas y archivos; editar una aprobada la vuelve a pendiente", async ({
  page,
  browser,
}) => {
  await ingresarComo(page, EDITOR.email, EDITOR.password);
  await crearProveedor(page, PROV_EDITOR);
  // Edita un proveedor (permitido al editor).
  await page.getByRole("link", { name: PROV_EDITOR, exact: true }).click();
  await expect(page.getByRole("heading", { name: PROV_EDITOR, level: 1 })).toBeVisible();
  await page.getByLabel("Persona de contacto").fill("Rocío");
  await page.getByLabel("Teléfono").fill("+591 700 00000");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Guardado")).toBeVisible();

  await page.goto(`/eventos/${eventoId}/rubros/${rubroId}`);
  await nuevaCotizacion(page, { proveedor: PROV_EDITOR, descripcion: "Cotización de la editora", precio: "900" });
  await expect(tarjeta(page, PROV_EDITOR)).toBeVisible();

  // El admin aprueba la de la editora; la editora la edita y vuelve a pendiente.
  const admin = await sesion(browser, ADMIN.email, ADMIN.password);
  await admin.page.goto(`/eventos/${eventoId}/rubros/${rubroId}`);
  await tarjeta(admin.page, PROV_EDITOR).getByRole("button", { name: "Aprobar" }).click();
  await expect(tarjeta(admin.page, PROV_EDITOR).getByText("Aprobada", { exact: true })).toBeVisible();
  await cerrarContexto(admin.contexto);

  await page.reload();
  await tarjeta(page, PROV_EDITOR).getByRole("link", { name: "Editar" }).click();
  await expect(page.getByText("Esta cotización está aprobada. Si guardás cambios vuelve a pendiente")).toBeVisible();
  await page.getByLabel("Precio por día").fill("950");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page).toHaveURL(new RegExp(`/rubros/${rubroId}$`));
  await expect(tarjeta(page, PROV_EDITOR).getByText("Pendiente", { exact: true })).toBeVisible();
  // 950 × 2 días, sin descuento.
  await expect(tarjeta(page, PROV_EDITOR).getByText("ARS 1.900,00").first()).toBeVisible();

  // Archivos: sube y borra lo propio.
  await page.getByLabel("Elegir archivos").setInputFiles([await fotoPng("de-la-editora.png")]);
  await page.getByRole("button", { name: "Ver de-la-editora.png" }).click();
  const visor = page.getByRole("dialog", { name: "de-la-editora.png" });
  await visor.getByRole("button", { name: "Borrar" }).click();
  await visor.getByRole("button", { name: "Sí" }).click();
  await expect(page.getByRole("button", { name: "Ver de-la-editora.png" })).toHaveCount(0);

  // Tareas: crea, cambia estado, agrega y cancela un recordatorio propio.
  await page.goto(`/eventos/${eventoId}/tareas`);
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  await page.getByLabel("Tarea", { exact: true }).fill(TAREA_EDITOR);
  await page.locator("#grupoId").selectOption({ label: "Seguridad y Prevención" });
  await page.locator("#responsableId").selectOption({ label: EDITOR.nombre });
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await page.getByRole("link", { name: TAREA_EDITOR }).click();
  await expect(page.getByRole("heading", { name: TAREA_EDITOR, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByText("En curso").first()).toBeVisible();
  await page.getByLabel("Recordatorio manual (hora de La Paz)").fill("2030-01-15T10:30");
  await page.getByRole("button", { name: "Agregar recordatorio" }).click();
  await expect(page.getByText("Recordatorio agregado")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("Cancelado", { exact: true })).toBeVisible();
});

test("el servidor rechaza al editor las acciones de admin aunque las mande a mano", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const admin = await sesion(browser, ADMIN.email, ADMIN.password);
  const a = admin.page;
  const capturas: Record<string, AccionCapturada> = {};

  await a.goto(`/eventos/${eventoId}/rubros/${rubroId}`);
  // A esta altura la del admin está descartada (se aprobó y editó la de la editora): vive en el aside.
  const aside = a.getByRole("complementary").filter({ hasText: "Descartadas" });
  capturas.aprobar = await capturarAccion(a, async () => {
    await abrirMenu(a, PROV_ADMIN);
    await aside.getByRole("button", { name: "Aprobar" }).click();
  });
  await a.reload();
  capturas.borrarCotizacion = await capturarAccion(a, async () => {
    await abrirMenu(a, PROV_ADMIN);
    await aside.getByRole("button", { name: "Borrar" }).click();
    await aside.getByRole("button", { name: "Sí" }).click();
  });
  await a.reload();
  capturas.borrarArchivo = await capturarAccion(a, async () => {
    await a.getByRole("button", { name: "Borrar" }).last().click();
    await a.getByRole("button", { name: "Sí" }).click();
  });
  await a.reload();
  capturas.pago = await capturarAccion(a, async () => {
    await a.getByRole("button", { name: "Registrar pago" }).click();
    const hoja = a.getByRole("dialog", { name: /Pago ·/ });
    await hoja.getByLabel("Monto pagado").fill("1");
    await hoja.getByRole("button", { name: "Guardar pago" }).click();
  });

  await a.goto(`/eventos/${eventoId}/ajustes`);
  capturas.tipoCambio = await capturarAccion(a, async () => {
    await a.getByLabel("1 USD en ARS").fill("1");
    await a.getByLabel("1 USD en ARS").press("Enter");
  });
  await a.reload();
  capturas.cerrarEvento = await capturarAccion(a, async () => {
    await a.getByRole("button", { name: "Cerrar evento" }).click();
    await a.getByRole("button", { name: "Sí" }).click();
  });

  await a.goto("/proveedores");
  await a.getByRole("link", { name: PROV_ADMIN, exact: true }).click();
  await expect(a.getByRole("heading", { name: PROV_ADMIN, level: 1 })).toBeVisible();
  capturas.borrarProveedor = await capturarAccion(a, async () => {
    await a.getByRole("button", { name: "Borrar" }).click();
    await a.getByRole("button", { name: "Sí" }).click();
  });

  await a.goto(`/eventos/${eventoId}/tareas`);
  await a.getByRole("link", { name: TAREA_ADMIN }).click();
  capturas.borrarTarea = await capturarAccion(a, async () => {
    await a.getByRole("button", { name: "Borrar" }).first().click();
    await a.getByRole("button", { name: "Sí" }).click();
  });

  await a.goto("/configuracion/usuarios");
  capturas.cambiarRol = await capturarAccion(a, async () => {
    const fila = a.getByRole("row").filter({ hasText: EDITOR.email });
    await fila.getByLabel("Rol").selectOption("admin");
    await fila.getByRole("button", { name: "Guardar" }).click();
  });
  await a.reload();
  capturas.crearUsuario = await capturarAccion(a, async () => {
    await a.getByRole("button", { name: "Nuevo usuario" }).click();
    const hoja = a.getByRole("dialog", { name: "Nuevo usuario" });
    await hoja.getByLabel("Nombre").fill("Infiltrado");
    await hoja.getByLabel("Email").fill(`infiltrado-${S}@e2e.test`);
    await hoja.getByLabel("Contraseña inicial").fill("infiltrado-123");
    await hoja.getByLabel("Rol").selectOption("admin");
    await hoja.getByRole("button", { name: "Crear usuario" }).click();
  });
  await a.reload();
  capturas.borrarUsuario = await capturarAccion(a, async () => {
    const fila = a.getByRole("row").filter({ hasText: EDITOR.email });
    await fila.getByRole("button", { name: "Borrar" }).click();
    await fila.getByRole("button", { name: "Sí, borrar" }).click();
  });

  await a.goto("/configuracion/grupos");
  capturas.crearGrupo = await capturarAccion(a, async () => {
    await a.getByRole("button", { name: "Nuevo grupo" }).click();
    const hoja = a.getByRole("dialog", { name: "Nuevo grupo" });
    await hoja.getByLabel("Nombre").fill(`Grupo infiltrado ${S}`);
    await hoja.getByRole("button", { name: "Crear grupo" }).click();
  });

  await a.goto("/eventos/nuevo");
  capturas.crearEvento = await capturarAccion(a, async () => {
    await a.getByLabel("Nombre").fill(`Evento infiltrado ${S}`);
    await a.getByRole("button", { name: "Crear evento" }).click();
  });

  // La editora reenvía cada una con su sesión: todas rechazadas.
  await ingresarComo(page, EDITOR.email, EDITOR.password);
  const resultados: string[] = [];
  for (const [nombre, captura] of Object.entries(capturas)) {
    const r = await reenviar(page.request, captura);
    expect(r.status, `${nombre}: ${r.texto.slice(0, 300)}`).toBeLessThan(500);
    if (!NO_PERMISO.test(r.texto)) resultados.push(`${nombre} NO fue rechazada: ${r.status} ${r.texto.slice(0, 300)}`);
  }
  expect(resultados).toEqual([]);

  // Sin sesión, tampoco.
  const anonimo = await nuevoRequest.newContext({ baseURL: URL_BASE });
  for (const [nombre, captura] of Object.entries(capturas)) {
    const r = await reenviar(anonimo, captura);
    expect(r.status, nombre).toBeLessThan(500);
    expect(r.texto, nombre).not.toContain('"ok":true');
  }
  await anonimo.dispose();

  // Y nada cambió.
  await a.goto(`/eventos/${eventoId}/rubros/${rubroId}`);
  await expect(a.getByRole("complementary").filter({ hasText: "Descartadas" }).getByText(PROV_ADMIN)).toBeVisible();
  await expect(a.getByRole("link", { name: "del-admin.pdf" })).toBeVisible();
  await expect(a.getByText("Evento cerrado · solo lectura.")).toHaveCount(0);
  await a.goto("/configuracion/usuarios");
  await expect(a.getByText(`infiltrado-${S}@e2e.test`)).toHaveCount(0);
  await expect(a.getByRole("row").filter({ hasText: EDITOR.email }).getByLabel("Rol")).toHaveValue("editor");
  await a.goto("/configuracion/grupos");
  await expect(a.getByText(`Grupo infiltrado ${S}`)).toHaveCount(0);
  await a.goto("/eventos");
  await expect(a.getByText(`Evento infiltrado ${S}`)).toHaveCount(0);
  await a.goto(`/eventos/${eventoId}/tareas`);
  await expect(a.getByRole("link", { name: TAREA_ADMIN })).toBeVisible();
  await a.goto("/proveedores");
  await expect(a.getByRole("link", { name: PROV_ADMIN, exact: true })).toBeVisible();
  await cerrarContexto(admin.contexto);
});

test("cambiar el rol o borrar un usuario tiene efecto en su sesión abierta", async ({ page, browser, monitor }) => {
  monitor.permitir(/status of 404/);
  const temporal: Usuario = { nombre: `Temporal ${S}`, email: `temporal-${S}@e2e.test`, password: "temporal-123", rol: "admin" };
  await ingresarAdmin(page);
  await crearUsuario(page, temporal);

  const otro = await sesion(browser, temporal.email, temporal.password);
  await otro.page.goto("/configuracion/usuarios");
  await expect(otro.page.getByRole("heading", { name: "Usuarios", level: 1 })).toBeVisible();

  // Pasa a editor: pierde el acceso en la siguiente request.
  await page.goto("/configuracion/usuarios");
  const fila = page.getByRole("row").filter({ hasText: temporal.email });
  await fila.getByLabel("Rol").selectOption("editor");
  await fila.getByRole("button", { name: "Guardar" }).click();
  await expect(fila.getByRole("button", { name: "Guardar" })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: temporal.email }).getByLabel("Rol")).toHaveValue("editor");
  const r = await otro.page.goto("/configuracion/usuarios");
  expect(r?.status()).toBe(404);

  // Borrado: su sesión deja de valer.
  await page.getByRole("row").filter({ hasText: temporal.email }).getByRole("button", { name: "Borrar" }).click();
  await page.getByRole("row").filter({ hasText: temporal.email }).getByRole("button", { name: "Sí, borrar" }).click();
  await expect(page.getByText(temporal.email)).toHaveCount(0);
  await otro.page.goto("/proveedores");
  await expect(otro.page).toHaveURL(/\/login$/);
  // Y no puede volver a entrar.
  await otro.page.getByLabel("Email").fill(temporal.email);
  await otro.page.getByLabel("Contraseña").fill(temporal.password);
  await otro.page.getByRole("button", { name: "Entrar" }).click();
  await expect(otro.page.getByText("Email o contraseña incorrectos")).toBeVisible();
  await cerrarContexto(otro.contexto);

  // El admin no puede cambiarse el rol ni borrarse a sí mismo desde la UI.
  const yo = page.getByRole("row").filter({ hasText: ADMIN.email });
  await expect(yo.getByText("(vos)")).toBeVisible();
  await expect(yo.getByRole("button", { name: "Borrar" })).toHaveCount(0);
});

test("mi cuenta: cambiar la contraseña (errores, éxito, cierra otras sesiones) y los avisos por email", async ({
  page,
  browser,
  monitor,
}) => {
  // La clave actual incorrecta la responde Better Auth con un 400 (esperado).
  monitor.permitir(/status of 400/);
  const persona: Usuario = { nombre: `Cuenta ${S}`, email: `cuenta-${S}@e2e.test`, password: "cuenta-inicial-1", rol: "editor" };
  const admin = await sesion(browser, ADMIN.email, ADMIN.password);
  await crearUsuario(admin.page, persona);

  const otraSesion = await sesion(browser, persona.email, persona.password);
  await ingresarComo(page, persona.email, persona.password);
  await page.goto("/cuenta");
  await expect(page.getByText(persona.email)).toBeVisible();
  await expect(page.getByText("Editor", { exact: true })).toBeVisible();

  const cambiar = async (actual: string, nueva: string, repetir: string) => {
    await page.getByLabel("Contraseña actual").fill(actual);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill(nueva);
    await page.getByLabel("Repetir contraseña nueva").fill(repetir);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  };
  await cambiar(persona.password, "corta", "corta");
  await expect(page.getByText("La contraseña nueva debe tener al menos 8 caracteres")).toBeVisible();
  await cambiar(persona.password, "nueva-clave-1", "nueva-clave-2");
  await expect(page.getByText("Las contraseñas no coinciden")).toBeVisible();
  await cambiar("equivocada-1", "nueva-clave-1", "nueva-clave-1");
  await expect(page.getByText("La contraseña actual es incorrecta")).toBeVisible();
  await cambiar(persona.password, "nueva-clave-1", "nueva-clave-1");
  await expect(page.getByText("Contraseña actualizada")).toBeVisible();

  // La otra sesión quedó revocada; esta sigue.
  await otraSesion.page.goto("/proveedores");
  await expect(otraSesion.page).toHaveURL(/\/login$/);
  await page.goto("/proveedores");
  await expect(page.getByRole("heading", { name: "Proveedores", level: 1 })).toBeVisible();
  await cerrarContexto(otraSesion.contexto);

  // Avisos por email: se apagan y queda guardado.
  await page.goto("/cuenta");
  const interruptor = page.getByRole("switch");
  await expect(interruptor).toBeChecked();
  await interruptor.uncheck();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Guardado")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch")).not.toBeChecked();
  await admin.page.goto("/configuracion/usuarios");
  await expect(admin.page.getByRole("row").filter({ hasText: persona.email }).getByText("Apagados")).toBeVisible();
  await cerrarContexto(admin.contexto);

  // La clave vieja ya no entra; la nueva sí.
  const nueva = await browser.newContext({ baseURL: URL_BASE });
  const p = await nueva.newPage();
  await p.goto("/login");
  await p.getByLabel("Email").fill(persona.email);
  await p.getByLabel("Contraseña").fill(persona.password);
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p.getByText("Email o contraseña incorrectos")).toBeVisible();
  await ingresarComo(p, persona.email, "nueva-clave-1");
  await cerrarContexto(nueva);
});
