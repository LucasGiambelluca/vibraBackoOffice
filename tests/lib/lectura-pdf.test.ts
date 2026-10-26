import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { emparejarProveedor, leerCotizacionPdf } from "@/lib/lectura-pdf";

const PROVEEDORES = [
  { id: "p1", nombre: "Sonido Andino" },
  { id: "p2", nombre: "LED Show" },
];
const CONTEXTO = { rubro: "Sonido", dias: 2, proveedores: PROVEEDORES };

/** Cliente falso: devuelve `respuesta` (o lanza `error`) y guarda el pedido. */
function cliente(respuesta: object | null, error?: Error) {
  const parse = vi.fn(async () => {
    if (error) throw error;
    return respuesta;
  });
  return { parse, cliente: { beta: { messages: { parse } } } as unknown as Pick<Anthropic, "beta"> };
}

describe("emparejarProveedor", () => {
  it("compara sin mayúsculas, tildes ni sufijos", () => {
    expect(emparejarProveedor("SONIDO ANDINO S.R.L.", PROVEEDORES)).toBe("p1");
    expect(emparejarProveedor("Led show", PROVEEDORES)).toBe("p2");
    expect(emparejarProveedor("Andina Luces", PROVEEDORES)).toBeNull();
    expect(emparejarProveedor(null, PROVEEDORES)).toBeNull();
    expect(emparejarProveedor("...", PROVEEDORES)).toBeNull();
  });
});

describe("leerCotizacionPdf", () => {
  it("manda el PDF en base64 con el contexto del rubro y mapea la respuesta", async () => {
    const { parse, cliente: c } = cliente({
      stop_reason: "end_turn",
      parsed_output: {
        proveedor: "Sonido Andino SRL",
        moneda: "USD",
        precioPorDia: 1499.999,
        descuento2DiasPorcentaje: 10,
        descripcion: "  PA line array y operador. ",
      },
    });
    const leida = await leerCotizacionPdf(Buffer.from("%PDF-1.4"), CONTEXTO, c);
    expect(leida).toEqual({
      proveedorId: "p1",
      proveedor: "Sonido Andino SRL",
      moneda: "USD",
      precioDia: "1500",
      descuento2Dias: "10",
      descripcion: "PA line array y operador.",
    });

    const pedido = (parse.mock.calls[0] as unknown[])[0] as {
      model: string;
      messages: { content: { type: string; source?: { data: string }; text?: string }[] }[];
    };
    expect(pedido.model).toBe("claude-opus-5-5");
    const [documento, texto] = pedido.messages[0].content;
    expect(documento).toMatchObject({ type: "document", source: { data: Buffer.from("%PDF-1.4").toString("base64") } });
    expect(texto.text).toContain('rubro "Sonido"');
    expect(texto.text).toContain("2 días");
  });

  it("campos vacíos quedan en null", async () => {
    const { cliente: c } = cliente({
      stop_reason: "end_turn",
      parsed_output: { proveedor: null, moneda: null, precioPorDia: null, descuento2DiasPorcentaje: null, descripcion: "" },
    });
    expect(await leerCotizacionPdf(Buffer.from(""), CONTEXTO, c)).toMatchObject({
      proveedorId: null,
      moneda: null,
      precioDia: null,
      descuento2Dias: null,
    });
  });

  it("si la API falla, se niega o no devuelve datos, pide completar a mano", async () => {
    const error = new Anthropic.APIError(500, undefined, "caída", new Headers());
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const c of [
      cliente(null, error).cliente,
      cliente({ stop_reason: "refusal", parsed_output: null }).cliente,
      cliente({ stop_reason: "end_turn", parsed_output: null }).cliente,
    ])
      await expect(leerCotizacionPdf(Buffer.from(""), CONTEXTO, c)).rejects.toThrow(
        "No se pudo leer el PDF. Completá los datos a mano.",
      );
    vi.restoreAllMocks();
  });
});
