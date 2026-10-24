export async function register() {
  // En el VPS el worker es un proceso aparte (npm run worker). En desarrollo PGlite admite
  // un solo proceso, así que con WORKER_EN_APP=true corre dentro del servidor de Next.
  // Nunca durante `next build`, que también carga este archivo.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.WORKER_EN_APP === "true" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { iniciarWorkerEnApp } = await import("./worker/en-app");
    iniciarWorkerEnApp();
  }
}
