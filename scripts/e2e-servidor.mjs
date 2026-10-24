// Levanta la app para las E2E con su propia base (PGlite en .data/e2e), migrada y con un admin.
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const env = {
  ...process.env,
  // Vacío = PGlite. Las variables del proceso le ganan a .env.local.
  DATABASE_URL: "",
  PGLITE_DIR: ".data/e2e",
  UPLOADS_DIR: ".data/e2e-uploads",
  NEXT_DIST_DIR: ".next-e2e",
  BETTER_AUTH_URL: "http://localhost:3100",
  BETTER_AUTH_SECRET: "solo-para-e2e-no-usar-en-produccion",
  WORKER_EN_APP: "true",
  WORKER_INTERVALO_MS: "2000",
  SMTP_HOST: "",
};

rmSync(".data/e2e", { recursive: true, force: true });
rmSync(".data/e2e-uploads", { recursive: true, force: true });

function npm(args) {
  const resultado = spawnSync("npm", ["run", ...args], { env, stdio: "inherit", shell: true });
  if (resultado.status !== 0) process.exit(resultado.status ?? 1);
}

npm(["db:migrate"]);
npm(["db:seed", "--", "admin@e2e.test", '"Admin E2E"', "e2e-secreto-123"]);

const servidor = spawn("npx", ["next", "dev", "-p", "3100"], { env, stdio: "inherit", shell: true });
for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, () => servidor.kill(senal));
servidor.on("exit", (codigo) => process.exit(codigo ?? 0));
