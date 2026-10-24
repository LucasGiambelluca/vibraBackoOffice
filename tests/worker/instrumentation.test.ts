import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";

const iniciarWorkerEnApp = vi.hoisted(() => vi.fn());
vi.mock("@/worker/en-app", () => ({ iniciarWorkerEnApp }));

afterEach(() => {
  vi.unstubAllEnvs();
  iniciarWorkerEnApp.mockClear();
});

describe("register", () => {
  it("con WORKER_EN_APP=true arranca el worker dentro de Next", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("WORKER_EN_APP", "true");
    await register();
    expect(iniciarWorkerEnApp).toHaveBeenCalledTimes(1);
  });

  it("no lo arranca durante next build", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("WORKER_EN_APP", "true");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    await register();
    expect(iniciarWorkerEnApp).not.toHaveBeenCalled();
  });

  it("sin WORKER_EN_APP no lo arranca", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("WORKER_EN_APP", "");
    await register();
    expect(iniciarWorkerEnApp).not.toHaveBeenCalled();
  });
});
