import { beforeEach, describe, expect, it, vi } from "vitest";
import { borrarProveedorAction } from "@/app/(app)/proveedores/actions";
import { ejecutar } from "@/app/(app)/ejecutar";
import { redirect } from "next/navigation";

// La operación se testea aparte; acá solo importa qué hace la action con el resultado.
vi.mock("@/app/(app)/ejecutar", () => ({ ejecutar: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("borrarProveedorAction", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockReset();
  });

  it("si borra, redirige a la lista desde el servidor (la página del proveedor ya no existe)", async () => {
    vi.mocked(ejecutar).mockResolvedValueOnce({ ok: true });
    await borrarProveedorAction(new FormData());
    expect(redirect).toHaveBeenCalledWith("/proveedores");
  });

  it("si falla, devuelve el error y no redirige", async () => {
    vi.mocked(ejecutar).mockResolvedValueOnce({ ok: false, error: "No se puede" });
    expect(await borrarProveedorAction(new FormData())).toEqual({ ok: false, error: "No se puede" });
    expect(redirect).not.toHaveBeenCalled();
  });
});
