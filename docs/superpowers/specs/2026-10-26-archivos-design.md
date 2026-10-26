# Parte 2 — Archivos (fotos y PDF) y lectura de cotizaciones con IA

Sigue a `2026-10-26-multi-evento-design.md` (parte 1). Aprobado por el usuario el 2026-10-26.

## Objetivo

Tener toda la información de un evento en un solo lugar: fotos y PDF en el evento, en cada
rubro del evento, en cada cotización y en cada tarea. Además, al cargar una cotización, que el
sistema lea el PDF del proveedor y complete el formulario.

## Alcance

- Archivos: PDF, JPG, PNG y WebP. Hasta 10 MB cada uno. Varios a la vez.
- Dónde: evento, rubro del evento, cotización, tarea.
- Fotos: se guardan re-codificadas (rotación EXIF aplicada, sin metadatos — sin GPS —, lado
  mayor ≤ 2560 px) más una miniatura WebP de 480 px para las grillas.
- Ver: grilla de miniaturas que abre un visor (foto grande, anterior/siguiente, teclado y
  gestos); los PDF se abren en otra pestaña.
- Permisos: ver todos; subir admin y editor (`editar`); borrar quien lo subió o quien puede
  `borrar` (admin).
- Evento cerrado: se ven y descargan, no se suben ni borran (lo valida el servidor).
- Pestaña nueva **Archivos** en el evento: los archivos del evento (se suben ahí) y, debajo,
  todos los de sus rubros, cotizaciones y tareas, con link a dónde están.
- El PDF actual de cada cotización (`cotizacion.adjunto`) pasa a ser un archivo de la
  cotización. La columna se borra.
- Lectura con IA: en "Nueva cotización", botón **Completar desde PDF**. Se sube el PDF,
  Claude devuelve proveedor, moneda, precio por día, descuento por 2 días y descripción, y el
  formulario se completa para revisar. El PDF queda adjunto a la cotización al guardarla. Si
  no hay `ANTHROPIC_API_KEY`, el botón no aparece.

Fuera de alcance: carpetas, versiones de un archivo, Excel/Word, HEIC (iPhone convierte a JPEG
al subir desde el navegador), lectura con IA de fotos.

## Datos

Tabla `archivo`:

| columna | tipo | nota |
|---|---|---|
| id | text uuid | PK |
| evento_id | text not null → evento (restrict) | siempre: chequeo de cerrado y listado del evento |
| evento_rubro_id | text → evento_rubro (cascade) | dueño opcional |
| cotizacion_id | text → cotizacion (cascade) | dueño opcional |
| tarea_id | text → tarea (cascade) | dueño opcional |
| tipo | text `pdf` \| `imagen` | check |
| nombre | text not null | nombre original, para mostrar y descargar |
| descripcion | text | opcional |
| guardado | text not null unique | nombre en `UPLOADS_DIR` (`<uuid>.pdf` / `<uuid>.jpg`…) |
| miniatura | text | solo imágenes (`<uuid>-min.webp`) |
| bytes | integer | null en los migrados |
| subido_por | text → user (set null) | |
| created_at | timestamp | |

Check: a lo sumo uno de `evento_rubro_id`, `cotizacion_id`, `tarea_id` (ninguno = archivo del
evento). Índices por cada dueño.

Los borrados en cascada dejan los archivos en disco: las funciones que borran dueños
(`borrarCotizacion`, `quitarRubro`, `borrarTarea`) juntan los nombres en la transacción y
los borran del disco después del commit, como hoy con el adjunto.

Migración 0008 (a mano): crea la tabla, copia cada `cotizacion.adjunto` como archivo `pdf`
de la cotización (`nombre` = "Cotización.pdf", `evento_id` por join, `subido_por` =
`creado_por`) y borra la columna.

## Código

- `src/lib/archivos-disco.ts` (reemplaza `adjuntos.ts`): validar por contenido (firma `%PDF-`
  o decodificar con sharp), guardar, leer, borrar sin fallar, nombres validados por regex.
- `src/lib/archivos.ts`: `subirArchivo`, `borrarArchivo`, `editarDescripcion`,
  `listarArchivos({ dueño })`, `listarArchivosEvento(eventoId)`, `archivosDeDueños` para
  cascadas. Usa `asegurarEventoAbierto`.
- `src/app/(app)/archivos/operaciones.ts` + `actions.ts`: un archivo por llamada (el cliente
  sube de a uno: progreso visible y sin superar `bodySizeLimit`).
- `src/app/api/archivos/[id]/route.ts` (y `?min=1` para la miniatura, `?descargar=1` para
  `attachment`): con sesión; `Content-Type` del tipo guardado, `nosniff`, `private`. Reemplaza
  `/api/adjuntos`.
- `src/components/archivos/`: `SeccionArchivos` (server), `SubirArchivos` (client),
  `GrillaArchivos` + `Visor` (client).
- `src/lib/lectura-pdf.ts`: `leerCotizacionPdf(bytes)` con `@anthropic-ai/sdk`,
  `claude-opus-5-5`, `messages.parse` + `zodOutputFormat`; acción `leerPdfAction` que
  devuelve los campos (no guarda nada). El proveedor se empareja por nombre con los
  existentes; si no hay, se avisa para crearlo.

## Pruebas

- lib: subir/borrar/listar, permisos, evento cerrado, tipos inválidos (extensión mentirosa),
  tamaño, cascadas borran del disco, path traversal en la ruta.
- migración 0008 con un adjunto previo; `esquema-coincide` sigue en verde.
- lectura PDF: la función que arma el pedido y mapea la respuesta, con cliente falso.
- e2e: subir foto y PDF a un rubro, verlos, abrir el visor, borrar.
