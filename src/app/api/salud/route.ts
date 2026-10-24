import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Para el healthcheck de Docker: la app responde y llega a la base. Sin sesión, sin datos. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[salud] la base no responde", error);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
