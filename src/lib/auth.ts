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
  plugins: [nextCookies()],
});
