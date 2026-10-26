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
- To-do list general del evento, con recordatorios por email y en la app.
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
   Se guarda quién aprobó y cuándo. Si un editor edita una aprobada, vuelve a *pendiente*
   hasta que el admin la apruebe de nuevo; si la edita el admin, sigue aprobada.
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

## 4. Recordatorios

### Datos

| Entidad | Campos |
|---|---|
| **Recordatorio** | id, tarea, fecha_hora (timestamptz), origen (automático / manual), tipo automático (3_dias_antes / dia_vencimiento / vencida_diario), creado por, enviado_at, cancelado_at |
| **Notificación** | id, usuario, tarea, mensaje, leída, creada_at |
| **Usuario** (campo extra) | recibir_emails (bool, default sí) |

### Reglas

1. Al crear una tarea con fecha límite, o al cambiarla, se (re)generan los automáticos:
   **3 días antes** y **el día del vencimiento**, ambos a las 09:00 hora de La Paz.
   Los automáticos pendientes anteriores se cancelan.
2. **Vencida**: mientras la tarea no esté *hecha* y su fecha límite haya pasado, se
   envía un recordatorio diario a las 09:00. El worker genera el del día siguiente al
   enviar el de hoy.
3. **Manuales**: el creador de la tarea (o un admin) agrega recordatorios en fecha y
   hora puntual. Precisión: 1 minuto.
4. Al marcar la tarea como *hecha* (o borrarla) se cancelan todos sus recordatorios pendientes.
5. Destinatario: el responsable de la tarea; si no tiene, todos los admins.
6. Zona horaria del evento: `America/La_Paz`. Fechas se guardan en UTC.

### Funcionamiento

- Contenedor **worker** con `node-cron`, corre **cada minuto**.
- Toma recordatorios con `fecha_hora <= now()`, `enviado_at IS NULL`, `cancelado_at IS NULL`
  usando `SELECT ... FOR UPDATE SKIP LOCKED` y, en la misma transacción, crea la
  notificación y marca `enviado_at` → sin duplicados aunque corran dos workers.
- El email se envía después del commit. Si falla, se registra el error y se reintenta
  en la corrida siguiente (máx. 5 intentos, campo `intentos_email`).
- Email por **SMTP** (Nodemailer), con link directo a la tarea. Se omite si el usuario
  tiene `recibir_emails = false`.
- En la app: **campanita** en el encabezado con cantidad de no leídas y lista
  (marcar leída / marcar todas).

## 5. Arquitectura

Desplegado en **VPS Linux propio** con Docker y dominio propio. Sin servicios cloud externos
salvo el servidor SMTP.

| Pieza | Tecnología |
|---|---|
| App | **Next.js** (App Router) + TypeScript, `output: 'standalone'`, contenedor Docker |
| UI | Tailwind CSS + shadcn/ui |
| Base de datos | **Postgres 17** en contenedor, volumen persistente; **Drizzle ORM** + migraciones |
| Auth | **Better Auth** embebido: email + contraseña, alta solo por invitación de admin, sesiones en Postgres. Rol en tabla `usuario`. |
| Adjuntos | PDF en volumen `uploads/`, servidos por ruta protegida (requiere sesión). Máx. 10 MB. |
| Worker | Contenedor con `node-cron`, comparte código y DB con la app |
| Email | SMTP configurable por variables de entorno (`SMTP_HOST`, `SMTP_USER`, ...) |
| Proxy / HTTPS | **Caddy** con certificado automático (Let's Encrypt) |
| Orquestación | `docker-compose.yml`: `caddy`, `app`, `worker`, `db`, `backup` |

### Módulos

| Archivo | Responsabilidad |
|---|---|
| `lib/money.ts` | Funciones puras: total de cotización, ahorro, conversión, total del evento. Sin dependencias de DB. |
| `lib/permissions.ts` | `can(rol, accion)`: única fuente de verdad de permisos. |
| `lib/reminders.ts` | Funciones puras: calcular fechas de recordatorios automáticos a partir de la fecha límite. |
| `db/schema.ts` | Definición de tablas Drizzle. |
| `db/seed.ts` | Áreas, rubros iniciales y primer admin. |
| `worker/index.ts` | Loop de envío de recordatorios. |
| `app/...` | Pantallas por sección, cada una con sus server actions. |

### Flujo de una escritura

Formulario → server action → valida sesión y `can(rol, accion)` → valida input con
**Zod** → escribe en DB (transacción si toca varias filas) → `revalidatePath`.

## 6. Manejo de errores

- Validación Zod en servidor; errores por campo devueltos al formulario.
- Acción no permitida → error 403 con mensaje claro, sin cambios en DB.
- Aprobación en transacción: nunca dos cotizaciones aprobadas en un rubro.
- Tipo de cambio faltante → advertencia visible en totales.
- Adjunto > 10 MB o no PDF → rechazado en cliente y servidor.
- Falla de SMTP → reintento en la próxima corrida; la notificación en la app ya quedó creada.
- Worker caído → los recordatorios pendientes se envían al reiniciar (no se pierden).

## 7. Pruebas

- **Unitarias (Vitest)**: `money.ts` (1 y 2 días, descuento 0 / 100, conversión,
  tipo de cambio faltante, redondeo), `permissions.ts` (matriz completa) y
  `reminders.ts` (fechas automáticas, zona horaria La Paz, cambio de fecha límite).
- **Integración** (Postgres de prueba en Docker): transacción de aprobación; worker
  procesa cada recordatorio una sola vez; cancelación al marcar *hecha*.
- **E2E (Playwright)**: login → cargar cotización → aprobar → total correcto en tablero;
  crear tarea con recordatorio → aparece en campanita.

## 8. Deploy y operación

- Repositorio en GitHub. En el VPS: `git pull && docker compose up -d --build`;
  las migraciones corren al iniciar el contenedor `app`.
- Variables de entorno en `.env` del VPS (no versionado); `.env.example` en el repo.
- **Backups**: contenedor `backup` hace `pg_dump` diario y conserva 14 días; los
  adjuntos (`uploads/`) se incluyen en el mismo backup.
- Dominio apuntado al VPS; Caddy gestiona HTTPS.
