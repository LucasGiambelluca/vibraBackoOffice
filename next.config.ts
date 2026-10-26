import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Las E2E usan otra carpeta para poder correr con `npm run dev` abierto.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Para mostrar el dev server por un túnel de ngrok.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app"],
  // El trace del standalone no tiene que arrastrar datos locales, docs ni tests.
  outputFileTracingExcludes: {
    "*": [".data/**", "docs/**", "tests/**", "e2e/**", "*.pdf", ".next-e2e/**"],
  },
  // PGlite carga WASM en runtime y nodemailer usa módulos de Node; no pasan por el bundler.
  serverExternalPackages: ["@electric-sql/pglite", "nodemailer"],
  // PDF de hasta 10 MB (src/lib/limites.ts) + margen para el multipart.
  experimental: {
    serverActions: { bodySizeLimit: "11mb" },
    // El MCP de dev escribe .next/dev/logs en cada request; en Windows Turbopack lo
    // detecta como cambio y el navegador entra en un bucle de recargas.
    mcpServer: false,
  },
  // Tailwind v4 vía loader de Turbopack (no hay postcss.config).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
