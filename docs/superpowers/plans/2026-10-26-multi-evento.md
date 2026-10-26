# Multi-evento (parte 1) — plan de implementación

> Spec: `docs/superpowers/specs/2026-10-26-multi-evento-design.md`. Se ejecuta inline en la rama
> `multi-evento`, tarea por tarea, con TDD en la capa `src/lib` y verificación completa al final.

**Objetivo:** que el back office maneje varios eventos con historial, en ARS con equivalente USD,
migrando lo cargado a "Vibra Bolivia 2027".

**Arquitectura:** columna de evento en los datos. La lógica vive en `src/lib/*` (testeable con PGlite);
las server actions siguen el patrón `operaciones.ts` (sin Next) + `actions.ts` (`ejecutar`). La regla
"evento cerrado = solo lectura" se aplica en `src/lib`, no en la UI.

**Stack:** Next.js 16 App Router, Drizzle + PGlite/Postgres, zod 4, vitest, Playwright.

## Decisiones de implementación (no cambian el spec)

- `area` se **renombra** a `grupo` (`ALTER TABLE … RENAME`) en vez de crear + copiar + borrar: mismo
  resultado, conserva ids y FKs. `grupo.id` pasa a identity (arranca en 7). Se suma `orden`.
- La migración 0007 se escribe a mano (`drizzle-kit generate --custom`), así no hay prompts de rename;
  después `drizzle-kit generate` tiene que decir "No schema changes".
- Permiso para eventos, rubros del evento, presupuesto, pagado, tipos de cambio y grupos: `configurar`
  (admin). No se agrega una acción nueva.
- URL de detalle de tarea: `/eventos/[eventoId]/tareas/[tareaId]`. `/tareas/[tareaId]` queda como
  redirección (los emails ya enviados y la campanita apuntan ahí).
- Último evento abierto: cookie `evento` que escribe un componente cliente chico al entrar a un evento.
  `/presupuestos` y `/tareas` redirigen con esa cookie (o a `/eventos`).
