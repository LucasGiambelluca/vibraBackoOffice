# Back office Vibra Bolivia 2027

Sistema de gestión interno del evento. Next.js + Drizzle + Better Auth.

## Requisitos

- Node.js 20 o superior
- En local no hace falta Postgres: sin `DATABASE_URL` se usa PGlite (Postgres embebido) en `.data/pglite`.

## Configuración

```bash
npm install
cp .env.example .env.local
```

En `.env.local` completá `BETTER_AUTH_SECRET` (`openssl rand -base64 32`). Dejá `DATABASE_URL` vacío para usar PGlite; en el VPS apuntalo al Postgres. En producción la app no arranca sin `DATABASE_URL` ni `BETTER_AUTH_SECRET`.

## Base de datos

```bash
npm run db:migrate
npm run db:seed -- <email> "<nombre>" <contraseña>   # crea el primer admin
```

El resto de los usuarios los da de alta un admin desde Configuración → Usuarios (no hay registro público).

## Desarrollo

```bash
npm run dev    # http://localhost:3000
npm test       # Vitest (usa PGlite en memoria, no toca .data/)
npm run lint
```

## Importante: PGlite admite un solo proceso

`.data/pglite` solo puede abrirlo un proceso a la vez. **No corras `db:migrate` ni `db:seed` con `npm run dev` encendido**: pará el servidor, corré el script y volvé a levantarlo.
