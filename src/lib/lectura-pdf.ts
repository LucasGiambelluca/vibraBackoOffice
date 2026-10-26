import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ErrorNegocio } from "@/lib/acciones";
import { MONEDAS, type Moneda } from "@/lib/money";

/** Si no hay clave de MiniMax, el botón "Completar desde PDF" no aparece. */
export function hayLecturaPdf(): boolean {
  return Boolean(process.env.MINIMAX_API_KEY);
}

/** MiniMax expone una API compatible con la de Anthropic: se usa el mismo SDK. */
const clienteMiniMax = () =>
  new Anthropic({ apiKey: process.env.MINIMAX_API_KEY, baseURL: "https://api.minimax.io/anthropic", timeout: 120_000 });

export const MODELO = "MiniMax-M3";
const HERRAMIENTA = "cargar_cotizacion";

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
  cliente: Pick<Anthropic, "messages"> = clienteMiniMax(),
): Promise<CotizacionLeida> {
  let respuesta;
  try {
    respuesta = await cliente.messages.create({
      model: MODELO,
      max_tokens: 8000,
      // La respuesta llega como la entrada de una herramienta obligatoria: JSON con forma fija.
      tools: [
        {
          name: HERRAMIENTA,
          description: "Carga en el sistema los datos sacados de la cotización.",
          input_schema: z.toJSONSchema(respuestaSchema) as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: HERRAMIENTA },
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
                `Sacá estos datos y cargalos con la herramienta ${HERRAMIENTA}:`,
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

  const llamada = respuesta.content.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA);
  const leidos = llamada?.type === "tool_use" ? respuestaSchema.safeParse(llamada.input) : null;
  if (!leidos?.success) throw new ErrorNegocio(NO_SE_PUDO);
  const datos = leidos.data;
  return {
    proveedorId: emparejarProveedor(datos.proveedor, contexto.proveedores),
    proveedor: datos.proveedor,
    moneda: datos.moneda,
    precioDia: aCampo(datos.precioPorDia),
    descuento2Dias: aCampo(datos.descuento2DiasPorcentaje),
    descripcion: datos.descripcion.trim().slice(0, 2000),
  };
}
