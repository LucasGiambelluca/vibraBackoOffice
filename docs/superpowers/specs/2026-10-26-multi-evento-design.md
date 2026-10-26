# Multi-evento — diseño (parte 1 de 3)

Fecha: 2026-10-26 · Estado: aprobado en conversación, pendiente de revisión escrita.

## Contexto

El back office nació atado a Vibra Bolivia 2027: áreas fijas, un catálogo de rubros único, cotizaciones y
tareas sin evento, tipos de cambio globales con base BOB. La productora lo necesita para **todos sus
eventos**, guardando historial para comparar año a año costos, proveedores, gestión de tareas y
presupuesto vs real.

El trabajo se divide en tres partes, cada una con su spec, plan y entrega:

1. **Base multi-evento** (este documento).
2. **Archivos**: fotos y PDF (varios) en evento, rubro del evento, cotización y tarea.
3. **Historial y comparación**: reportes entre eventos/años en USD (costos por rubro y grupo,
   presupuesto → aprobado → pagado, proveedores, cumplimiento de tareas).

## Decisiones

| Tema | Decisión |
|---|---|
| Arquitectura | Columna de evento en los datos (una sola base). Proveedores y usuarios globales. |
| Agrupación | Las áreas pasan a ser **grupos** editables por el admin. Un nivel: grupo → rubro. |
| Catálogo | Rubros comunes a toda la productora; cada evento elige cuáles usa. |
| Moneda | Base **ARS**, con equivalente en USD. Monedas de carga: ARS, USD, BOB. |
| Tipo de cambio | Uno por evento (ARS por USD, ARS por BOB), se congela al cerrar. |
| Real | Lo **pagado** de verdad por rubro, aparte de la cotización aprobada. |
| Presupuesto | Objetivo **por rubro** del evento; grupo y evento suman. |
| Cierre | Evento cerrado = solo lectura, validado en el servidor. El admin puede reabrir. |
| Tareas | Siempre pertenecen a un evento. |
| Simultáneos | Varios eventos activos a la vez. |

## Modelo de datos

### Global (de la productora)

- **`grupo`** (reemplaza `area`): `id integer pk`, `nombre text unique not null`, `orden integer not null`.
- **`rubro`**: `id`, `nombre unique`, `grupo_id → grupo` (restrict). Se elimina la columna `dias`.
- **`proveedor`**, **`user`**: sin cambios.

### Por evento

- **`evento`**: `id text pk`, `nombre text unique not null`, `fecha_inicio date null`,
  `fecha_fin date null`, `lugar text null`, `estado text not null default 'activo'`
  (check `in ('activo','cerrado')`), `cerrado_por → user` (set null), `cerrado_at timestamptz null`,
  `created_at`.
- **`evento_rubro`**: `id text pk`, `evento_id → evento` (restrict), `rubro_id → rubro` (restrict),
  `dias integer not null default 1` (check `in (1,2)`),
  `presupuesto numeric(14,2) null`, `presupuesto_moneda text null`,
  `pagado numeric(14,2) null`, `pagado_moneda text null`, `pagado_fecha date null`, `pagado_nota text null`.
  Único `(evento_id, rubro_id)`. Checks: monto y moneda van juntos (los dos null o los dos con valor),
  monedas en `('ARS','USD','BOB')`, montos `>= 0`.
- **`evento_tipo_cambio`**: `evento_id → evento` (cascade), `moneda text` (check `in ('USD','BOB')`),
  `valor_ars numeric(18,6) not null` (check `> 0`), `actualizado_por → user`, `updated_at`.
  PK `(evento_id, moneda)`. Reemplaza `tipo_cambio`.
- **`cotizacion`**: `rubro_id` se reemplaza por `evento_rubro_id → evento_rubro` (restrict). El índice
  único parcial "una aprobada" pasa a `(evento_rubro_id) where estado = 'aprobada'`. Monedas
  ARS, USD y BOB como hoy. El resto sin cambios (incluido el `adjunto` único hasta la parte 2).
- **`tarea`**: `evento_id → evento` (restrict, not null) y `area_id` → `grupo_id → grupo`. Índice por
  `evento_id`.
- **`recordatorio`**, **`notificacion`**, **`latido`**: sin cambios.

### Reglas

- **Evento cerrado**: toda escritura que toque un evento (cotización: crear/editar/aprobar/revertir/
  borrar; tarea: crear/editar/estado/borrar/recordatorio manual; evento_rubro: agregar/quitar/
  presupuesto/pagado; tipos de cambio; datos del evento) llama a `asegurarEventoAbierto(db, eventoId)`,
  que lanza un error de dominio si está cerrado. La UI además oculta los botones y muestra un banner.
- **Cerrar** (admin): exige tipo de cambio cargado para cada moneda distinta de ARS usada en el evento
  (cotizaciones, presupuestos, pagos). Guarda `cerrado_por` y `cerrado_at`.
- **Reabrir** (admin): vuelve a `activo` y limpia `cerrado_por`/`cerrado_at`.
- **Borrado**: no se borra un rubro del catálogo usado en algún `evento_rubro`, ni un grupo con rubros
  (FK restrict + mensaje claro). Quitar un rubro de un evento solo si no tiene cotizaciones.
  Borrar un evento: fuera de alcance (no hay botón).
- **Crear evento**: rubros elegidos a mano o "copiar de [evento]": copia rubro y `dias`, y opcionalmente
  el presupuesto como punto de partida. Nunca copia cotizaciones, pagos ni tareas.

