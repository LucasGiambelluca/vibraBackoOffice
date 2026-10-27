// QA: validaciones de formularios, textos raros (HTML/emoji/largos) y subidas de archivos inválidas.
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";
import {
  abrirRubro,
  capturarAccion,
  crearEvento,
  crearProveedor,
  expect,
  fotoPng,
  ingresarAdmin,
  nuevaCotizacion,
  pdf,
  sufijo,
  tarjeta,
  test,
  URL_BASE,
} from "./qa-ayudas";

const XSS = `<script>alert(1)</script><img src=x onerror=alert(2)> "q" & 'a' 🎉🇧🇴`;

/** Saltea la validación del navegador (required, type=email, minlength) para probar la del servidor. */
const sinValidarNavegador = (form: Locator) => form.evaluate((f: HTMLFormElement) => (f.noValidate = true));

/** Falla el test si algo abre un alert/confirm (señal de HTML inyectado que se ejecutó). */
function sinDialogos(page: Page) {
  page.on("dialog", async (d) => {
    await d.dismiss();
    throw new Error(`Se abrió un diálogo: ${d.message()}`);
  });
}

async function sinHtmlInyectado(page: Page) {
  expect(await page.locator('img[src="x"]').count(), "un <img> del texto quedó como HTML").toBe(0);
}

test("proveedores: requeridos, largos, email, duplicados y texto con HTML/emoji", async ({ page }) => {
  sinDialogos(page);
  const S = sufijo();
  await ingresarAdmin(page);
  await page.goto("/proveedores");
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  const hoja = page.getByRole("dialog", { name: "Nuevo proveedor" });
  await sinValidarNavegador(hoja.locator("form"));
  const crear = async (campos: Record<string, string>, error: RegExp) => {
    for (const [label, valor] of Object.entries(campos)) await hoja.getByLabel(label, { exact: true }).fill(valor);
    await hoja.getByRole("button", { name: "Crear proveedor" }).click();
    await expect(hoja.getByRole("paragraph").filter({ hasText: error })).toBeVisible();
  };
  await crear({ Nombre: "" }, /El nombre es muy corto/);
  await crear({ Nombre: "   " }, /El nombre es muy corto/);
  await crear({ Nombre: "x".repeat(121) }, /El nombre es muy largo/);
  await crear({ Nombre: `Válido ${S}`, Email: "no-es-email" }, /Email inválido/);
  await crear({ Email: "", Notas: "n".repeat(2001) }, /Máximo 2000 caracteres/);
  await crear({ Notas: "", Teléfono: "9".repeat(41) }, /Máximo 40 caracteres/);
  await hoja.getByLabel("Teléfono", { exact: true }).fill("");

  // Con HTML y emoji: se guarda y se muestra como texto.
  const nombre = `${XSS} ${S}`;
  await hoja.getByLabel("Nombre", { exact: true }).fill(nombre);
  await hoja.getByLabel("Persona de contacto").fill(XSS);
  await hoja.getByLabel("Notas").fill(`${XSS}\nsegunda línea`);
  await hoja.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(hoja).toBeHidden();
  await expect(page.getByRole("link", { name: nombre, exact: true })).toBeVisible();
  await sinHtmlInyectado(page);

  // Búsqueda con caracteres especiales (% y _ no deberían comodinear ni romper).
  await page.getByRole("searchbox", { name: "Buscar" }).fill("🎉🇧🇴");
  await page.getByRole("searchbox", { name: "Buscar" }).press("Enter");
  await expect(page.getByRole("link", { name: nombre, exact: true })).toBeVisible();
  await page.goto("/proveedores?q=%25%25%25");
  await expect(page.getByRole("heading", { name: "Proveedores", level: 1 })).toBeVisible();
  await page.goto(`/proveedores?q=${encodeURIComponent("'; drop table proveedor; --")}`);
  await expect(page.getByText("Ningún proveedor coincide con la búsqueda.")).toBeVisible();

  await page.goto("/proveedores");
  await page.getByRole("link", { name: nombre, exact: true }).click();
  await expect(page.getByRole("heading", { name: nombre, level: 1 })).toBeVisible();
  await expect(page.getByLabel("Persona de contacto")).toHaveValue(XSS);
  await sinHtmlInyectado(page);

  // Duplicado (mismo nombre).
  await page.goto("/proveedores");
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  await hoja.getByLabel("Nombre", { exact: true }).fill(nombre);
  await hoja.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(hoja.getByText("Ya existe un proveedor con ese nombre")).toBeVisible();
  // Duplicado con otra capitalización / espacios: se espera que también se rechace.
  await hoja.getByLabel("Nombre", { exact: true }).fill(`  ${nombre.toUpperCase()}  `);
  await hoja.getByRole("button", { name: "Crear proveedor" }).click();
  await expect
    .soft(hoja.getByText("Ya existe un proveedor con ese nombre"), "proveedor duplicado que solo cambia mayúsculas")
    .toBeVisible({ timeout: 5_000 });
});

