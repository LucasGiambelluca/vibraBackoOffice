import { describe, expect, it } from "vitest";
import { conRestricciones, ErrorNegocio } from "@/lib/acciones";

const errorPg = (code: string) => Object.assign(new Error("query falló"), { cause: { code } });

describe("conRestricciones", () => {
  it("devuelve el resultado si no hay error", async () => {
    expect(await conRestricciones(async () => 42, {})).toBe(42);
  });

  it("traduce UNIQUE y FK al mensaje indicado", async () => {
    const unico = conRestricciones(() => Promise.reject(errorPg("23505")), { unico: "Repetido" });
    await expect(unico).rejects.toThrow(new ErrorNegocio("Repetido"));
    const fk = conRestricciones(() => Promise.reject(errorPg("23503")), { fk: "En uso" });
    await expect(fk).rejects.toThrow(new ErrorNegocio("En uso"));
  });

  it("deja pasar errores sin mensaje configurado", async () => {
    const error = errorPg("23505");
    await expect(conRestricciones(() => Promise.reject(error), { fk: "En uso" })).rejects.toBe(error);
  });
});
