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

/** Número escrito como texto ("USD 9.000,50", "3,500", "10%"). Un solo separador seguido de 3 dígitos es de miles. */
export function aNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(limpio)) return null;
  const ultimo = Math.max(limpio.lastIndexOf("."), limpio.lastIndexOf(","));
  const separadores = limpio.match(/[.,]/g)?.length ?? 0;
  const decimales = ultimo === -1 ? "" : limpio.slice(ultimo + 1);
  const repetido = ultimo !== -1 && limpio.split(limpio[ultimo]).length > 2;
  // "0.500" es medio, no quinientos: con parte entera 0 el separador es decimal.
  const enteroCero = /^-?0*$/.test(limpio.slice(0, ultimo));
  const esDecimal = ultimo !== -1 && !repetido && (enteroCero || !(separadores === 1 && decimales.length === 3));
  const entero = (esDecimal ? limpio.slice(0, ultimo) : limpio).replace(/[.,]/g, "");
  const n = Number(esDecimal ? `${entero}.${decimales}` : entero);
  return Number.isFinite(n) ? n : null;
}

const MONEDA_ALIAS: Record<string, Moneda> = { BS: "BOB", BOLIVIANOS: "BOB", US: "USD", DOLARES: "USD", PESOS: "ARS" };

/** Lo que manda el modelo no siempre respeta el esquema: se acepta con tolerancia y lo dudoso queda vacío. */
const leidosSchema = z.object({
  proveedor: z.string().trim().min(1).nullable().catch(null),
  moneda: z
    .unknown()
    .optional()
    .transform((v): Moneda | null => {
      if (typeof v !== "string") return null;
      const m = v.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase();
      return (MONEDAS as readonly string[]).includes(m) ? (m as Moneda) : (MONEDA_ALIAS[m] ?? null);
    }),
  precioPorDia: z.unknown().optional().transform(aNumero),
  descuento2DiasPorcentaje: z.unknown().optional().transform(aNumero),
  descripcion: z.string().nullable().catch(null).transform((v) => v ?? ""),
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

/** Los datos de la herramienta; si el modelo contestó con JSON en texto, ese JSON. */
function entradaDe(contenido: Anthropic.ContentBlock[]): unknown {
  const llamada = contenido.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA);
  const crudo =
    llamada?.type === "tool_use"
      ? llamada.input
      : contenido
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .match(/\{[\s\S]*\}/)?.[0];
  if (typeof crudo !== "string") return crudo ?? null;
  try {
    return JSON.parse(crudo);
  } catch {
    return null;
  }
}

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

  const entrada = entradaDe(respuesta.content);
  const leidos = entrada === null ? null : leidosSchema.safeParse(entrada);
  const datos = leidos?.success ? leidos.data : null;
  // Sin ningún dato útil no hay nada que completar.
  if (!datos || (!datos.proveedor && !datos.moneda && datos.precioPorDia === null && !datos.descripcion)) {
    console.error(
      "Lectura de PDF: respuesta sin datos",
      respuesta.stop_reason,
      // Solo la forma de la respuesta: el contenido de la cotización no va a los logs.
      JSON.stringify(
        respuesta.content.map((b) =>
          b.type === "tool_use" && b.input && typeof b.input === "object"
            ? { type: b.type, campos: Object.keys(b.input) }
            : { type: b.type },
        ),
      ),
    );
    throw new ErrorNegocio(NO_SE_PUDO);
  }
  return {
    proveedorId: emparejarProveedor(datos.proveedor, contexto.proveedores),
    proveedor: datos.proveedor,
    moneda: datos.moneda,
    precioDia: aCampo(datos.precioPorDia),
    descuento2Dias: aCampo(datos.descuento2DiasPorcentaje),
    descripcion: datos.descripcion.trim().slice(0, 2000),
  };
}