test("cotizaciones: precios y descuentos inválidos, textos largos y coma decimal", async ({ page }) => {
  sinDialogos(page);
  const S = sufijo();
  const PROV = `Prov valid ${S}`;
  await ingresarAdmin(page);
  await crearProveedor(page, PROV);
  const eventoId = await crearEvento(page, { nombre: `QA Validación ${S}`, rubros: { Sonido: 2 } });
  await abrirRubro(page, eventoId, "Sonido");

  const hoja = await nuevaCotizacion(page, { proveedor: PROV, descripcion: "Algo", precio: "-5" }, { esperarCierre: false });
  await sinValidarNavegador(hoja.locator("form"));
  const probar = async (campos: { precio?: string; descuento?: string; descripcion?: string }, error: RegExp) => {
    if (campos.precio !== undefined) await hoja.getByLabel("Precio por día").fill(campos.precio);
    if (campos.descuento !== undefined) await hoja.getByLabel("% de descuento por contratar 2 días").fill(campos.descuento);
    if (campos.descripcion !== undefined) await hoja.getByLabel("Qué incluye").fill(campos.descripcion);
    await hoja.getByRole("button", { name: "Agregar cotización" }).click();
    await expect(hoja.getByRole("paragraph").filter({ hasText: error })).toBeVisible();
  };
  await expect(hoja.getByText(/Precio inválido/)).toBeVisible();
  await probar({ precio: "0" }, /El precio debe ser mayor a 0/);
  await probar({ precio: "abc" }, /Precio inválido/);
  await probar({ precio: "1.500,50" }, /Precio inválido/);
  await probar({ precio: "1e5" }, /Precio inválido/);
  await probar({ precio: "12,345" }, /Precio inválido/);
  await probar({ precio: "1000000000000" }, /El precio es demasiado grande/);
  await probar({ precio: "100", descuento: "101" }, /El descuento debe estar entre 0 y 100/);
  await probar({ descuento: "-1" }, /Descuento inválido/);
  await probar({ descuento: "1000" }, /El descuento debe estar entre 0 y 100/);
  await probar({ descuento: "10", descripcion: "x" }, /La descripción es muy corta/);
  await probar({ descripcion: "d".repeat(2001) }, /La descripción es muy larga/);
  await hoja.getByLabel("Proveedor").evaluate((s: HTMLSelectElement) => (s.value = ""));
  await probar({ descripcion: "Bien" }, /Elegí un proveedor/);

  // Coma decimal, espacios y HTML en la descripción: 1500,5 × 2 × 0,9 = ARS 2.700,90.
  await hoja.getByLabel("Proveedor").selectOption({ label: PROV });
  await hoja.getByLabel("Precio por día").fill(" 1500,5 ");
  await hoja.getByLabel("% de descuento por contratar 2 días").fill("10,0");
  await hoja.getByLabel("Qué incluye").fill(XSS);
  await hoja.getByRole("button", { name: "Agregar cotización" }).click();
  await expect(hoja).toBeHidden();
  await expect(tarjeta(page, PROV).getByText("ARS 2.700,90").first()).toBeVisible();
  await expect(tarjeta(page, PROV).getByText(XSS)).toBeVisible();
  await sinHtmlInyectado(page);

  // Editar con un precio inválido no rompe: muestra el error y queda en la página.
  await tarjeta(page, PROV).getByRole("link", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: "Editar cotización" })).toBeVisible();
  await page.getByLabel("Precio por día").fill("-1");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText(/Precio inválido/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Editar cotización" })).toBeVisible();
});