- Las actions/operaciones de cotizaciones y tareas se quedan en `src/app/(app)/presupuestos/` y
  `src/app/(app)/tareas/` (son módulos compartidos); solo se mueven las páginas.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/db/presupuestos-schema.ts` | `grupo`, `rubro` (sin `dias`), `proveedor`, `cotizacion` (con `eventoRubroId`) |
| `src/db/eventos-schema.ts` (nuevo) | `evento`, `eventoRubro`, `eventoTipoCambio` |
| `src/db/tareas-schema.ts` | `tarea` con `eventoId` y `grupoId` |
| `drizzle/0007_multi_evento.sql` | migración de esquema + datos |
| `src/lib/money.ts` | base ARS: `aArs`, `desdeArs`, `totalEnArs`, `formatearMonto` es-AR |
| `src/lib/eventos.ts` (nuevo) | CRUD de evento, cerrar/reabrir, `asegurarEventoAbierto`, tipos de cambio por evento |
| `src/lib/evento-rubros.ts` (nuevo) | rubros de un evento: agregar, quitar, días, presupuesto, pagado, copiar |
| `src/lib/grupos.ts` (nuevo) | grupos: crear, renombrar, mover, borrar |
| `src/lib/rubros.ts` | catálogo de rubros (sin días, con grupo) |
| `src/lib/cotizaciones.ts` | por `eventoRubroId`, totales en ARS, chequeo de evento abierto |
| `src/lib/tareas.ts`, `src/lib/recordatorios.ts` | por evento, chequeo de evento abierto |
| `src/lib/resumen.ts` | `resumenEvento(db, eventoId)`: grupos → rubros con presupuesto/aprobado/pagado y totales |
| `src/lib/tipos-cambio.ts` | se borra (pasa a `eventos.ts`) |
| `src/app/(app)/eventos/**` | páginas nuevas (lista, nuevo, evento, rubro, cotización, tareas, tarea, ajustes) |
| `src/app/(app)/configuracion/grupos/**` | reemplaza `configuracion/rubros` y `configuracion/tipos-cambio` |

## Tareas

### Tarea 1 — Esquema y migración 0007

**Archivos:** `src/db/presupuestos-schema.ts`, `src/db/eventos-schema.ts`, `src/db/tareas-schema.ts`,
`src/db/schema.ts`, `drizzle/0007_multi_evento.sql`, `drizzle/meta/*`, `tests/db/migracion-multi-evento.test.ts`,
`tests/db/seed.test.ts`, `tests/db/tareas-schema.test.ts`.

1. Test de migración (falla): base PGlite migrada hasta 0006 (carpeta temporal con las migraciones
   0000–0006 y su journal recortado), cargar 2 proveedores, cotizaciones en Sonido (una aprobada con
   aprobador) y Pantalla, una tarea del área 4 con recordatorio, tipos de cambio USD=6.96 BOB y
   ARS=0.0052 BOB; aplicar 0007 y verificar:
   - existe "Vibra Bolivia 2027" activo; 7 `evento_rubro` con `dias` del rubro;
   - cada cotización apunta al `evento_rubro` de su rubro, mantiene estado/aprobador/adjunto;
   - la tarea tiene el evento y `grupo_id = 4`, su recordatorio intacto;
   - `evento_tipo_cambio`: USD = 6.96/0.0052 = 1338.461538, BOB = 1/0.0052 = 192.307692;
   - las tablas `area` y `tipo_cambio` no existen; `rubro` no tiene `dias`.
   Segundo caso: sin tipo ARS cargado → `evento_tipo_cambio` vacío.
2. Esquema Drizzle nuevo (spec, sección Modelo de datos). `grupo.id` con
   `generatedByDefaultAsIdentity({ startWith: 7 })`.
3. `npx drizzle-kit generate --custom --name multi_evento`, escribir el SQL (rename `area`→`grupo`,
   identity, `orden`, tablas nuevas, inserts del evento y de `evento_rubro`, backfill de
   `cotizacion.evento_rubro_id` y `tarea.evento_id`, conversión de tipos, drops, índices y FKs con los
   nombres de Drizzle). `npx drizzle-kit generate` → "No schema changes".
4. Adaptar `seed.test.ts` (grupos, rubros sin días, evento con 7 rubros) y `tareas-schema.test.ts`.
5. `npx vitest run tests/db` en verde. Commit `feat(db): esquema multi-evento y migración 0007`.

### Tarea 2 — Plata en base ARS

**Archivos:** `src/lib/money.ts`, `tests/lib/money.test.ts`.

1. Reescribir los tests: `TiposCambio = { USD?: number; BOB?: number }` (ARS por unidad);
   `aArs(100, "USD", {USD: 1400}) = 140000`; `aArs(10, "BOB", {BOB: 200}) = 2000`; ARS sin tipo;
   faltante → `null`; `desdeArs(140000, "USD", …) = 100`; `totalEnArs` → `{ ars, faltan }`, faltantes
   ordenados; redondeo exacto (casos actuales trasladados); `formatearMonto(1234.5, "ARS") = "ARS 1.234,50"`.
2. Implementar: base genérica con millonésimas, `MONEDAS = ["ARS","USD","BOB"]`,
   `MONEDAS_CAMBIO = ["USD","BOB"]`, `Intl.NumberFormat("es-AR")`.
3. Tests en verde. Commit.

### Tarea 3 — Eventos y tipos de cambio por evento

**Archivos:** `src/lib/eventos.ts`, `tests/lib/eventos.test.ts`, borrar `src/lib/tipos-cambio.ts` y su test.

API:
```ts
export const eventoSchema: z.ZodObject<{ nombre; fechaInicio; fechaFin; lugar }>; // fechas "YYYY-MM-DD" opcionales, fin ≥ inicio
export async function crearEvento(db, datos, opciones: { rubros: { rubroId: string; dias: 1 | 2 }[] } | { copiarDe: string; conPresupuesto: boolean }): Promise<string>;
export async function editarEvento(db, id, datos): Promise<void>;              // exige abierto
export async function cerrarEvento(db, id, actorId): Promise<void>;           // exige tipos de las monedas usadas
export async function reabrirEvento(db, id): Promise<void>;
export function listarEventos(db): Promise<EventoListado[]>;                  // activos primero, después cerrados por fecha
export async function obtenerEvento(db, id);
export async function asegurarEventoAbierto(db: Db | Tx, eventoId: string): Promise<void>; // ErrorNegocio("El evento está cerrado: solo lectura")
export const tipoCambioSchema; // { moneda: "USD"|"BOB", valorArs }
export async function guardarTipoCambio(db, eventoId, datos, actorId): Promise<void>; // exige abierto
export async function obtenerTiposCambio(db, eventoId): Promise<TiposCambio>;
export function listarTiposCambio(db, eventoId);
export function monedasUsadas(db, eventoId): Promise<Moneda[]>;             // cotizaciones + presupuestos + pagos
```
Tests: crear con rubros elegidos; copiar (rubros + días; presupuesto solo si se pide; nunca
cotizaciones); nombre repetido → "Ya existe un evento con ese nombre"; cerrar sin tipo de USD usado →
"Falta el tipo de cambio de USD"; cerrar ok guarda quién/cuándo; reabrir; editar o guardar tipo con el
evento cerrado → error. Commit.

### Tarea 4 — Rubros del evento y grupos

**Archivos:** `src/lib/evento-rubros.ts`, `src/lib/grupos.ts`, `src/lib/rubros.ts`,
`tests/lib/evento-rubros.test.ts`, `tests/lib/grupos.test.ts`, `tests/lib/rubros.test.ts`.

API:
```ts
// evento-rubros.ts
export async function agregarRubros(db, eventoId, rubros: { rubroId: string; dias: 1 | 2 }[]): Promise<void>;
export async function quitarRubro(db, eventoRubroId): Promise<void>;   // "El rubro tiene cotizaciones: borralas primero"
export const presupuestoSchema; // { eventoRubroId, dias, presupuesto?, presupuestoMoneda }
export async function editarRubroEvento(db, eventoRubroId, datos): Promise<void>;
export const pagoSchema;        // { eventoRubroId, pagado?, pagadoMoneda, pagadoFecha?, pagadoNota? }
export async function registrarPago(db, eventoRubroId, datos): Promise<void>;
export async function obtenerEventoRubro(db, id);  // con rubro, grupo, evento, estado del evento
// grupos.ts
export const grupoSchema; export function listarGrupos(db);
export async function crearGrupo(db, datos); export async function renombrarGrupo(db, id, datos);
export async function moverGrupo(db, id, direccion: "arriba" | "abajo"); export async function borrarGrupo(db, id);
// rubros.ts: rubroSchema = { nombre, grupoId }; listarRubros con grupo; borrarRubro → "El rubro se usa en algún evento"
```
Tests: agregar repetido → "El rubro ya está en el evento"; quitar con cotizaciones → error; todas las
escrituras con evento cerrado → error; borrar grupo con rubros → "El grupo tiene rubros"; borrar rubro
usado → error; mover grupos cambia el orden. Commit.

### Tarea 5 — Cotizaciones, resumen y proveedores por evento

**Archivos:** `src/lib/cotizaciones.ts`, `src/lib/resumen.ts`, `tests/lib/cotizaciones.test.ts`,
`tests/lib/resumen.test.ts`, `tests/helpers/presupuestos.ts`.

- `nuevaCotizacionSchema` usa `eventoRubroId`. `crear/editar/aprobar/revertir/borrar` llaman a
  `asegurarEventoAbierto` (por el `evento_rubro` de la cotización). `aprobar` bloquea la fila de
  `evento_rubro`.
- `listarCotizaciones(db, { eventoRubroId?, proveedorId?, estado? })` trae evento (id, nombre),
  `dias` del `evento_rubro` y `totalArs` con los tipos **de su evento**. `idMasBarata` usa `totalArs`.
- `resumenEvento(db, eventoId)` → `{ grupos: [{ id, nombre, rubros: [{ eventoRubroId, rubroId, nombre,
  dias, cotizaciones, aprobada, presupuesto, pagado }] }], totales: { presupuesto, aprobado, pagado }
  (cada uno `TotalArs`), tipos }`.
- Helper de tests `idEventoRubro(db, nombre = "Sonido")` sobre Vibra 2027.
- Tests nuevos: una aprobada por rubro y por evento (dos eventos con Sonido no se pisan); escrituras con
  evento cerrado fallan; totales del resumen. Commit.

### Tarea 6 — Tareas y recordatorios por evento

**Archivos:** `src/lib/tareas.ts`, `src/lib/recordatorios.ts`, `src/lib/notificaciones.ts`,
`src/lib/envio-recordatorios.ts`, tests de esos módulos y `tests/helpers/tareas.ts`.

- `tareaSchema` con `eventoId` y `grupoId`. `crear/editar/cambiarEstado/borrar` y
  `crearRecordatorioManual/cancelarRecordatorio` exigen evento abierto. `listarTareas(db, { eventoId?,
  grupoId?, responsableId?, estado? })` trae `evento`. `resumenTareas(db, { eventoIds }, ahora)`.
- `listarNotificaciones` suma el nombre del evento. El asunto del email usa el nombre del evento.
- Tests: crear con evento cerrado falla; listar filtra por evento. Commit.

### Tarea 7 — Operaciones (server actions sin Next)

**Archivos:** `src/app/(app)/eventos/operaciones.ts` + `actions.ts` (nuevos),
`src/app/(app)/configuracion/grupos/operaciones.ts` + `actions.ts` (nuevos), presupuestos y tareas
`operaciones.ts`, borrar `configuracion/rubros/*` y `configuracion/tipos-cambio/*`, tests en
`tests/eventos/operaciones.test.ts`, `tests/configuracion/operaciones.test.ts`,
`tests/presupuestos/operaciones.test.ts`, `tests/tareas/operaciones.test.ts`.

Operaciones nuevas (todas `exigir(actor, "configurar")`): `altaEvento`, `edicionEvento`, `cierreEvento`,
`reaperturaEvento`, `guardadoTipoCambio`, `altaRubrosEvento`, `bajaRubroEvento`, `edicionRubroEvento`,
`registroPago`, `altaGrupo`, `edicionGrupo`, `movimientoGrupo`, `bajaGrupo`, `altaRubro`, `edicionRubro`,
`bajaRubro`. Tests: editor → `SIN_PERMISO`; admin ok. Commit.

### Tarea 8 — Páginas del evento

**Archivos:** `src/app/(app)/eventos/page.tsx`, `nuevo/page.tsx`, `[eventoId]/layout.tsx`,
`[eventoId]/page.tsx`, `[eventoId]/rubros/[eventoRubroId]/page.tsx`,
`[eventoId]/rubros/[eventoRubroId]/[cotizacionId]/page.tsx`, `[eventoId]/tareas/page.tsx`,
`[eventoId]/tareas/[tareaId]/page.tsx`, `[eventoId]/ajustes/page.tsx`, `src/components/recordar-evento.tsx`,
`src/components/total-evento.tsx`; páginas viejas de `presupuestos/` y `tareas/` pasan a redirecciones.

- Layout del evento: carga el evento (`notFound`), banner "Evento cerrado · solo lectura", escribe la
  cookie. Con evento cerrado ninguna página muestra botones de edición.
- Presupuesto del evento: cifras (presupuestado, aprobado, pagado en ARS + ≈ USD, rubros sin aprobar),
  pestañas por grupo, tabla Rubro · Presupuesto · Aprobado · Pagado · Desvío.
- Rubro del evento: lo actual + tarjeta Presupuesto / Pagado (formularios solo para admin).
- Commit.

### Tarea 9 — Tablero, navegación, configuración y proveedor

**Archivos:** `src/app/(app)/page.tsx`, `layout.tsx`, `nav.tsx`, `destinos.ts`, `mas/page.tsx`,
`configuracion/grupos/page.tsx`, `proveedores/[proveedorId]/page.tsx`, `src/components/campanita.tsx`,
`src/components/selector-evento.tsx` (nuevo).

- Tablero: tarjeta por evento activo + próximas tareas de todos con nombre del evento.
- Barra lateral: selector de evento + Eventos; Presupuestos y Tareas apuntan al evento de la URL o a la
  redirección. Celular: selector en el encabezado de las páginas del evento.
- Administración: Usuarios y Grupos y rubros.
- Proveedor: cotizaciones agrupadas por evento.
- Commit.

### Tarea 10 — E2E y verificación

**Archivos:** `e2e/presupuestos.spec.ts`, `e2e/tareas.spec.ts`, `e2e/eventos.spec.ts` (nuevo).

- Adaptar los dos flujos (entrar por Vibra Bolivia 2027).
- Nuevo: crear evento copiando rubros de Vibra, cargar cotización, cargar tipos, cerrar, verificar que
  no aparece "Nueva cotización" y que aparece el banner.
- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run e2e`, `npm run build`.
- Probar 0007 sobre una copia de `.data/pglite`, después `npm run db:migrate` en la base local.
- Commit.
