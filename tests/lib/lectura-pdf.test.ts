import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { aNumero, emparejarProveedor, leerCotizacionPdf, MODELO } from "@/lib/lectura-pdf";

const PROVEEDORES = [
  { id: "p1", nombre: "Sonido Andino" },
  { id: "p2", nombre: "LED Show" },
];
const CONTEXTO = { rubro: "Sonido", dias: 2, proveedores: PROVEEDORES };

/** Cliente falso: devuelve `respuesta` (o lanza `error`) y guarda el pedido. */
function cliente(respuesta: object | null, error?: Error) {
  const create = vi.fn(async () => {
    if (error) throw error;
    return respuesta;
  });
  return { create, cliente: { messages: { create } } as unknown as Pick<Anthropic, "messages"> };
}

/** Respuesta con la herramienta llamada con `input`. */
const conHerramienta = (input: object) => ({
  stop_reason: "tool_use",
  content: [
    { type: "thinking", thinking: "..." },
    { type: "tool_use", id: "t1", name: "cargar_cotizacion", input },
  ],
});

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
    const { create, cliente: c } = cliente(
      conHerramienta({
        proveedor: "Sonido Andino SRL",
        moneda: "USD",
        precioPorDia: 1499.999,
        descuento2DiasPorcentaje: 10,
        descripcion: "  PA line array y operador. ",
      }),
    );
    const leida = await leerCotizacionPdf(Buffer.from("%PDF-1.4"), CONTEXTO, c);
    expect(leida).toEqual({
      proveedorId: "p1",
      proveedor: "Sonido Andino SRL",
      moneda: "USD",
      precioDia: "1500",
      descuento2Dias: "10",
      descripcion: "PA line array y operador.",
    });

    const pedido = (create.mock.calls[0] as unknown[])[0] as {
      model: string;
      tool_choice: { name: string };
      messages: { content: { type: string; source?: { data: string }; text?: string }[] }[];
    };
    expect(pedido.model).toBe(MODELO);
    expect(pedido.tool_choice).toEqual({ type: "tool", name: "cargar_cotizacion" });
    const [documento, texto] = pedido.messages[0].content;
    expect(documento).toMatchObject({ type: "document", source: { data: Buffer.from("%PDF-1.4").toString("base64") } });
    expect(texto.text).toContain('rubro "Sonido"');
    expect(texto.text).toContain("2 días");
  });

  it("acepta lo que el modelo manda fuera de formato y deja vacío lo dudoso", async () => {
    const { cliente: c } = cliente(
      conHerramienta({ proveedor: "LED Show", moneda: "Bs.", precioPorDia: "Bs 3.500", descripcion: null }),
    );
    expect(await leerCotizacionPdf(Buffer.from(""), CONTEXTO, c)).toEqual({
      proveedorId: "p2",
      proveedor: "LED Show",
      moneda: "BOB",
      precioDia: "3500",
      descuento2Dias: null,
      descripcion: "",
    });

    const otra = cliente(conHerramienta({ proveedor: "", moneda: "EUR", precioPorDia: "mil", descripcion: "Pantalla LED" }));
    expect(await leerCotizacionPdf(Buffer.from(""), CONTEXTO, otra.cliente)).toMatchObject({
      proveedorId: null,
      proveedor: null,
      moneda: null,
      precioDia: null,
      descripcion: "Pantalla LED",
    });
  });

  it("si el modelo contesta con JSON en texto en vez de usar la herramienta, lo usa igual", async () => {
    const { cliente: c } = cliente({
      stop_reason: "end_turn",
      content: [{ type: "text", text: 'Listo:\n```json\n{"proveedor":"Sonido Andino","moneda":"USD","precioPorDia":100}\n```' }],
    });
    expect(await leerCotizacionPdf(Buffer.from(""), CONTEXTO, c)).toMatchObject({ proveedorId: "p1", moneda: "USD", precioDia: "100" });
  });

  it("si la API falla o no llega ningún dato, pide completar a mano", async () => {
    const error = new Anthropic.APIError(500, undefined, "caída", new Headers());
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const c of [
      cliente(null, error).cliente,
      cliente({ stop_reason: "end_turn", content: [{ type: "text", text: "No puedo." }] }).cliente,
      cliente(conHerramienta({ proveedor: null, moneda: null, precioPorDia: null, descuento2DiasPorcentaje: null, descripcion: "" })).cliente,
    ])
      await expect(leerCotizacionPdf(Buffer.from(""), CONTEXTO, c)).rejects.toThrow(
        "No se pudo leer el PDF. Completá los datos a mano.",
      );
    vi.restoreAllMocks();
  });
});

describe("aNumero", () => {
  it("entiende los formatos habituales", () => {
    expect(aNumero(1500)).toBe(1500);
    expect(aNumero("USD 9.000")).toBe(9000);
    expect(aNumero("9.000,50")).toBe(9000.5);
    expect(aNumero("9,000.50")).toBe(9000.5);
    expect(aNumero("3,500")).toBe(3500);
    expect(aNumero("12.5")).toBe(12.5);
    expect(aNumero("10%")).toBe(10);
    expect(aNumero("1.234.567")).toBe(1234567);
    expect(aNumero("0.500")).toBe(0.5);
    expect(aNumero("0,5")).toBe(0.5);
    expect(aNumero("mil")).toBeNull();
    expect(aNumero(null)).toBeNull();
  });
});