test("eventos y tipos de cambio: duplicados, fechas al revés, sin rubros y valores inválidos", async ({ page }) => {
  sinDialogos(page);
  const S = sufijo();
  const NOMBRE = `QA Evento ${S}`;
  await ingresarAdmin(page);
  await crearEvento(page, { nombre: NOMBRE, rubros: { Sonido: 1 } });

  await page.goto("/eventos/nuevo");
  const form = page.locator("main form");
  await sinValidarNavegador(form);
  const crear = async (error: RegExp) => {
    await page.getByRole("button", { name: "Crear evento" }).click();
    await expect(page.getByText(error)).toBeVisible();
  };
  await page.getByLabel("Nombre").fill("x");
  await crear(/El nombre es muy corto/);
  await page.getByLabel("Nombre").fill("x".repeat(121));
  await crear(/El nombre es muy largo/);
  await page.getByLabel("Nombre").fill(`Otro ${S}`);
  await page.getByLabel("Empieza (opcional)").fill("2027-03-10");
  await page.getByLabel("Termina (opcional)").fill("2027-03-09");
  await crear(/La fecha de fin es anterior a la de inicio/);
  await page.getByLabel("Termina (opcional)").fill("2027-03-11");
  await page.getByLabel("1 USD en ARS (opcional)").fill("abc");
  await crear(/Valor inválido/);
  await page.getByLabel("1 USD en ARS (opcional)").fill("0");
  await crear(/El valor debe ser mayor a 0/);
  await page.getByLabel("1 USD en ARS (opcional)").fill("");
  await page.getByLabel("Elegirlos del catálogo").check();
  await crear(/Elegí al menos un rubro/);
  await page.getByLabel("Nombre").fill(NOMBRE);
  await page.getByLabel("Sonido", { exact: true }).check();
  await crear(/Ya existe un evento con ese nombre/);

  // HTML en el nombre del evento: se crea y se muestra como texto (también en el selector y el tablero).
  await page.getByLabel("Nombre").fill(`${XSS.slice(0, 80)} ${S}`);
  await page.getByRole("button", { name: "Crear evento" }).click();
  await expect(page.getByRole("heading", { name: `${XSS.slice(0, 80)} ${S}`, level: 1 })).toBeVisible();
  await sinHtmlInyectado(page);
  const eventoId = new URL(page.url()).pathname.split("/")[2];
  await page.goto("/");
  await expect(page.getByRole("link", { name: `${XSS.slice(0, 80)} ${S}`, exact: true })).toBeVisible();
  await sinHtmlInyectado(page);

  // Tipos de cambio inválidos desde Ajustes.
  await page.goto(`/eventos/${eventoId}/ajustes`);
  const usd = page.getByLabel("1 USD en ARS");
  const guardar = async (valor: string, error: RegExp) => {
    await usd.fill(valor);
    await usd.press("Enter");
    await expect(page.getByText(error)).toBeVisible();
  };
  await guardar("-10", /Valor inválido/);
  await guardar("0,000000", /El valor debe ser mayor a 0/);
  await guardar("1.234,5", /Valor inválido/);
  await guardar("1234,5678901", /Valor inválido/);
  await guardar("9999999999999", /El valor es demasiado grande/);
  await guardar("1234,567891", /Guardado/);
  await page.reload();
  await expect(page.getByLabel("1 USD en ARS")).toHaveValue("1234.567891");

  // Editar el evento: fechas al revés y nombre duplicado.
  await page.getByLabel("Empieza (opcional)").fill("2027-05-10");
  await page.getByLabel("Termina (opcional)").fill("2027-05-01");
  await page.getByRole("button", { name: "Guardar" }).first().click();
  await expect(page.getByText(/La fecha de fin es anterior a la de inicio/)).toBeVisible();
  await page.getByLabel("Termina (opcional)").fill("2027-05-12");
  await page.getByLabel("Nombre").fill(NOMBRE);
  await page.getByRole("button", { name: "Guardar" }).first().click();
  await expect(page.getByText("Ya existe un evento con ese nombre")).toBeVisible();
});

