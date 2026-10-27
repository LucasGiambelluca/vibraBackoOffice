import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { esProduccion } from "@/lib/entorno";

// Sin secreto, Better Auth usa uno por defecto y cualquiera podría firmar sesiones.
if (esProduccion() && !process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET es obligatorio en producción");
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    // Solo el admin da de alta usuarios (src/lib/users.ts).
    disableSignUp: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "editor", input: false },
      recibirEmails: { type: "boolean", required: false, defaultValue: true, input: false },
    },
  },
  session: {
    // Una sesión robada sirve como mucho 12 horas; se renueva con el uso cada hora.
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60,
  },
  // Siempre activo (Better Auth solo lo activa solo en producción, y el dev server
  // puede quedar expuesto por un túnel). Las E2E lo apagan: hacen muchos logins seguidos.
  rateLimit: {
    enabled: process.env.AUTH_SIN_LIMITE !== "1",
    window: 60,
    max: 100,
    customRules: {
      // 5 intentos de login cada 15 minutos por IP.
      "/sign-in/email": { window: 15 * 60, max: 5 },
      "/change-password": { window: 15 * 60, max: 5 },
    },
  },
  // El nombre lo cambia solo el admin: así nadie se hace pasar por otro.
  disabledPaths: ["/update-user"],
  plugins: [nextCookies()],
});
