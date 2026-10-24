import { leerPdf } from "@/lib/adjuntos";
import { auth } from "@/lib/auth";

export async function GET(request: Request, ctx: RouteContext<"/api/adjuntos/[nombre]">) {
  const sesion = await auth.api.getSession({ headers: request.headers });
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const { nombre } = await ctx.params;
  const pdf = await leerPdf(nombre);
  if (!pdf) return new Response("No encontrado", { status: 404 });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