## Moneda

- `src/lib/money.ts` pasa de base BOB a base ARS: `TiposCambio = Partial<Record<'USD'|'BOB', number>>`
  (ARS por unidad); `aArs`, `desdeArs`, `totalEvento` → `{ ars, faltan }`, y `aUsd(montoArs, tipos)`
  para el equivalente. Se mantiene la aritmética entera con BigInt (centavos, millonésimas).
- BOB → USD pasa por ARS.
- Formato `es-AR`: `ARS 1.234,56`. Los totales muestran `ARS … · ≈ USD …`; sin tipo de USD se omite el
  equivalente y se avisa.
- Simplificación consciente: un tipo de cambio por evento, no por fecha de pago.

## Pantallas y navegación

El evento vive en la URL (`/eventos/[eventoId]/…`). Una cookie recuerda el último evento abierto:
`/presupuestos` y `/tareas` redirigen al de la cookie, o a `/eventos` si no hay.

| Ruta | Contenido |
|---|---|
| `/` | Tarjeta por evento activo (presupuestado, aprobado, pagado, avance de rubros, tareas vencidas) + próximas tareas de todos los activos con el nombre del evento. |
| `/eventos` | Activos arriba, cerrados (historial) abajo. "Nuevo evento" solo admin. |
| `/eventos/nuevo` | Nombre, fechas, lugar, tipos de cambio, rubros (a mano o copiar de otro evento). |
| `/eventos/[id]` | Presupuestos del evento: stats, pestañas por grupo, tabla con Presupuesto · Aprobado · Pagado · Desvío. |
| `/eventos/[id]/rubros/[eventoRubroId]` | Cotizaciones del rubro (como hoy) + bloque Presupuesto/Pagado. |
| `/eventos/[id]/rubros/[eventoRubroId]/[cotizacionId]` | Editar cotización (como hoy). |
| `/eventos/[id]/tareas`, `/eventos/[id]/tareas/[tareaId]` | Como hoy, filtradas al evento. |
| `/eventos/[id]/ajustes` | Datos, rubros del evento, tipos de cambio, cerrar/reabrir (admin). |
| `/configuracion/grupos` | Grupos (crear, renombrar, ordenar) con su catálogo de rubros. Reemplaza `/configuracion/rubros`. Se elimina `/configuracion/tipos-cambio`. |
| `/proveedores/[id]` | Cotizaciones agrupadas por evento. |

- Escritorio: selector del evento actual arriba en la barra lateral. Celular: nombre del evento en el
  encabezado, tocándolo abre el selector. La barra de pestañas mantiene Tablero · Presupuestos ·
  Tareas · Más.
- Campanita: cada aviso muestra el evento.
- Evento cerrado: banner "Evento cerrado · solo lectura" y sin acciones de edición.

### Permisos

| Acción | Admin | Editor |
|---|---|---|
| Crear, cerrar, reabrir evento; editar datos y tipos de cambio | ✓ | |
| Agregar/quitar rubros del evento; cargar presupuesto y pagado | ✓ | |
| Grupos y catálogo de rubros | ✓ | |
| Cotizaciones y tareas (cargar/editar) | ✓ | ✓ |
| Aprobar / revertir cotización | ✓ | |

## Migración de datos (0007)

Una migración SQL transaccional:

1. Crear `grupo` desde `area` (mismos `id` y `nombre`, `orden = id`).
2. Crear el evento "Vibra Bolivia 2027", `activo`, fechas y lugar null.
3. Crear un `evento_rubro` por cada rubro existente con su `dias`; quitar `rubro.dias`; `rubro.area_id`
   → `grupo_id`.
4. `cotizacion.evento_rubro_id` desde el `evento_rubro` del rubro; quitar `rubro_id`; recrear el índice
   único parcial.
5. `tarea.evento_id` = Vibra 2027; `area_id` → `grupo_id`.
6. Tipos de cambio: si existen ambos, `ARS por USD = valor_bob(USD) / valor_bob(ARS)` y
   `ARS por BOB = 1 / valor_bob(ARS)`. Si falta el de ARS, no se cargan y la UI pide cargarlos.
7. Borrar `area` y `tipo_cambio`.

La app no está en producción: solo afecta la base local. Igual se prueba sobre una copia antes de
aplicarla.

## Tests

- **Unitarios**: `money.ts` en base ARS (BOB→ARS, USD→ARS, equivalente USD, redondeos exactos).
- **Integración (PGlite)**:
  - Toda escritura sobre un evento cerrado falla (lista completa de la sección Reglas).
  - Una aprobada por rubro y por evento: dos eventos con el mismo rubro no se pisan.
  - Copiar rubros copia rubro y `dias` (y presupuesto si se pide), nunca cotizaciones.
  - No se cierra un evento con tipos de cambio faltantes.
  - No se borra un rubro ni un grupo en uso.
  - Migración: base con el esquema 0006 + datos → migrar → verificar cada dato.
- **E2E**: los dos flujos actuales adaptados a eventos + uno nuevo: crear evento copiando rubros,
  cargar cotización, cerrar y verificar que no deja editar.
- Los tests existentes se adaptan, no se borran.

## Fuera de alcance

Archivos múltiples y fotos (parte 2), reportes de comparación (parte 3), permisos por evento,
borrar eventos, tipo de cambio por fecha de pago.