test("tareas, grupos y rubros: requeridos, duplicados y recordatorio en el pasado", async ({ page }) => {
  sinDialogos(page);
  const S = sufijo();
  await ingresarAdmin(page);
  const eventoId = await crearEvento(page, { nombre: `QA Pendientes valid ${S}`, rubros: { Sonido: 1 } });
  await page.goto(`/eventos/${eventoId}/tareas`);
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  const hoja = page.getByRole("dialog", { name: /Nueva tarea/ });
  await sinValidarNavegador(hoja.locator("form"));
  const crear = async (error: RegExp) => {
    await hoja.getByRole("button", { name: "Crear tarea" }).click();
    await expect(hoja.getByRole("paragraph").filter({ hasText: error })).toBeVisible();
  };
  await crear(/El título es muy corto|Falta el título/);
  await hoja.getByLabel("Tarea", { exact: true }).fill("t".repeat(201));
  await crear(/El título es muy largo/);
  await hoja.getByLabel("Tarea", { exact: true }).fill(`Tarea ${XSS} ${S}`);
  await crear(/Grupo inválido/);
  await hoja.locator("#grupoId").selectOption({ label: "Seguridad y Prevención" });
  await hoja.getByLabel("Notas").fill("n".repeat(2001));
  await crear(/Máximo 2000 caracteres/);
  await hoja.getByLabel("Notas").fill(XSS);
  await hoja.getByRole("button", { name: "Crear tarea" }).click();
  await expect(hoja).toBeHidden();
  await expect(page.getByRole("link", { name: `Tarea ${XSS} ${S}` })).toBeVisible();
  await sinHtmlInyectado(page);

  await page.getByRole("link", { name: `Tarea ${XSS} ${S}` }).click();
  await page.getByLabel("Recordatorio manual (hora de La Paz)").fill("2020-01-01T10:00");
  await page.getByRole("button", { name: "Agregar recordatorio" }).click();
  await expect(page.getByText("La fecha tiene que ser futura")).toBeVisible();

  // Grupos y rubros.
  await page.goto("/configuracion/grupos");
  await page.getByRole("button", { name: "Nuevo grupo" }).click();
  const hg = page.getByRole("dialog", { name: "Nuevo grupo" });
  await sinValidarNavegador(hg.locator("form"));
  await hg.getByRole("button", { name: "Crear grupo" }).click();
  await expect(hg.getByText(/El nombre es muy corto|Falta el nombre/)).toBeVisible();
  await hg.getByLabel("Nombre").fill("Seguridad y Prevención");
  await hg.getByRole("button", { name: "Crear grupo" }).click();
  await expect(hg.getByText("Ya existe un grupo con ese nombre")).toBeVisible();
  await hg.getByLabel("Nombre").fill("g".repeat(81));
  await hg.getByRole("button", { name: "Crear grupo" }).click();
  await expect(hg.getByText("El nombre es muy largo")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Nuevo rubro" }).click();
  const hr = page.getByRole("dialog", { name: "Nuevo rubro" });
  await sinValidarNavegador(hr.locator("form"));
  await hr.getByLabel("Nombre").fill("Sonido");
  await hr.getByRole("button", { name: "Crear rubro" }).click();
  await expect(hr.getByText("Grupo inválido")).toBeVisible();
  // El label "Grupo" apunta a su select (antes chocaba con el id del input de "Nuevo grupo").
  await expect(hr.getByLabel("Grupo")).toHaveCount(1);
  await hr.locator('select[name="grupoId"]').selectOption({ label: "Seguridad y Prevención" });
  await hr.getByRole("button", { name: "Crear rubro" }).click();
  await expect(hr.getByText("Ya existe un rubro con ese nombre")).toBeVisible();
});

test("subidas: >10 MB, foto falsa, tipo no permitido y lote mixto dan errores claros", async ({ page, monitor }) => {
  // La subida que se intercepta y aborta a propósito (para reenviarla) la registra el navegador.
  monitor.permitir(/net::ERR_FAILED|Failed to fetch/);
  const S = sufijo();
  const PROV = `Prov adjunto ${S}`;
  await ingresarAdmin(page);
  await crearProveedor(page, PROV);
  const eventoId = await crearEvento(page, { nombre: `QA Subidas ${S}`, rubros: { Sonido: 1 } });
  const rubroId = await abrirRubro(page, eventoId, "Sonido");

  const grande = { name: "enorme.pdf", mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(10 * 1024 * 1024 + 10, 0x20)]) };
  const falsa = { name: "foto-falsa.jpg", mimeType: "image/jpeg", buffer: Buffer.from("esto no es una imagen, es texto") };
  const texto = { name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("hola") };

  await page.getByLabel("Elegir archivos").setInputFiles([grande, falsa, texto, await fotoPng("buena.png")]);
  const errores = page.getByRole("alert").filter({ hasText: "enorme.pdf" });
  await expect(errores).toContainText("enorme.pdf: supera los 10 MB");
  await expect(errores).toContainText("foto-falsa.jpg: Solo se aceptan PDF o fotos (JPG, PNG o WebP)");
  await expect(errores).toContainText("notas.txt: solo se aceptan PDF o fotos");
  // La buena se subió igual.
  await expect(page.getByRole("button", { name: "Ver buena.png" })).toBeVisible();

  // Una foto grande se achica a 2560 px de lado mayor y se le saca la metadata.
  const enorme = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#123456" } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: "secreto-gps" } } })
    .toBuffer();
  await page.getByLabel("Elegir archivos").setInputFiles([{ name: "camara.jpg", mimeType: "image/jpeg", buffer: enorme }]);
  await expect(page.getByRole("button", { name: "Ver camara.jpg" })).toBeVisible();
  await page.getByRole("button", { name: "Ver camara.jpg" }).click();
  const src = (await page.getByRole("dialog", { name: "camara.jpg" }).getByRole("img", { name: "camara.jpg" }).getAttribute("src"))!;
  const bajada = await page.request.get(src);
  const meta = await sharp(await bajada.body()).metadata();
  expect(Math.max(meta.width!, meta.height!)).toBe(2560);
  expect(meta.exif, "la foto guardada no debería tener EXIF").toBeUndefined();
  // Descargar: Content-Disposition attachment con el nombre original.
  const descarga = await page.request.get(`${src}?descargar=1`);
  expect(descarga.headers()["content-disposition"]).toBe("attachment; filename*=UTF-8''camara.jpg");
  await page.keyboard.press("Escape");

  // Adjunto de una cotización nueva: >10 MB lo frena el navegador; una foto falsa, el servidor (y no se crea).
  let hoja = await nuevaCotizacion(page, { proveedor: PROV, descripcion: "Con adjunto grande", precio: "10" }, { enviar: false });
  await hoja.getByLabel("PDF o foto de la cotización").setInputFiles(grande);
  await hoja.getByRole("button", { name: "Agregar cotización" }).click();
  await expect(hoja.getByText("El archivo supera los 10 MB")).toBeVisible();
  await hoja.getByLabel("PDF o foto de la cotización").setInputFiles(falsa);
  await hoja.getByRole("button", { name: "Agregar cotización" }).click();
  await expect(hoja.getByText("Solo se aceptan PDF o fotos (JPG, PNG o WebP)")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByText("Todavía no hay cotizaciones")).toBeVisible();

  // Con un PDF válido sí se crea y queda adjunto.
  hoja = await nuevaCotizacion(page, { proveedor: PROV, descripcion: "Con PDF", precio: "10" }, { enviar: false });
  await hoja.getByLabel("PDF o foto de la cotización").setInputFiles(pdf("presupuesto-proveedor.pdf"));
  await hoja.getByRole("button", { name: "Agregar cotización" }).click();
  await expect(hoja).toBeHidden();
  await expect(tarjeta(page, PROV).getByRole("link", { name: "presupuesto-proveedor.pdf" })).toBeVisible();

  // Por debajo de la UI: el servidor también frena >10 MB y un destino inexistente.
  const captura = await capturarAccion(page, () => page.getByLabel("Elegir archivos").setInputFiles([pdf("chico.pdf")]));
  // Se rearma el mismo multipart (mismo boundary y campos) cambiando el archivo o algún campo.
  const boundary = captura.headers["content-type"].split("boundary=")[1];
  const partes = partesMultipart(captura.body, captura.headers["content-type"]);
  const armar = (archivo: { name: string; mimeType: string; buffer: Buffer }, cambios: Record<string, string> = {}) => {
    const CRLF = "\r\n";
    const trozos: Buffer[] = [];
    for (const p of partes) {
      const campo = p.name.replace(/^_?\d+_/, "");
      trozos.push(Buffer.from(`--${boundary}${CRLF}`));
      if (p.filename !== undefined) {
        trozos.push(
          Buffer.from(
            `Content-Disposition: form-data; name="${p.name}"; filename="${archivo.name}"${CRLF}Content-Type: ${archivo.mimeType}${CRLF}${CRLF}`,
          ),
        );
        trozos.push(archivo.buffer);
      } else {
        trozos.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"${CRLF}${CRLF}${cambios[campo] ?? p.valor}`));
      }
      trozos.push(Buffer.from(CRLF));
    }
    trozos.push(Buffer.from(`--${boundary}--${CRLF}`));
    return Buffer.concat(trozos);
  };
  const enviar = async (body: Buffer) => {
    const r = await page.request.post(captura.url, {
      headers: {
        "next-action": captura.headers["next-action"],
        "content-type": captura.headers["content-type"],
        accept: "text/x-component",
        origin: URL_BASE,
      },
      data: body,
    });
    return { status: r.status(), texto: await r.text() };
  };
  const grandeServidor = await enviar(armar({ ...grande, name: "directo.pdf" }));
  expect(grandeServidor.status, grandeServidor.texto.slice(0, 300)).toBeLessThan(500);
  expect(grandeServidor.texto).toContain("El archivo supera los 10 MB");
  const sinDestino = await enviar(armar(pdf("x.pdf"), { duenioId: "no-existe" }));
  expect(sinDestino.texto).toContain("No existe dónde subir el archivo");
  const destinoRaro = await enviar(armar(pdf("x.pdf"), { duenioTipo: "usuario" }));
  expect(destinoRaro.texto).toContain("Destino inválido");
  // Más de 11 MB: lo corta el límite del body de Next antes de llegar a la app (responde
  // 500 "Body exceeded"; solo pasa saltando el chequeo del navegador). Lo que importa: no se guarda.
  const muyGrande = await enviar(armar({ ...grande, name: "gigante.pdf", buffer: Buffer.alloc(12 * 1024 * 1024, 0x20) }));
  expect(muyGrande.texto).not.toContain('"ok":true');
  await page.goto(`/eventos/${eventoId}/rubros/${rubroId}`);
  await expect(page.getByRole("link", { name: "directo.pdf" })).toHaveCount(0);
});

/** Partes de un multipart/form-data (para reenviar una server action con un archivo cambiado). */
function partesMultipart(body: Buffer, contentType: string) {
  const boundary = contentType.split("boundary=")[1];
  const texto = body.toString("latin1");
  return texto
    .split(`--${boundary}`)
    .slice(1, -1)
    .map((bloque) => {
      const [cabecera, ...resto] = bloque.replace(/^\r\n/, "").split("\r\n\r\n");
      const name = /name="([^"]*)"/.exec(cabecera)![1];
      const filename = /filename="([^"]*)"/.exec(cabecera)?.[1];
      const valor = Buffer.from(resto.join("\r\n\r\n").replace(/\r\n$/, ""), "latin1").toString("utf8");
      return { name, filename, valor };
    });
}
