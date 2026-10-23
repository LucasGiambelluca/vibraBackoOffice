# Vibra Bolivia 2027 — Back office de presupuestos y tareas

Fecha: 2026-10-23
Fuente: `Vibra 2027.pdf` (punto 6: Gestión Presupuestaria y Control de Gestión)

## 1. Objetivo

App web privada para que el equipo de producción de Vibra 2027 ordene todos los
presupuestos del evento (comparando cotizaciones de distintos proveedores por rubro)
y haga seguimiento de las tareas generales, clasificado por las 6 áreas del evento.

### Alcance — Etapa 1

- Presupuestos: rubros, cotizaciones comparables, aprobación, totales multimoneda.
- Proveedores con datos de contacto.
- To-do list general del evento.
- Usuarios con login y roles admin / editor.

### Fuera de alcance (Etapa 2)

Listado de artistas y riders, mapa del evento y de evacuación, señalética,
activaciones, cobertura Vibo TV. Mientras tanto se gestionan como rubros o tareas.

## 2. Modelo de datos

| Entidad | Campos |
|---|---|
| **Área** | id, nombre. Fijas (seed): Marketing y Audiovisual; Técnica, Escenario y Backline; Logística, Hospitalidad y RRHH; Infraestructura y Predio; Seguridad y Prevención; Gestión Presupuestaria. |
| **Rubro** | id, nombre, área, días a contratar (1 o 2). Seed inicial: Técnica, Sonido, Pantalla, Escenario, Vallas blancas, Vallas freestanding, Luces. El admin crea más. |
| **Proveedor** | id, nombre, contacto (persona), teléfono, email, notas |
| **Cotización** | id, rubro, proveedor, descripción de lo ofrecido, moneda (BOB/USD/ARS), precio por día (decimal), % descuento por 2 días (decimal 0–100), adjunto PDF opcional, estado (pendiente / aprobada / descartada), creada por, fechas |
| **Tipo de cambio** | moneda (USD, ARS), valor en BOB, actualizado por, fecha |
| **Tarea** | id, título, área, responsable (usuario), fecha límite opcional, estado (pendiente / en curso / hecha), notas |
| **Usuario** | id, nombre, email, rol (admin / editor) |

### Reglas de negocio

1. **Total de una cotización** según los días del rubro:
   - 1 día: `precio_dia`
   - 2 días: `precio_dia × 2 × (1 − desc% / 100)`
   - Se muestra también el ahorro: `precio_dia × 2 × desc% / 100`.
2. **Conversión**: moneda de referencia BOB. `total_bob = total × tipo_cambio[moneda]` (BOB = 1).
   Totales del evento se muestran en BOB, USD y ARS.
3. **Aprobación**: un rubro tiene como máximo una cotización aprobada. Aprobar una
   pasa las demás del rubro a *descartada*, en una única transacción. Solo admin aprueba.
   Admin puede revertir una aprobación (vuelve a *pendiente*; las descartadas quedan descartadas).
4. **Total del evento** = suma de `total_bob` de cotizaciones aprobadas.
5. Si falta el tipo de cambio de una moneda usada, el total muestra una advertencia
   y no un número.
6. Montos se guardan como `numeric` (nunca float).

## 3. Pantallas

1. **Login** — email; solo usuarios dados de alta por un admin.
2. **Tablero**
   - Total del evento aprobado (BOB / USD / ARS).
   - Avance por área: rubros con cotización aprobada / total de rubros; tareas hechas / total.
   - Rubros sin cotización aprobada.
   - Tareas vencidas y que vencen en los próximos 7 días.
3. **Presupuestos**
   - Lista de rubros agrupada por área: cantidad de cotizaciones, monto aprobado.
   - Detalle de rubro: cotizaciones lado a lado (proveedor, descripción, precio/día,
     descuento, total en moneda original y en BOB, ahorro, adjunto). Resalta la más
     barata en BOB. Botón "Aprobar" (admin).
   - Formulario alta / edición de cotización.
4. **Proveedores** — lista con buscador, alta / edición, cotizaciones del proveedor.
5. **Tareas** — lista filtrable por área, responsable y estado; cambio de estado en
   un clic; alta / edición rápida.
6. **Configuración** (admin) — usuarios y roles, tipos de cambio, rubros.

### Permisos

| Acción | Editor | Admin |
|---|---|---|
| Ver todo | ✓ | ✓ |
| Crear / editar cotizaciones, proveedores, tareas | ✓ | ✓ |
| Aprobar / revertir cotización | | ✓ |
| Borrar registros | | ✓ |
| Configuración (usuarios, tipos de cambio, rubros) | | ✓ |

## 4. Arquitectura

- **Next.js** (App Router) + TypeScript, desplegado en **Vercel** (runtime Node.js).
- **UI**: Tailwind CSS + shadcn/ui.
- **Base de datos**: Postgres provisto por Vercel Marketplace (ej. Neon), acceso con
  **Drizzle ORM** y migraciones versionadas.
- **Auth**: proveedor del Vercel Marketplace (ej. Clerk) con alta por invitación.
  El rol vive en la tabla `usuario` de la app.
- **Archivos**: Vercel Blob privado; subida directa desde el cliente; PDF ≤ 4.5 MB.

### Módulos

| Archivo | Responsabilidad |
|---|---|
| `lib/money.ts` | Funciones puras: total de cotización, ahorro, conversión, total del evento. Sin dependencias de DB. |
| `lib/permissions.ts` | `can(rol, accion)`: única fuente de verdad de permisos. |
| `db/schema.ts` | Definición de tablas Drizzle. |
| `db/seed.ts` | Áreas y rubros iniciales. |
| `app/...` | Pantallas por sección, cada una con sus server actions. |

### Flujo de una escritura

Formulario → server action → valida sesión y `can(rol, accion)` → valida input con
**Zod** → escribe en DB (transacción si toca varias filas) → `revalidatePath`.

## 5. Manejo de errores

- Validación Zod en servidor; errores por campo devueltos al formulario.
- Acción no permitida → error 403 con mensaje claro, sin cambios en DB.
- Aprobación en transacción: nunca dos cotizaciones aprobadas en un rubro.
- Tipo de cambio faltante → advertencia visible en totales.
- Adjunto > 4.5 MB o no PDF → rechazado en cliente y servidor.

## 6. Pruebas

- **Unitarias (Vitest)**: `money.ts` (1 y 2 días, descuento 0 / 100, conversión,
  tipo de cambio faltante, redondeo) y `permissions.ts` (matriz completa).
- **Integración**: transacción de aprobación contra DB de prueba.
- **E2E (Playwright)**: login → cargar cotización → aprobar → total correcto en tablero.

## 7. Deploy

Repositorio en GitHub conectado a Vercel. Cada push genera preview; `main` va a
producción. Variables de entorno gestionadas con `vercel env`.
