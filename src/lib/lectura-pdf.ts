import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ErrorNegocio } from "@/lib/acciones";
import { MONEDAS, type Moneda } from "@/lib/money";

/** Si no hay clave de API, el botón "Completar desde PDF" no aparece. */
export function hayLecturaPdf(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const respuestaSchema = z.object({
  proveedor: z.string().nullable(),
  moneda: z.enum(MONEDAS).nullable(),
  precioPorDia: z.number().nullable(),
  descuento2DiasPorcentaje: z.number().nullable(),
  descripcion: z.string(),
});

/** Lo que se completa en el formulario. Nada se guarda: la persona revisa y guarda. */
export type CotizacionLeida = {
  proveedorId: string | null;
  /** El nombre tal como aparece en el PDF (para avisar si no está cargado). */
  proveedor: string | null;
  moneda: Moneda | null;
  precioDia: string | null;
  descuento2Dias: string | null;
  descripcion: string;
};

const NO_SE_PUDO = "No se pudo leer el PDF. Completá los datos a mano.";

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** El proveedor cargado cuyo nombre coincide con el del PDF (uno contiene al otro). */
export function emparejarProveedor(nombre: string | null, proveedores: { id: string; nombre: string }[]): string | null {
  if (!nombre) return null;
  const buscado = normalizar(nombre);
  if (!buscado) return null;
  const encontrado = proveedores.find((p) => {
    const candidato = normalizar(p.nombre);
    return candidato && (candidato.includes(buscado) || buscado.includes(candidato));
  });
  return encontrado?.id ?? null;
}

/** Número para el formulario: hasta 2 decimales, sin separadores de miles. */
const aCampo = (valor: number | null) => (valor === null || !Number.isFinite(valor) || valor < 0 ? null : String(Math.round(valor * 100) / 100));

export async function leerCotizacionPdf(
  pdf: Buffer,
  contexto: { rubro: string; dias: number; proveedores: { id: string; nombre: string }[] },
  cliente: Pick<Anthropic, "beta"> = new Anthropic(),
): Promise<CotizacionLeida> {
  let respuesta;
  try {
    respuesta = await cliente.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low", format: betaZodOutputFormat(respuestaSchema) },
      // Si el modelo declina, la API reintenta sola con otro modelo.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
            {
              type: "text",
              text: [
                `Este PDF es la cotización de un proveedor para el rubro "${contexto.rubro}" de un evento.`,
                `El rubro se contrata por ${contexto.dias === 1 ? "1 día" : "2 días"}.`,
                "Sacá estos datos:",
                "- proveedor: el nombre de la empresa que cotiza (no el cliente). null si no figura.",
                "- moneda: ARS (pesos argentinos), USD o BOB (bolivianos). null si no se puede saber.",
                "- precioPorDia: el precio de un día, sin descuentos. Si solo hay un total por varios días, dividilo por la cantidad de días. null si no hay precio.",
                "- descuento2DiasPorcentaje: el % de descuento por contratar 2 días, si lo ofrece. null si no.",
                "- descripcion: qué incluye, en español, en una o dos oraciones (equipos, cantidades, personal).",
              ].join("\n"),
            },
          ],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error("Lectura de PDF: error de la API", error.status, error.message);
      throw new ErrorNegocio(NO_SE_PUDO);
    }
    throw error;
  }

  const datos = respuesta.stop_reason === "refusal" ? null : respuesta.parsed_output;
  if (!datos) throw new ErrorNegocio(NO_SE_PUDO);
  return {
    proveedorId: emparejarProveedor(datos.proveedor, contexto.proveedores),
    proveedor: datos.proveedor,
    moneda: datos.moneda,
    precioDia: aCampo(datos.precioPorDia),
    descuento2Dias: aCampo(datos.descuento2DiasPorcentaje),
    descripcion: datos.descripcion.trim().slice(0, 2000),
  };
}
