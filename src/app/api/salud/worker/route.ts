import { db } from "@/db";
import { workerVivo } from "@/lib/latido";

/** Para el monitor externo: 503 si el worker de recordatorios no completó un ciclo hace rato. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const ok = await workerVivo(db);
    return Response.json({ ok }, { status: ok ? 200 : 503, headers });
  } catch (error) {
    console.error("[salud] no se pudo leer el latido del worker", error);
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
